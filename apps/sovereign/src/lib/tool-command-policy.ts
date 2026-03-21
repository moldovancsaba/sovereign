import type {
  ToolCallDefinition,
  ToolCallProtocolEnvelope,
  ToolCallRiskClass
} from "@/lib/tool-call-protocol";
import { deriveCoreCommandsForCall, normalizeCommandName } from "@/lib/command-access-policy";
import type { CommandAccessEntry } from "@/lib/settings-store";

const RISK_RANK: Record<ToolCallRiskClass, number> = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4
};

const DANGEROUS_SHELL_RULES: Array<{ id: string; pattern: RegExp; reason: string }> = [
  {
    id: "ROOT_DELETE_DENY",
    pattern: /\brm\s+-rf\s+\/\b/i,
    reason: "root filesystem deletion pattern"
  },
  {
    id: "DISK_FORMAT_DENY",
    pattern: /\bmkfs\b/i,
    reason: "disk format pattern"
  },
  {
    id: "RAW_DISK_WRITE_DENY",
    pattern: /\bdd\s+if=/i,
    reason: "raw disk write pattern"
  },
  {
    id: "SHUTDOWN_REBOOT_DENY",
    pattern: /\b(shutdown|reboot)\b/i,
    reason: "host shutdown/reboot pattern"
  },
  {
    id: "FORK_BOMB_DENY",
    pattern: /:\(\)\s*\{\s*:\|:\s*&\s*\}\s*;?\s*:?/i,
    reason: "fork-bomb signature"
  },
  {
    id: "PRIVILEGE_ESCALATION_DENY",
    pattern: /\bsudo\b/i,
    reason: "privilege escalation command"
  },
  {
    id: "NETWORK_PIPE_EXEC_DENY",
    pattern: /\b(curl|wget)\b[^\n|;]*\|\s*(bash|sh)\b/i,
    reason: "network download piped to shell execution"
  },
  {
    id: "REMOTE_SHELL_COPY_DENY",
    pattern: /\b(ssh|scp|sftp|telnet|ftp|rsync|nc|netcat)\b/i,
    reason: "remote shell/copy/network transport command"
  }
];

export type ToolCommandPolicyClass =
  | "CHAT_RESPONSE"
  | "FILESYSTEM_READ"
  | "FILESYSTEM_MUTATION"
  | "GIT_READ"
  | "GIT_MUTATION"
  | "SHELL_EXECUTION"
  | "UNKNOWN_TOOL";

export type ToolCommandPolicyDecision = {
  callId: string;
  tool: string;
  policyClass: ToolCommandPolicyClass;
  commandNames: string[];
  riskClass: ToolCallRiskClass;
  effectiveRiskClass: ToolCallRiskClass;
  requiresApproval: boolean;
  allowed: boolean;
  reason: string;
};

export type ToolCommandPolicyEvaluation = {
  allowed: boolean;
  requiresApproval: boolean;
  denyReason: string | null;
  approvalReason: string | null;
  highestRiskClass: ToolCallRiskClass;
  decisions: ToolCommandPolicyDecision[];
};

function maxRisk(a: ToolCallRiskClass, b: ToolCallRiskClass): ToolCallRiskClass {
  return RISK_RANK[a] >= RISK_RANK[b] ? a : b;
}

function readShellCommand(call: ToolCallDefinition): string {
  const args = call.args || {};
  const command =
    typeof args.command === "string"
      ? args.command
      : typeof args.cmd === "string"
      ? args.cmd
      : "";
  return command.trim();
}

function readCommandAccessStatus(
  call: ToolCallDefinition,
  entries: CommandAccessEntry[]
): { denied: string[]; commandNames: string[] } {
  const commandNames = deriveCoreCommandsForCall(call).map((command) =>
    normalizeCommandName(command)
  );
  const statusByCommand = new Map(
    entries.map((entry) => [normalizeCommandName(entry.command), entry.status])
  );
  const denied = commandNames.filter(
    (command) => statusByCommand.has(command) && statusByCommand.get(command) !== "APPROVED"
  );
  return { denied, commandNames };
}

function denyUnknownTool(call: ToolCallDefinition): ToolCommandPolicyDecision {
  return {
    callId: call.id,
    tool: call.tool,
    policyClass: "UNKNOWN_TOOL",
    commandNames: [],
    riskClass: call.riskClass,
    effectiveRiskClass: "CRITICAL",
    requiresApproval: true,
    allowed: false,
    reason: `Tool ${call.tool} is not allowlisted by command policy (deny-by-default).`
  };
}

function enforceExplicitApprovalDeclaration(
  call: ToolCallDefinition,
  decision: ToolCommandPolicyDecision
): ToolCommandPolicyDecision {
  if (!decision.requiresApproval) return decision;
  if (call.approval === "HUMAN_APPROVAL") return decision;
  return {
    ...decision,
    allowed: false,
    reason:
      `${decision.policyClass} denied: call.approval must be HUMAN_APPROVAL ` +
      "when policy requires approval."
  };
}

function classifyCall(
  call: ToolCallDefinition,
  commandAccessEntries: CommandAccessEntry[]
): ToolCommandPolicyDecision {
  const commandAccess = readCommandAccessStatus(call, commandAccessEntries);
  const enforcesCommandAccess = call.tool === "shell.exec";
  const base: Omit<ToolCommandPolicyDecision, "policyClass" | "allowed" | "reason"> = {
    callId: call.id,
    tool: call.tool,
    commandNames: commandAccess.commandNames,
    riskClass: call.riskClass,
    effectiveRiskClass: call.riskClass,
    requiresApproval: call.approval === "HUMAN_APPROVAL"
  };
  if (enforcesCommandAccess && commandAccess.denied.length) {
    return {
      ...base,
      policyClass: call.tool === "shell.exec" ? "SHELL_EXECUTION" : denyUnknownTool(call).policyClass,
      effectiveRiskClass: maxRisk("CRITICAL", call.riskClass),
      requiresApproval: true,
      allowed: false,
      reason:
        `Command access denied for ${commandAccess.denied.map((entry) => `"${entry}"`).join(", ")}. ` +
        "Add the command to Settings and switch it to APPROVED before execution."
    };
  }

  if (call.tool === "chat.respond") {
    const effectiveRiskClass = maxRisk("LOW", call.riskClass);
    const requiresApproval =
      base.requiresApproval || effectiveRiskClass === "HIGH" || effectiveRiskClass === "CRITICAL";
    return enforceExplicitApprovalDeclaration(call, {
      ...base,
      policyClass: "CHAT_RESPONSE",
      effectiveRiskClass,
      requiresApproval,
      allowed: true,
      reason: requiresApproval
        ? "chat.respond escalated to approval-required execution."
        : "chat.respond allowed by policy."
    });
  }

  if (/^filesystem\.(read|list|stat|search)$/.test(call.tool)) {
    const effectiveRiskClass = maxRisk("MEDIUM", call.riskClass);
    const requiresApproval =
      base.requiresApproval || effectiveRiskClass === "HIGH" || effectiveRiskClass === "CRITICAL";
    return enforceExplicitApprovalDeclaration(call, {
      ...base,
      policyClass: "FILESYSTEM_READ",
      effectiveRiskClass,
      requiresApproval,
      allowed: true,
      reason: requiresApproval
        ? "filesystem read/search escalated to approval-required execution."
        : "filesystem read/search allowed by policy."
    });
  }

  if (/^filesystem\.(write|patch|edit|delete|move|mkdir|copy)$/.test(call.tool)) {
    const effectiveRiskClass = maxRisk("HIGH", call.riskClass);
    return enforceExplicitApprovalDeclaration(call, {
      ...base,
      policyClass: "FILESYSTEM_MUTATION",
      effectiveRiskClass,
      requiresApproval: true,
      allowed: true,
      reason: "filesystem mutation allowed only with explicit approval token."
    });
  }

  if (/^git\.(status|diff|log|show|branch\.list)$/.test(call.tool)) {
    const effectiveRiskClass = maxRisk("MEDIUM", call.riskClass);
    const requiresApproval =
      base.requiresApproval || effectiveRiskClass === "HIGH" || effectiveRiskClass === "CRITICAL";
    return enforceExplicitApprovalDeclaration(call, {
      ...base,
      policyClass: "GIT_READ",
      effectiveRiskClass,
      requiresApproval,
      allowed: true,
      reason: requiresApproval
        ? "git read operation escalated to approval-required execution."
        : "git read operation allowed by policy."
    });
  }

  if (/^git\.(add|commit|push|checkout|pr\.create)$/.test(call.tool)) {
    const effectiveRiskClass = maxRisk("HIGH", call.riskClass);
    return enforceExplicitApprovalDeclaration(call, {
      ...base,
      policyClass: "GIT_MUTATION",
      effectiveRiskClass,
      requiresApproval: true,
      allowed: true,
      reason: "git mutation allowed only with explicit approval token and branch safety checks."
    });
  }

  if (call.tool === "shell.exec") {
    const command = readShellCommand(call);
    const effectiveRiskClass = maxRisk("CRITICAL", call.riskClass);
    const blockedRule = DANGEROUS_SHELL_RULES.find((rule) => rule.pattern.test(command));
    if (blockedRule) {
      return {
        ...base,
        policyClass: "SHELL_EXECUTION",
        effectiveRiskClass,
        requiresApproval: true,
        allowed: false,
        reason:
          `shell.exec denied by ${blockedRule.id}: ${blockedRule.reason} ` +
          "(deny-by-default)."
      };
    }
    return enforceExplicitApprovalDeclaration(call, {
      ...base,
      policyClass: "SHELL_EXECUTION",
      effectiveRiskClass,
      requiresApproval: true,
      allowed: true,
      reason: "shell.exec allowed only with explicit approval token and runtime safeguards."
    });
  }

  return denyUnknownTool(call);
}

export function evaluateToolCommandPolicy(
  envelope: ToolCallProtocolEnvelope,
  options?: { commandAccessEntries?: CommandAccessEntry[] }
): ToolCommandPolicyEvaluation {
  const decisions = envelope.calls.map((call) =>
    classifyCall(call, options?.commandAccessEntries || [])
  );
  const denied = decisions.find((decision) => !decision.allowed) || null;
  const approvalDecision = decisions.find((decision) => decision.requiresApproval) || null;
  const highestRiskClass = decisions.reduce<ToolCallRiskClass>(
    (acc, decision) => maxRisk(acc, decision.effectiveRiskClass),
    "LOW"
  );
  return {
    allowed: denied === null,
    requiresApproval: approvalDecision !== null,
    denyReason: denied?.reason || null,
    approvalReason: approvalDecision
      ? `Approval required by policy class ${approvalDecision.policyClass}.`
      : null,
    highestRiskClass,
    decisions
  };
}

export function summarizeToolCommandPolicyEvaluation(evaluation: ToolCommandPolicyEvaluation) {
  return {
    allowed: evaluation.allowed,
    requiresApproval: evaluation.requiresApproval,
    denyReason: evaluation.denyReason,
    approvalReason: evaluation.approvalReason,
    highestRiskClass: evaluation.highestRiskClass,
    decisions: evaluation.decisions.map((decision) => ({
      callId: decision.callId,
      tool: decision.tool,
      policyClass: decision.policyClass,
      commandNames: decision.commandNames,
      riskClass: decision.riskClass,
      effectiveRiskClass: decision.effectiveRiskClass,
      requiresApproval: decision.requiresApproval,
      allowed: decision.allowed,
      reason: decision.reason
    }))
  };
}
