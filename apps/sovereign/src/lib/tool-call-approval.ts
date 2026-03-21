import crypto from "node:crypto";
import type { ToolCallProtocolEnvelope } from "@/lib/tool-call-protocol";

const TOKEN_PREFIX = "wrtoa1";
const DEFAULT_TTL_SECONDS = 10 * 60;

type TokenPayload = {
  v: 1;
  tokenId: string;
  approverUserId: string;
  approverEmail: string | null;
  actionFingerprint: string;
  issuedAt: string;
  expiresAt: string;
};

export type CreateToolCallApprovalTokenParams = {
  approverUserId: string;
  approverEmail?: string | null;
  actionFingerprint: string;
  ttlSeconds?: number;
  now?: Date;
  secret?: string;
};

export type VerifyToolCallApprovalTokenResult =
  | { ok: true; payload: TokenPayload }
  | { ok: false; code: string; reason: string; tokenId: string | null };

function readSecret(explicit?: string): string {
  const secret =
    (
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

function base64UrlEncode(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(input: string): Buffer {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "===".slice((normalized.length + 3) % 4);
  return Buffer.from(padded, "base64");
}

function stableJson(value: unknown): string {
  if (value == null) return "null";
  if (typeof value === "number" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(",")}]`;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(String(value));
}

function signPayload(payloadPart: string, secret: string) {
  return base64UrlEncode(crypto.createHmac("sha256", secret).update(payloadPart).digest());
}

export function buildToolCallActionFingerprint(envelope: ToolCallProtocolEnvelope) {
  const canonical = {
    protocol: envelope.protocol,
    version: envelope.version,
    mode: envelope.mode,
    calls: envelope.calls.map((call) => ({
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

export function createToolCallApprovalToken(params: CreateToolCallApprovalTokenParams) {
  const approverUserId = String(params.approverUserId || "").trim();
  const actionFingerprint = String(params.actionFingerprint || "").trim();
  if (!approverUserId) {
    throw new Error("approverUserId is required for tool-call approval token.");
  }
  if (!actionFingerprint) {
    throw new Error("actionFingerprint is required for tool-call approval token.");
  }
  const now = params.now ?? new Date();
  const ttlSeconds = Math.min(Math.max(Math.trunc(params.ttlSeconds ?? DEFAULT_TTL_SECONDS), 30), 3600);
  const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);
  const payload: TokenPayload = {
    v: 1,
    tokenId: crypto.randomUUID(),
    approverUserId,
    approverEmail: params.approverEmail?.trim() || null,
    actionFingerprint,
    issuedAt: now.toISOString(),
    expiresAt: expiresAt.toISOString()
  };
  const payloadPart = base64UrlEncode(JSON.stringify(payload));
  const signature = signPayload(payloadPart, readSecret(params.secret));
  return {
    token: `${TOKEN_PREFIX}.${payloadPart}.${signature}`,
    expiresAt: payload.expiresAt,
    tokenId: payload.tokenId
  };
}

export function verifyToolCallApprovalToken(params: {
  token: string;
  expectedActionFingerprint: string;
  now?: Date;
  secret?: string;
}): VerifyToolCallApprovalTokenResult {
  const token = String(params.token || "").trim();
  if (!token) {
    return { ok: false, code: "TOKEN_MISSING", reason: "Approval token is required.", tokenId: null };
  }
  const expectedActionFingerprint = String(params.expectedActionFingerprint || "").trim();
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
  let payload: TokenPayload | null = null;
  try {
    payload = JSON.parse(base64UrlDecode(payloadPart).toString("utf8")) as TokenPayload;
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

  const expectedSignature = signPayload(payloadPart, readSecret(params.secret));
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

  const now = params.now ?? new Date();
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
