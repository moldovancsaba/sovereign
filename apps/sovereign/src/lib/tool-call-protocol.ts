const TOOL_CALL_NAME_RE = /^[a-z][a-z0-9_.-]{1,63}$/;
const TOOL_CALL_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$/;
const SUPPORTED_RISK_CLASS = new Set(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
const SUPPORTED_APPROVAL = new Set(["NONE", "HUMAN_APPROVAL"]);
const SUPPORTED_MODE = new Set(["SEQUENTIAL", "PARALLEL"]);
const SUPPORTED_ARTIFACT_KIND = new Set(["LOG", "FILE", "PATCH", "ISSUE_COMMENT", "PR"]);

export const TOOL_CALL_PROTOCOL_NAME = "sovereign.tool-call";
/** @deprecated Legacy protocol id; still accepted when validating inbound envelopes. */
export const TOOL_CALL_PROTOCOL_LEGACY_NAME = "sentinelsquad.tool-call";
export const TOOL_CALL_PROTOCOL_SUPPORTED_MAJOR = 1;
export const TOOL_CALL_PROTOCOL_V1 = "1.0";

function isAcceptedToolCallProtocolName(protocol: string): boolean {
  return protocol === TOOL_CALL_PROTOCOL_NAME || protocol === TOOL_CALL_PROTOCOL_LEGACY_NAME;
}

export type ToolCallRiskClass = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type ToolCallApprovalRequirement = "NONE" | "HUMAN_APPROVAL";
export type ToolCallMode = "SEQUENTIAL" | "PARALLEL";
export type ToolCallExpectedArtifactKind = "LOG" | "FILE" | "PATCH" | "ISSUE_COMMENT" | "PR";

export type ToolCallExpectedArtifact = {
  kind: ToolCallExpectedArtifactKind;
  path: string | null;
  description: string | null;
  required: boolean;
};

export type ToolCallDefinition = {
  id: string;
  tool: string;
  args: Record<string, unknown>;
  riskClass: ToolCallRiskClass;
  approval: ToolCallApprovalRequirement;
  expectedArtifacts: ToolCallExpectedArtifact[];
};

export type ToolCallProtocolEnvelope = {
  protocol: typeof TOOL_CALL_PROTOCOL_NAME;
  version: string;
  mode: ToolCallMode;
  calls: ToolCallDefinition[];
};

type ValidationFailureCode =
  | "INVALID_TYPE"
  | "INVALID_PROTOCOL"
  | "INVALID_VERSION"
  | "INVALID_MODE"
  | "INVALID_CALLS"
  | "INVALID_CALL";

export type ToolCallProtocolValidationResult =
  | {
      present: false;
      ok: true;
      reason: "No tool-call protocol payload provided.";
    }
  | {
      present: true;
      ok: false;
      code: ValidationFailureCode;
      reason: string;
    }
  | {
      present: true;
      ok: true;
      reason: "Tool-call protocol payload is valid.";
      envelope: ToolCallProtocolEnvelope;
    };

export type ToolCallCommandParseResult =
  | { kind: "none" }
  | { kind: "invalid"; reason: string }
  | {
      kind: "tool_call";
      envelopeInput: unknown;
      approvalToken: string | null;
      dryRun: boolean;
      title: string;
    };

export type ToolCallApprovalCommandParseResult =
  | { kind: "none" }
  | { kind: "invalid"; reason: string }
  | {
      kind: "approve_tool_call";
      envelopeInput: unknown;
      ttlSeconds: number | null;
    };

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asTrimmed(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseVersion(value: string): { major: number; minor: number } | null {
  const match = /^(\d+)\.(\d+)$/.exec(value);
  if (!match) return null;
  return {
    major: Number.parseInt(match[1], 10),
    minor: Number.parseInt(match[2], 10)
  };
}

function parseExpectedArtifacts(
  value: unknown,
  callIndex: number
): { ok: true; value: ToolCallExpectedArtifact[] } | { ok: false; reason: string } {
  if (value == null) return { ok: true, value: [] };
  if (!Array.isArray(value)) {
    return {
      ok: false,
      reason: `toolCallProtocol.calls[${callIndex}].expectedArtifacts must be an array when provided.`
    };
  }
  if (value.length > 25) {
    return {
      ok: false,
      reason: `toolCallProtocol.calls[${callIndex}].expectedArtifacts must contain at most 25 items.`
    };
  }

  const normalized: ToolCallExpectedArtifact[] = [];
  for (let i = 0; i < value.length; i += 1) {
    const raw = asRecord(value[i]);
    if (!raw) {
      return {
        ok: false,
        reason: `toolCallProtocol.calls[${callIndex}].expectedArtifacts[${i}] must be an object.`
      };
    }
    const kindRaw = asTrimmed(raw.kind).toUpperCase();
    if (!SUPPORTED_ARTIFACT_KIND.has(kindRaw)) {
      return {
        ok: false,
        reason:
          `toolCallProtocol.calls[${callIndex}].expectedArtifacts[${i}].kind must be one of: ` +
          "LOG, FILE, PATCH, ISSUE_COMMENT, PR."
      };
    }
    const pathRaw = asTrimmed(raw.path);
    const descriptionRaw = asTrimmed(raw.description);
    normalized.push({
      kind: kindRaw as ToolCallExpectedArtifactKind,
      path: pathRaw || null,
      description: descriptionRaw || null,
      required: Boolean(raw.required)
    });
  }
  return { ok: true, value: normalized };
}

export function validateToolCallProtocolEnvelope(input: unknown): ToolCallProtocolValidationResult {
  if (input == null) {
    return {
      present: false,
      ok: true,
      reason: "No tool-call protocol payload provided."
    };
  }

  const record = asRecord(input);
  if (!record) {
    return {
      present: true,
      ok: false,
      code: "INVALID_TYPE",
      reason: "toolCallProtocol must be a JSON object."
    };
  }

  const protocol = asTrimmed(record.protocol);
  if (!isAcceptedToolCallProtocolName(protocol)) {
    return {
      present: true,
      ok: false,
      code: "INVALID_PROTOCOL",
      reason: `toolCallProtocol.protocol must be \"${TOOL_CALL_PROTOCOL_NAME}\" (legacy \"${TOOL_CALL_PROTOCOL_LEGACY_NAME}\" is still accepted).`
    };
  }

  const version = asTrimmed(record.version);
  const parsedVersion = parseVersion(version);
  if (!parsedVersion || parsedVersion.major !== TOOL_CALL_PROTOCOL_SUPPORTED_MAJOR) {
    return {
      present: true,
      ok: false,
      code: "INVALID_VERSION",
      reason: `toolCallProtocol.version must be ${TOOL_CALL_PROTOCOL_SUPPORTED_MAJOR}.x (for example \"${TOOL_CALL_PROTOCOL_V1}\").`
    };
  }

  const modeRaw = asTrimmed(record.mode).toUpperCase();
  const mode = (modeRaw || "SEQUENTIAL") as ToolCallMode;
  if (!SUPPORTED_MODE.has(mode)) {
    return {
      present: true,
      ok: false,
      code: "INVALID_MODE",
      reason: "toolCallProtocol.mode must be SEQUENTIAL or PARALLEL."
    };
  }

  if (!Array.isArray(record.calls)) {
    return {
      present: true,
      ok: false,
      code: "INVALID_CALLS",
      reason: "toolCallProtocol.calls must be an array."
    };
  }
  if (!record.calls.length) {
    return {
      present: true,
      ok: false,
      code: "INVALID_CALLS",
      reason: "toolCallProtocol.calls must contain at least one call."
    };
  }
  if (record.calls.length > 20) {
    return {
      present: true,
      ok: false,
      code: "INVALID_CALLS",
      reason: "toolCallProtocol.calls must contain at most 20 calls."
    };
  }

  const normalizedCalls: ToolCallDefinition[] = [];
  for (let i = 0; i < record.calls.length; i += 1) {
    const rawCall = asRecord(record.calls[i]);
    if (!rawCall) {
      return {
        present: true,
        ok: false,
        code: "INVALID_CALL",
        reason: `toolCallProtocol.calls[${i}] must be an object.`
      };
    }

    const id = asTrimmed(rawCall.id);
    if (!id || !TOOL_CALL_ID_RE.test(id)) {
      return {
        present: true,
        ok: false,
        code: "INVALID_CALL",
        reason:
          `toolCallProtocol.calls[${i}].id is required and must match ` +
          "^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$."
      };
    }

    const tool = asTrimmed(rawCall.tool);
    if (!tool || !TOOL_CALL_NAME_RE.test(tool)) {
      return {
        present: true,
        ok: false,
        code: "INVALID_CALL",
        reason:
          `toolCallProtocol.calls[${i}].tool is required and must match ` +
          "^[a-z][a-z0-9_.-]{1,63}$."
      };
    }

    const args = asRecord(rawCall.args);
    if (!args) {
      return {
        present: true,
        ok: false,
        code: "INVALID_CALL",
        reason: `toolCallProtocol.calls[${i}].args must be an object.`
      };
    }

    const riskClassRaw = asTrimmed(rawCall.riskClass).toUpperCase();
    if (!SUPPORTED_RISK_CLASS.has(riskClassRaw)) {
      return {
        present: true,
        ok: false,
        code: "INVALID_CALL",
        reason:
          `toolCallProtocol.calls[${i}].riskClass must be one of: ` +
          "LOW, MEDIUM, HIGH, CRITICAL."
      };
    }

    const approvalRaw = asTrimmed(rawCall.approval).toUpperCase();
    const approval = (approvalRaw || "NONE") as ToolCallApprovalRequirement;
    if (!SUPPORTED_APPROVAL.has(approval)) {
      return {
        present: true,
        ok: false,
        code: "INVALID_CALL",
        reason:
          `toolCallProtocol.calls[${i}].approval must be one of: ` +
          "NONE, HUMAN_APPROVAL."
      };
    }

    const artifactParse = parseExpectedArtifacts(rawCall.expectedArtifacts, i);
    if (!artifactParse.ok) {
      return {
        present: true,
        ok: false,
        code: "INVALID_CALL",
        reason: artifactParse.reason
      };
    }

    normalizedCalls.push({
      id,
      tool,
      args,
      riskClass: riskClassRaw as ToolCallRiskClass,
      approval,
      expectedArtifacts: artifactParse.value
    });
  }

  return {
    present: true,
    ok: true,
    reason: "Tool-call protocol payload is valid.",
    envelope: {
      protocol: TOOL_CALL_PROTOCOL_NAME,
      version,
      mode,
      calls: normalizedCalls
    }
  };
}

export function summarizeToolCallProtocolEnvelope(envelope: ToolCallProtocolEnvelope) {
  return {
    protocol: envelope.protocol,
    version: envelope.version,
    mode: envelope.mode,
    callCount: envelope.calls.length,
    calls: envelope.calls.map((call) => ({
      id: call.id,
      tool: call.tool,
      riskClass: call.riskClass,
      approval: call.approval,
      expectedArtifactCount: call.expectedArtifacts.length
    }))
  };
}

function unwrapJsonFence(value: string) {
  const trimmed = value.trim();
  const match = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  if (!match) return trimmed;
  return match[1].trim();
}

function parseJsonSuffix(command: string, prefix: RegExp) {
  const trimmed = command.trim();
  const withoutPrefix = trimmed.replace(prefix, "").trim();
  const rawJson = unwrapJsonFence(withoutPrefix);
  if (!rawJson) return { ok: false as const, reason: "JSON payload is required." };
  try {
    return { ok: true as const, value: JSON.parse(rawJson) as unknown };
  } catch {
    return { ok: false as const, reason: "Payload must be valid JSON." };
  }
}

export function parseToolCallCommand(command: string): ToolCallCommandParseResult {
  const trimmed = command.trim();
  if (!/^tool-call\b/i.test(trimmed)) {
    return { kind: "none" };
  }

  const parsedSuffix = parseJsonSuffix(trimmed, /^tool-call\b/i);
  if (!parsedSuffix.ok) {
    return {
      kind: "invalid",
      reason:
        parsedSuffix.reason === "JSON payload is required."
          ? "tool-call command requires a JSON payload after the prefix."
          : "tool-call command payload must be valid JSON."
    };
  }

  const parsedRecord = asRecord(parsedSuffix.value);
  let envelopeInput: unknown = parsedSuffix.value;
  let approvalToken: string | null = null;
  let dryRun = false;
  if (parsedRecord) {
    if (parsedRecord.toolCallProtocol != null) {
      envelopeInput = parsedRecord.toolCallProtocol;
    }
    const approvalTokenRaw = asTrimmed(parsedRecord.approvalToken);
    approvalToken = approvalTokenRaw || null;
    if (typeof parsedRecord.dryRun === "boolean") {
      dryRun = parsedRecord.dryRun;
    } else {
      const policy = asRecord(parsedRecord.toolCallPolicy);
      dryRun = Boolean(policy?.dryRun);
    }
  }

  return {
    kind: "tool_call",
    envelopeInput,
    approvalToken,
    dryRun,
    title: "Execute structured tool-call payload."
  };
}

export function parseToolCallApprovalRequestCommand(
  command: string
): ToolCallApprovalCommandParseResult {
  const trimmed = command.trim();
  if (!/^approve-tool-call\b/i.test(trimmed)) {
    return { kind: "none" };
  }

  const parsedSuffix = parseJsonSuffix(trimmed, /^approve-tool-call\b/i);
  if (!parsedSuffix.ok) {
    return {
      kind: "invalid",
      reason:
        parsedSuffix.reason === "JSON payload is required."
          ? "approve-tool-call command requires a JSON payload after the prefix."
          : "approve-tool-call payload must be valid JSON."
    };
  }

  const parsedRecord = asRecord(parsedSuffix.value);
  let envelopeInput: unknown = parsedSuffix.value;
  let ttlSeconds: number | null = null;
  if (parsedRecord) {
    if (parsedRecord.toolCallProtocol != null) {
      envelopeInput = parsedRecord.toolCallProtocol;
    }
    if (typeof parsedRecord.ttlSeconds === "number" && Number.isFinite(parsedRecord.ttlSeconds)) {
      ttlSeconds = Math.min(Math.max(Math.trunc(parsedRecord.ttlSeconds), 30), 3600);
    }
  }
  return {
    kind: "approve_tool_call",
    envelopeInput,
    ttlSeconds
  };
}
