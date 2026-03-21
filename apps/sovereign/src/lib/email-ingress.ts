import { createMessage, getOrCreateThread } from "@/lib/chat";
import { parseAgentMention } from "@/lib/mentions";
import { prisma } from "@/lib/prisma";
import { enqueueTask } from "@/lib/tasks";

type IngressStatus =
  | "RECEIVED"
  | "BLOCKED"
  | "ENQUEUED"
  | "RETRY_SCHEDULED"
  | "DEAD_LETTER";

type SenderAuthResult = {
  allowed: boolean;
  reason: string;
};

export type InboundEmailPayload = {
  channel?: string;
  messageId?: string | null;
  from?: {
    email?: string | null;
    name?: string | null;
  } | null;
  subject?: string | null;
  text?: string | null;
  issueNumber?: number | null;
  agentKey?: string | null;
  command?: string | null;
  metadata?: unknown;
};

class IngressError extends Error {
  code: string;
  retryable: boolean;

  constructor(code: string, message: string, retryable: boolean) {
    super(message);
    this.code = code;
    this.retryable = retryable;
    this.name = "IngressError";
  }
}

function normalizeEmail(input: string) {
  return String(input || "").trim().toLowerCase();
}

function parseAddressList(raw: string | undefined) {
  if (!raw) return new Set<string>();
  return new Set(
    raw
      .split(",")
      .map((value) => normalizeEmail(value))
      .filter(Boolean)
  );
}

function isTruthy(value: string | undefined, fallback = false) {
  if (value === undefined) return fallback;
  const normalized = String(value).trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function resolveSenderAuth(senderEmail: string): SenderAuthResult {
  const blocked = parseAddressList(
    process.env.SOVEREIGN_EMAIL_BLOCKED_SENDERS || process.env.SENTINELSQUAD_EMAIL_BLOCKED_SENDERS
  );
  const trusted = parseAddressList(
    process.env.SOVEREIGN_EMAIL_TRUSTED_SENDERS || process.env.SENTINELSQUAD_EMAIL_TRUSTED_SENDERS
  );
  const requireTrusted = isTruthy(
    process.env.SOVEREIGN_EMAIL_REQUIRE_TRUSTED || process.env.SENTINELSQUAD_EMAIL_REQUIRE_TRUSTED,
    true
  );
  const email = normalizeEmail(senderEmail);

  if (!email) {
    return { allowed: false, reason: "Sender email is missing." };
  }
  if (blocked.has(email)) {
    return { allowed: false, reason: "Sender is blocked by SENTINELSQUAD_EMAIL_BLOCKED_SENDERS." };
  }
  if (requireTrusted && !trusted.has(email)) {
    return {
      allowed: false,
      reason: "Sender is not in SOVEREIGN_EMAIL_TRUSTED_SENDERS (or legacy SENTINELSQUAD_*)."
    };
  }
  return { allowed: true, reason: "Sender is authorized for email ingress." };
}

function clampInt(value: string | undefined, fallback: number, min: number, max: number) {
  const parsed = Number(value ?? "");
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.trunc(parsed), min), max);
}

function computeRetryDelayMs(attempt: number) {
  const base = clampInt(
    process.env.SOVEREIGN_EMAIL_RETRY_BASE_MS || process.env.SENTINELSQUAD_EMAIL_RETRY_BASE_MS,
    1_000,
    100,
    60_000
  );
  const max = clampInt(
    process.env.SOVEREIGN_EMAIL_RETRY_MAX_MS || process.env.SENTINELSQUAD_EMAIL_RETRY_MAX_MS,
    15_000,
    base,
    300_000
  );
  return Math.min(base * 2 ** Math.max(attempt - 1, 0), max);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function firstMentionCandidate(subject: string, bodyText: string) {
  const subjectLine = String(subject || "").trim();
  if (subjectLine.startsWith("@")) return subjectLine;
  for (const line of String(bodyText || "").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("@")) return trimmed;
  }
  return "";
}

async function ensureEmailIntakeAgentKey() {
  const preferred = "EmailIntake";
  const existing = await prisma.agent.findFirst({
    where: { key: { equals: preferred, mode: "insensitive" } },
    select: { key: true }
  });
  if (existing?.key) return existing.key;
  const created = await prisma.agent.create({
    data: {
      key: preferred,
      displayName: "Email Intake",
      runtime: "MANUAL",
      readiness: "NOT_READY",
      enabled: true
    },
    select: { key: true }
  });
  return created.key;
}

function normalizePayload(input: InboundEmailPayload) {
  const channel = String(input.channel || "email").trim().toLowerCase();
  if (channel !== "email") {
    throw new IngressError(
      "INVALID_CHANNEL",
      `Unsupported external ingress channel "${channel}". Only "email" is allowed in MVP.`,
      false
    );
  }

  const senderEmail = normalizeEmail(input.from?.email || "");
  const senderName = String(input.from?.name || "").trim() || null;
  const subject = String(input.subject || "").trim();
  const bodyText = String(input.text || "").trim();
  if (!senderEmail) {
    throw new IngressError("INVALID_PAYLOAD", "Missing sender email.", false);
  }
  if (!subject && !bodyText) {
    throw new IngressError("INVALID_PAYLOAD", "Email payload has no subject/body.", false);
  }

  return {
    channel,
    externalMessageId: String(input.messageId || "").trim() || null,
    senderEmail,
    senderName,
    subject: subject || "(no subject)",
    bodyText: bodyText || "(empty body)",
    issueNumber:
      typeof input.issueNumber === "number" && Number.isFinite(input.issueNumber)
        ? Math.trunc(input.issueNumber)
        : null,
    explicitAgentKey: String(input.agentKey || "").trim() || null,
    explicitCommand: String(input.command || "").trim() || null,
    metadata: input.metadata ?? null
  };
}

async function resolveTargetTask(normalized: ReturnType<typeof normalizePayload>) {
  if (normalized.explicitAgentKey && normalized.explicitCommand) {
    return {
      requestedAgentKey: normalized.explicitAgentKey,
      title: normalized.explicitCommand
    };
  }

  const mentionCandidate = firstMentionCandidate(normalized.subject, normalized.bodyText);
  if (mentionCandidate) {
    const parsed = parseAgentMention(mentionCandidate);
    if (parsed.kind === "agent") {
      return {
        requestedAgentKey: parsed.agentKey,
        title: parsed.command
      };
    }
  }

  return {
    requestedAgentKey: await ensureEmailIntakeAgentKey(),
    title: `Email triage: ${normalized.subject}`
  };
}

function classifyIngressFailure(error: unknown) {
  if (error instanceof IngressError) {
    return {
      code: error.code,
      retryable: error.retryable,
      message: error.message
    };
  }
  const message = error instanceof Error ? error.message : String(error);
  if (/timeout|timed out|econnrefused|network|fetch/i.test(message)) {
    return {
      code: "PIPELINE_TRANSIENT",
      retryable: true,
      message
    };
  }
  return {
    code: "PIPELINE_FAILURE",
    retryable: false,
    message
  };
}

export async function handleInboundEmail(payload: InboundEmailPayload) {
  const normalized = normalizePayload(payload);
  const senderAuth = resolveSenderAuth(normalized.senderEmail);
  const maxAttempts = clampInt(process.env.SENTINELSQUAD_EMAIL_RETRY_MAX_ATTEMPTS, 3, 1, 10);

  const existing = normalized.externalMessageId
    ? await prisma.inboundEmailEvent.findUnique({
        where: { externalMessageId: normalized.externalMessageId }
      })
    : null;
  if (existing?.status === "ENQUEUED") {
    return {
      accepted: true,
      status: "ENQUEUED" as const,
      eventId: existing.id,
      reason: "Duplicate message id already processed."
    };
  }

  const event = existing
    ? await prisma.inboundEmailEvent.update({
        where: { id: existing.id },
        data: {
          senderEmail: normalized.senderEmail,
          senderName: normalized.senderName,
          subject: normalized.subject,
          bodyText: normalized.bodyText,
          authorized: senderAuth.allowed,
          authorizationReason: senderAuth.reason,
          status: "RECEIVED",
          maxAttempts,
          lastFailureCode: null,
          lastFailureMessage: null,
          nextAttemptAt: null,
          meta: {
            issueNumber: normalized.issueNumber,
            metadata: normalized.metadata
          }
        }
      })
    : await prisma.inboundEmailEvent.create({
        data: {
          externalMessageId: normalized.externalMessageId,
          channel: "email",
          senderEmail: normalized.senderEmail,
          senderName: normalized.senderName,
          subject: normalized.subject,
          bodyText: normalized.bodyText,
          authorized: senderAuth.allowed,
          authorizationReason: senderAuth.reason,
          status: "RECEIVED",
          maxAttempts,
          meta: {
            issueNumber: normalized.issueNumber,
            metadata: normalized.metadata
          }
        }
      });

  if (!senderAuth.allowed) {
    await prisma.inboundEmailEvent.update({
      where: { id: event.id },
      data: {
        status: "BLOCKED",
        lastFailureCode: "SENDER_NOT_AUTHORIZED",
        lastFailureMessage: senderAuth.reason
      }
    });
    return {
      accepted: false,
      status: "BLOCKED" as const,
      eventId: event.id,
      reason: senderAuth.reason
    };
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const thread = await getOrCreateThread({
        kind: "GLOBAL",
        ref: "email-inbox",
        title: "Email Ingress Inbox",
        createdById: null
      });

      await createMessage({
        threadId: thread.id,
        authorType: "HUMAN",
        content: `Email from ${normalized.senderEmail}\nSubject: ${normalized.subject}\n\n${normalized.bodyText}`,
        meta: {
          kind: "email_ingress_message",
          inboundEventId: event.id,
          senderEmail: normalized.senderEmail,
          senderName: normalized.senderName,
          issueNumber: normalized.issueNumber
        }
      });

      const targetTask = await resolveTargetTask(normalized);
      const knownAgent = await prisma.agent.findFirst({
        where: { key: { equals: targetTask.requestedAgentKey, mode: "insensitive" } },
        select: { key: true }
      });
      const resolvedAgentKey = knownAgent?.key || (await ensureEmailIntakeAgentKey());
      const task = await enqueueTask({
        agentKey: resolvedAgentKey,
        title: targetTask.title,
        issueNumber: normalized.issueNumber ?? undefined,
        threadId: thread.id,
        createdByEmail: normalized.senderEmail,
        payload: {
          kind: "email_ingress_task",
          inboundEventId: event.id,
          senderEmail: normalized.senderEmail,
          senderName: normalized.senderName,
          subject: normalized.subject,
          requestedAgentKey: targetTask.requestedAgentKey
        }
      });

      await prisma.inboundEmailEvent.update({
        where: { id: event.id },
        data: {
          status: "ENQUEUED",
          attemptCount: attempt,
          threadId: thread.id,
          taskId: task.id,
          nextAttemptAt: null,
          lastFailureCode: null,
          lastFailureMessage: null
        }
      });

      return {
        accepted: true,
        status: "ENQUEUED" as const,
        eventId: event.id,
        threadId: thread.id,
        taskId: task.id,
        reason: "Email ingress normalized and task recorded."
      };
    } catch (error) {
      const failure = classifyIngressFailure(error);
      const willRetry = failure.retryable && attempt < maxAttempts;
      if (willRetry) {
        const delayMs = computeRetryDelayMs(attempt);
        const nextAttemptAt = new Date(Date.now() + delayMs);
        await prisma.inboundEmailEvent.update({
          where: { id: event.id },
          data: {
            status: "RETRY_SCHEDULED",
            attemptCount: attempt,
            nextAttemptAt,
            lastFailureCode: failure.code,
            lastFailureMessage: failure.message
          }
        });
        await sleep(delayMs);
        continue;
      }

      await prisma.inboundEmailEvent.update({
        where: { id: event.id },
        data: {
          status: "DEAD_LETTER",
          attemptCount: attempt,
          nextAttemptAt: null,
          lastFailureCode: failure.code,
          lastFailureMessage: failure.message
        }
      });
      return {
        accepted: false,
        status: "DEAD_LETTER" as const,
        eventId: event.id,
        reason: `[${failure.code}] ${failure.message}`
      };
    }
  }

  await prisma.inboundEmailEvent.update({
    where: { id: event.id },
    data: {
      status: "DEAD_LETTER",
      lastFailureCode: "PIPELINE_EXHAUSTED",
      lastFailureMessage: "Ingress retry loop exited without success."
    }
  });
  return {
    accepted: false,
    status: "DEAD_LETTER" as IngressStatus,
    eventId: event.id,
    reason: "Ingress retry loop exhausted."
  };
}
