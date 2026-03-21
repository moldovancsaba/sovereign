const TOOL_CALL_NAME_RE = /^[a-z][a-z0-9_.-]{1,63}$/;
const TOOL_CALL_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$/;
const SUPPORTED_RISK_CLASS = new Set(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
const SUPPORTED_APPROVAL = new Set(["NONE", "HUMAN_APPROVAL"]);
const SUPPORTED_MODE = new Set(["SEQUENTIAL", "PARALLEL"]);
const SUPPORTED_ARTIFACT_KIND = new Set(["LOG", "FILE", "PATCH", "ISSUE_COMMENT", "PR"]);

const TOOL_CALL_PROTOCOL_NAME = "sovereign.tool-call";
const TOOL_CALL_PROTOCOL_LEGACY_NAME = "sentinelsquad.tool-call";
const TOOL_CALL_PROTOCOL_SUPPORTED_MAJOR = 1;
const TOOL_CALL_PROTOCOL_V1 = "1.0";

function isAcceptedToolCallProtocolName(protocol) {
  return protocol === TOOL_CALL_PROTOCOL_NAME || protocol === TOOL_CALL_PROTOCOL_LEGACY_NAME;
}

function asRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value;
}

function asTrimmed(value) {
  return typeof value === "string" ? value.trim() : "";
}

function parseVersion(value) {
  const match = /^(\d+)\.(\d+)$/.exec(value);
  if (!match) return null;
  return {
    major: Number.parseInt(match[1], 10),
    minor: Number.parseInt(match[2], 10)
  };
}

function parseExpectedArtifacts(value, callIndex) {
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

  const normalized = [];
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
    const path = asTrimmed(raw.path);
    const description = asTrimmed(raw.description);
    normalized.push({
      kind: kindRaw,
      path: path || null,
      description: description || null,
      required: Boolean(raw.required)
    });
  }
  return { ok: true, value: normalized };
}

function validateToolCallProtocolEnvelope(input) {
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
      reason: `toolCallProtocol.protocol must be "${TOOL_CALL_PROTOCOL_NAME}" (legacy "${TOOL_CALL_PROTOCOL_LEGACY_NAME}" accepted).`
    };
  }

  const version = asTrimmed(record.version);
  const parsedVersion = parseVersion(version);
  if (!parsedVersion || parsedVersion.major !== TOOL_CALL_PROTOCOL_SUPPORTED_MAJOR) {
    return {
      present: true,
      ok: false,
      code: "INVALID_VERSION",
      reason: `toolCallProtocol.version must be ${TOOL_CALL_PROTOCOL_SUPPORTED_MAJOR}.x (for example "${TOOL_CALL_PROTOCOL_V1}").`
    };
  }

  const modeRaw = asTrimmed(record.mode).toUpperCase();
  const mode = modeRaw || "SEQUENTIAL";
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

  const normalizedCalls = [];
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
    const approval = approvalRaw || "NONE";
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
      riskClass: riskClassRaw,
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

function summarizeToolCallProtocolEnvelope(envelope) {
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
      expectedArtifactCount: Array.isArray(call.expectedArtifacts)
        ? call.expectedArtifacts.length
        : 0
    }))
  };
}

module.exports = {
  TOOL_CALL_PROTOCOL_NAME,
  TOOL_CALL_PROTOCOL_SUPPORTED_MAJOR,
  TOOL_CALL_PROTOCOL_V1,
  validateToolCallProtocolEnvelope,
  summarizeToolCallProtocolEnvelope
};
