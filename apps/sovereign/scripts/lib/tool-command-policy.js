const RISK_RANK = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4
};

const DANGEROUS_SHELL_RULES = [
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

function normalizeToken(input) {
  return String(input || "")
    .trim()
    .replace(/^['"`]+|['"`]+$/g, "")
    .replace(/^[({[]+|[)\]}]+$/g, "");
}

function normalizeCommandName(input) {
  return normalizeToken(input)
    .replace(/^.*\//, "")
    .toLowerCase();
}

function firstExecutableToken(segment) {
  const tokens = String(segment || "")
    .split(/\s+/)
    .map((token) => normalizeToken(token))
    .filter(Boolean);
  if (!tokens.length) return "";
  let index = 0;
  while (index < tokens.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[index])) index += 1;
  while (
    index < tokens.length &&
    ["command", "builtin", "env", "nohup", "time"].includes(tokens[index].toLowerCase())
  ) {
    index += 1;
    while (index < tokens.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[index])) index += 1;
  }
  return index < tokens.length ? normalizeCommandName(tokens[index]) : "";
}

function deriveCoreCommandsForCall(call) {
  if (call.tool === "shell.exec") {
    const command = readShellCommand(call);
    const parts = command
      .split(/[\n;&|]+/)
      .map((part) => part.trim())
      .filter(Boolean);
    return Array.from(
      new Set(
        parts
          .map((part) => firstExecutableToken(part))
          .filter(Boolean)
      )
    );
  }

  const filesystemMap = {
    "filesystem.read": ["cat"],
    "filesystem.list": ["ls"],
    "filesystem.search": ["find"],
    "filesystem.stat": ["stat"],
    "filesystem.write": ["write"],
    "filesystem.patch": ["patch"],
    "filesystem.edit": ["edit"],
    "filesystem.delete": ["rm"],
    "filesystem.move": ["mv"],
    "filesystem.mkdir": ["mkdir"],
    "filesystem.copy": ["cp"]
  };
  if (filesystemMap[call.tool]) return filesystemMap[call.tool];
  if (call.tool === "git.pr.create") return ["gh"];
  if (String(call.tool || "").startsWith("git.")) return ["git"];
  if (String(call.tool || "").startsWith("backlog.")) return [];
  if (String(call.tool || "").startsWith("memory.")) return [];
  return [];
}

function readCommandAccessStatus(call, entries) {
  const commandNames = deriveCoreCommandsForCall(call).map((command) =>
    normalizeCommandName(command)
  );
  const statusByCommand = new Map(
    (Array.isArray(entries) ? entries : []).map((entry) => [
      normalizeCommandName(entry.command),
      entry.status
    ])
  );
  const denied = commandNames.filter(
    (command) => statusByCommand.has(command) && statusByCommand.get(command) !== "APPROVED"
  );
  return { denied, commandNames };
}

function maxRisk(a, b) {
  return RISK_RANK[a] >= RISK_RANK[b] ? a : b;
}

function readShellCommand(call) {
  const args = call?.args && typeof call.args === "object" ? call.args : {};
  const command =
    typeof args.command === "string"
      ? args.command
      : typeof args.cmd === "string"
      ? args.cmd
      : "";
  return String(command || "").trim();
}

function denyUnknownTool(call) {
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

function enforceExplicitApprovalDeclaration(call, decision) {
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

function classifyCall(call, commandAccessEntries) {
  const commandAccess = readCommandAccessStatus(call, commandAccessEntries);
  const enforcesCommandAccess = call.tool === "shell.exec";
  const base = {
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
      policyClass: call.tool === "shell.exec" ? "SHELL_EXECUTION" : "UNKNOWN_TOOL",
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

  if (String(call.tool || "").startsWith("backlog.")) {
    const effectiveRiskClass = maxRisk("LOW", call.riskClass);
    const requiresApproval =
      base.requiresApproval || effectiveRiskClass === "HIGH" || effectiveRiskClass === "CRITICAL";
    return enforceExplicitApprovalDeclaration(call, {
      ...base,
      policyClass: "BACKLOG",
      effectiveRiskClass,
      requiresApproval,
      allowed: true,
      reason: requiresApproval
        ? "backlog operation escalated to approval-required execution."
        : "backlog operation allowed by policy (PO/agent backlog management)."
    });
  }

  if (String(call.tool || "").startsWith("memory.")) {
    const effectiveRiskClass = maxRisk("LOW", call.riskClass);
    const requiresApproval =
      base.requiresApproval || effectiveRiskClass === "HIGH" || effectiveRiskClass === "CRITICAL";
    return enforceExplicitApprovalDeclaration(call, {
      ...base,
      policyClass: "PROJECT_MEMORY",
      effectiveRiskClass,
      requiresApproval,
      allowed: true,
      reason: requiresApproval
        ? "memory operation escalated to approval-required execution."
        : "memory operation allowed by policy (read/search project memory)."
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

function evaluateToolCommandPolicy(envelope, options = {}) {
  const decisions = Array.isArray(envelope?.calls)
    ? envelope.calls.map((call) => classifyCall(call, options.commandAccessEntries || []))
    : [];
  const denied = decisions.find((decision) => !decision.allowed) || null;
  const approvalDecision = decisions.find((decision) => decision.requiresApproval) || null;
  const highestRiskClass = decisions.reduce(
    (acc, decision) => maxRisk(acc, decision.effectiveRiskClass),
    "LOW"
  );
  return {
    allowed: denied === null,
    requiresApproval: approvalDecision !== null,
    denyReason: denied ? denied.reason : null,
    approvalReason: approvalDecision
      ? `Approval required by policy class ${approvalDecision.policyClass}.`
      : null,
    highestRiskClass,
    decisions
  };
}

function summarizeToolCommandPolicyEvaluation(evaluation) {
  return {
    allowed: evaluation.allowed,
    requiresApproval: evaluation.requiresApproval,
    denyReason: evaluation.denyReason,
    approvalReason: evaluation.approvalReason,
    highestRiskClass: evaluation.highestRiskClass,
    decisions: (evaluation.decisions || []).map((decision) => ({
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

module.exports = {
  evaluateToolCommandPolicy,
  summarizeToolCommandPolicyEvaluation
};
