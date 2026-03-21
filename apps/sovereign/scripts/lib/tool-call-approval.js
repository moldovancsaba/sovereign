const crypto = require("node:crypto");

const TOKEN_PREFIX = "wrtoa1";

function readSecret(explicit) {
  const secret = String(
    explicit ||
      process.env.SOVEREIGN_TOOL_APPROVAL_SECRET ||
      process.env.SENTINELSQUAD_TOOL_APPROVAL_SECRET ||
      process.env.NEXTAUTH_SECRET ||
      ""
  ).trim();
  if (!secret) {
    throw new Error(
      "Tool approval secret is not configured. Set SOVEREIGN_TOOL_APPROVAL_SECRET (or legacy SENTINELSQUAD_TOOL_APPROVAL_SECRET or NEXTAUTH_SECRET)."
    );
  }
  return secret;
}

function base64UrlEncode(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(input) {
  const normalized = String(input || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "===".slice((normalized.length + 3) % 4);
  return Buffer.from(padded, "base64");
}

function stableJson(value) {
  if (value == null) return "null";
  if (typeof value === "number" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(",")}]`;
  if (typeof value === "object") {
    const record = value;
    const keys = Object.keys(record).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(String(value));
}

function signPayload(payloadPart, secret) {
  return base64UrlEncode(crypto.createHmac("sha256", secret).update(payloadPart).digest());
}

function buildToolCallActionFingerprint(envelope) {
  const canonical = {
    protocol: envelope.protocol,
    version: envelope.version,
    mode: envelope.mode,
    calls: (envelope.calls || []).map((call) => ({
      id: call.id,
      tool: call.tool,
      args: call.args,
      riskClass: call.riskClass,
      approval: call.approval,
      expectedArtifacts: call.expectedArtifacts
    }))
  };
  return crypto.createHash("sha256").update(stableJson(canonical)).digest("hex");
}

function verifyToolCallApprovalToken(params) {
  const token = String(params?.token || "").trim();
  if (!token) {
    return { ok: false, code: "TOKEN_MISSING", reason: "Approval token is required.", tokenId: null };
  }
  const expectedActionFingerprint = String(params?.expectedActionFingerprint || "").trim();
  if (!expectedActionFingerprint) {
    return {
      ok: false,
      code: "FINGERPRINT_MISSING",
      reason: "Expected action fingerprint is required for approval verification.",
      tokenId: null
    };
  }
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== TOKEN_PREFIX) {
    return {
      ok: false,
      code: "TOKEN_FORMAT_INVALID",
      reason: "Approval token format is invalid.",
      tokenId: null
    };
  }

  const payloadPart = parts[1];
  const signaturePart = parts[2];
  let payload = null;
  try {
    payload = JSON.parse(base64UrlDecode(payloadPart).toString("utf8"));
  } catch {
    return {
      ok: false,
      code: "TOKEN_PAYLOAD_INVALID",
      reason: "Approval token payload cannot be decoded.",
      tokenId: null
    };
  }
  if (!payload || payload.v !== 1 || !payload.tokenId || !payload.approverUserId) {
    return {
      ok: false,
      code: "TOKEN_FIELDS_INVALID",
      reason: "Approval token payload is missing required fields.",
      tokenId: payload?.tokenId || null
    };
  }

  const expectedSignature = signPayload(payloadPart, readSecret(params?.secret));
  if (signaturePart !== expectedSignature) {
    return {
      ok: false,
      code: "TOKEN_SIGNATURE_INVALID",
      reason: "Approval token signature is invalid.",
      tokenId: payload.tokenId
    };
  }

  if (payload.actionFingerprint !== expectedActionFingerprint) {
    return {
      ok: false,
      code: "TOKEN_FINGERPRINT_MISMATCH",
      reason: "Approval token does not match the target action fingerprint.",
      tokenId: payload.tokenId
    };
  }

  const now = params?.now instanceof Date ? params.now : new Date();
  const expiresAtMs = Date.parse(payload.expiresAt);
  if (!Number.isFinite(expiresAtMs) || now.getTime() > expiresAtMs) {
    return {
      ok: false,
      code: "TOKEN_EXPIRED",
      reason: "Approval token has expired.",
      tokenId: payload.tokenId
    };
  }

  return { ok: true, payload };
}

module.exports = {
  buildToolCallActionFingerprint,
  verifyToolCallApprovalToken
};
