import { prisma } from "@/lib/prisma";
import { evaluateTaskTransition, recordLifecycleAudit } from "@/lib/lifecycle-policy";
import { recordTaskPromptPackageInvariant } from "@/lib/prompt-package-invariants";
import type { Prisma } from "@prisma/client";
import crypto from "node:crypto";

type FailureDb = Prisma.TransactionClient | typeof prisma;

export type AlphaFailureClass =
  | "LEASE_AUTHORITY_UNAVAILABLE"
  | "CONTEXT_GUARDRAIL_BLOCKED"
  | "CONTEXT_GUARDRAIL_WARNING"
  | "STALE_RUNNING_DETECTED"
  | "EXECUTION_RETRY_EXHAUSTED";

export type AlphaFailureDecision = {
  failureClass: AlphaFailureClass;
  severity: "LOW" | "MEDIUM" | "HIGH";
  fallbackAction: "ALERT_ONLY" | "MANUAL_REQUIRED" | "REQUEUE" | "DEAD_LETTER";
  remediation: string;
};

const FAILURE_DECISIONS: Record<AlphaFailureClass, AlphaFailureDecision> = {
  LEASE_AUTHORITY_UNAVAILABLE: {
    failureClass: "LEASE_AUTHORITY_UNAVAILABLE",
    severity: "HIGH",
    fallbackAction: "MANUAL_REQUIRED",
    remediation:
      "Restore active ALPHA lease ownership (start/recover ALPHA worker) before resuming autonomous queue expansion."
  },
  CONTEXT_GUARDRAIL_BLOCKED: {
    failureClass: "CONTEXT_GUARDRAIL_BLOCKED",
    severity: "MEDIUM",
    fallbackAction: "MANUAL_REQUIRED",
    remediation:
      "Record valid handover package + continuation prompt, or set bounded audited override when policy allows."
  },
  CONTEXT_GUARDRAIL_WARNING: {
    failureClass: "CONTEXT_GUARDRAIL_WARNING",
    severity: "LOW",
    fallbackAction: "ALERT_ONLY",
    remediation:
      "Prepare handover package now to avoid scope-expansion block at 70% context usage."
  },
  STALE_RUNNING_DETECTED: {
    failureClass: "STALE_RUNNING_DETECTED",
    severity: "MEDIUM",
    fallbackAction: "REQUEUE",
    remediation:
      "Inspect stale-running task owner and verify orchestrator recovery path before retrying."
  },
  EXECUTION_RETRY_EXHAUSTED: {
    failureClass: "EXECUTION_RETRY_EXHAUSTED",
    severity: "HIGH",
    fallbackAction: "DEAD_LETTER",
    remediation:
      "Review dead-letter diagnostics and convert to manual-required remediation task when needed."
  }
};

export function getAlphaFailureDecision(failureClass: AlphaFailureClass): AlphaFailureDecision {
  return FAILURE_DECISIONS[failureClass];
}

export async function recordAlphaFailureEvent(params: {
  failureClass: AlphaFailureClass;
  projectKey?: string | null;
  projectName?: string | null;
  issueNumber?: number | null;
  taskId?: string | null;
  threadId?: string | null;
  leaseHealth?: string | null;
  contextWindowId?: string | null;
  metadata?: Prisma.InputJsonValue;
  db?: FailureDb;
}) {
  const db = params.db ?? prisma;
  const decision = getAlphaFailureDecision(params.failureClass);
  return db.alphaFailureEvent.create({
    data: {
      failureClass: decision.failureClass,
      severity: decision.severity,
      fallbackAction: decision.fallbackAction,
      projectKey: params.projectKey ?? null,
      projectName: params.projectName ?? null,
      issueNumber: params.issueNumber ?? null,
      taskId: params.taskId ?? null,
      threadId: params.threadId ?? null,
      leaseHealth: params.leaseHealth ?? null,
      contextWindowId: params.contextWindowId ?? null,
      remediation: decision.remediation,
      metadata: params.metadata
    }
  });
}

export async function enqueueManualFallbackTask(params: {
  agentKey: string;
  title: string;
  issueNumber?: number;
  threadId?: string;
  createdById?: string | null;
  createdByEmail?: string | null;
  reason: string;
  failureClass: AlphaFailureClass;
  projectKey?: string | null;
  projectName?: string | null;
  metadata?: Prisma.InputJsonValue;
}) {
  return prisma.$transaction(async (tx) => {
    const decision = evaluateTaskTransition({
      actorRole: "HUMAN_OPERATOR",
      action: "ENQUEUE_TASK",
      fromState: null,
      toState: "MANUAL_REQUIRED"
    });
    if (!decision.allowed) {
      throw new Error(`Manual fallback enqueue denied: ${decision.reason}`);
    }

    const createdById = String(params.createdById || "").trim() || null;
    const createdByEmail = String(params.createdByEmail || "").trim() || null;
    const normalizedIssueNumber =
      typeof params.issueNumber === "number" && Number.isFinite(params.issueNumber)
        ? Math.trunc(params.issueNumber)
        : null;
    const chainId = crypto.randomUUID();
    const provenance = {
      chainId,
      issueNumber: normalizedIssueNumber,
      createdById,
      createdByEmail,
      createdAt: new Date().toISOString(),
      channel: normalizedIssueNumber ? "issue" : "system",
      sourceKind: "alpha_failure_fallback",
      sourceRef: `alpha-failure:${params.failureClass}`,
      actorType: createdById || createdByEmail ? "HUMAN_USER" : "SYSTEM_POLICY",
      actorUserId: createdById,
      actorEmail: createdByEmail,
      actorExternalId: params.failureClass,
      actorDisplayName: null,
      ingressEventId: null,
      threadId: params.threadId ?? null
    };
    const payloadSnapshot = {
      kind: "alpha_failure_fallback",
      failureClass: params.failureClass,
      fallbackAction: "MANUAL_REQUIRED",
      projectKey: params.projectKey ?? null,
      projectName: params.projectName ?? null,
      provenance,
      ...((params.metadata as Record<string, unknown> | null) || {})
    };

    const task = await tx.agentTask.create({
      data: {
        agentKey: params.agentKey,
        status: "MANUAL_REQUIRED",
        title: params.title,
        issueNumber: params.issueNumber,
        threadId: params.threadId,
        createdById: params.createdById ?? null,
        error: params.reason,
        finishedAt: new Date(),
        payload: payloadSnapshot
      }
    });

    await recordTaskPromptPackageInvariant({
      db: tx,
      taskId: task.id,
      snapshot: {
        sourceKind: "ALPHA_FAILURE_FALLBACK",
        sourceRef: `failure:${params.failureClass}`,
        issueNumber: params.issueNumber ?? null,
        promptText: params.title,
        packageBody: params.reason,
        packageSections: {
          failureClass: params.failureClass,
          remediation: getAlphaFailureDecision(params.failureClass).remediation
        },
        payloadSnapshot
      }
    });

    await recordLifecycleAudit({
      entityType: "TASK_PROVENANCE",
      entityId: chainId,
      actorRole: "HUMAN_OPERATOR",
      action: "REGISTER_PROVENANCE_CHAIN",
      fromState: null,
      toState: "MANUAL_REQUIRED",
      allowed: true,
      reason: "Provenance chain registered for manual fallback task enqueue.",
      metadata: {
        chainId,
        taskId: task.id,
        issueNumber: normalizedIssueNumber,
        createdById,
        createdByEmail,
        channel: provenance.channel,
        sourceKind: provenance.sourceKind,
        sourceRef: provenance.sourceRef,
        actorType: provenance.actorType,
        actorUserId: provenance.actorUserId,
        actorEmail: provenance.actorEmail,
        actorExternalId: provenance.actorExternalId,
        actorDisplayName: provenance.actorDisplayName,
        ingressEventId: provenance.ingressEventId,
        threadId: provenance.threadId,
        agentKey: params.agentKey
      },
      db: tx
    });

    await recordLifecycleAudit({
      entityType: "TASK",
      entityId: task.id,
      actorRole: "HUMAN_OPERATOR",
      action: "ENQUEUE_TASK",
      fromState: null,
      toState: "MANUAL_REQUIRED",
      allowed: true,
      reason: `Fallback policy: ${params.failureClass}`,
      metadata: {
        fallbackReason: params.reason,
        projectKey: params.projectKey ?? null,
        projectName: params.projectName ?? null
      },
      db: tx
    });

    return task;
  });
}
