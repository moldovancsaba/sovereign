import { prisma } from "@/lib/prisma";
import { evaluateTaskTransition, recordLifecycleAudit } from "@/lib/lifecycle-policy";
import crypto from "node:crypto";
import {
  CONTROL_INTENT_BETA_REASON,
  evaluateTaskJudgementGate
} from "@/lib/judgement-gates";
import { getActiveTasteRubricVersion, readSentinelSquadSettings } from "@/lib/settings-store";
import { recordTaskPromptPackageInvariant } from "@/lib/prompt-package-invariants";
import {
  summarizeToolCallProtocolEnvelope,
  validateToolCallProtocolEnvelope
} from "@/lib/tool-call-protocol";
import {
  evaluateToolCommandPolicy,
  summarizeToolCommandPolicyEvaluation
} from "@/lib/tool-command-policy";
import { deriveCoreCommandsForEnvelope, mergeObservedCommandAccessEntries } from "@/lib/command-access-policy";
import type { RuntimeConfigResolution } from "@/lib/runtime-config";
import { sovereignEnv } from "@/lib/env-sovereign";
import { writeSentinelSquadSettings } from "@/lib/settings-store";
const DEFAULT_MAX_ATTEMPTS = Number(
  sovereignEnv("SOVEREIGN_TASK_MAX_ATTEMPTS", "SENTINELSQUAD_TASK_MAX_ATTEMPTS") || "3"
);

function asTrimmed(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function optionalText(value: unknown): string | null {
  const normalized = asTrimmed(value);
  return normalized || null;
}

function optionalIssueNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const normalized = Math.trunc(value);
  return normalized > 0 ? normalized : null;
}

type TaskProvenanceIdentity = {
  channel: string;
  sourceKind: string;
  sourceRef: string | null;
  actorType: string;
  actorUserId: string | null;
  actorEmail: string | null;
  actorExternalId: string | null;
  actorDisplayName: string | null;
  ingressEventId: string | null;
  threadId: string | null;
};

function resolveMaxAttempts() {
  if (!Number.isFinite(DEFAULT_MAX_ATTEMPTS)) return 3;
  return Math.min(Math.max(Math.trunc(DEFAULT_MAX_ATTEMPTS), 1), 10);
}

async function initialTaskState(agentKey: string, title: string): Promise<{
  status: "QUEUED" | "MANUAL_REQUIRED";
  error: string | null;
  controlBoundaryDenied: boolean;
  judgement: ReturnType<typeof evaluateTaskJudgementGate>;
}> {
  const agent = await prisma.agent.findUnique({
    where: { key: agentKey },
    select: { enabled: true, runtime: true, readiness: true, controlRole: true }
  });
  const judgement = evaluateTaskJudgementGate({
    agentKey,
    title,
    agent
  });
  return {
    status: judgement.status,
    error: judgement.error,
    controlBoundaryDenied: judgement.controlBoundaryDenied,
    judgement
  };
}

type EnqueueTaskPromptPackageSnapshot = {
  sourceKind: string;
  sourceRef?: string | null;
  packageBody?: string | null;
  packageSections?: unknown;
};

function inferPromptPackageSource(
  issueNumber: number | undefined,
  payloadRecord: Record<string, unknown>
) {
  if (typeof issueNumber === "number" && Number.isFinite(issueNumber)) {
    const normalized = Math.trunc(issueNumber);
    return {
      sourceKind: "ISSUE_EXECUTABLE_PROMPT",
      sourceRef: `issue:${normalized}`
    };
  }

  const payloadKind = typeof payloadRecord.kind === "string" ? payloadRecord.kind : "";
  if (payloadKind === "chat_mention") {
    return { sourceKind: "CHAT_MENTION", sourceRef: "thread:global" };
  }
  if (payloadKind === "chat_mention_tool_call") {
    return { sourceKind: "CHAT_MENTION_TOOL_CALL", sourceRef: "thread:global" };
  }
  if (payloadKind === "email_ingress_task") {
    return { sourceKind: "EMAIL_INGRESS", sourceRef: "channel:email" };
  }
  if (payloadKind === "alpha_failure_fallback") {
    return { sourceKind: "ALPHA_FAILURE_FALLBACK", sourceRef: "policy:alpha_failure" };
  }

  return { sourceKind: "TASK_INPUT_FALLBACK", sourceRef: null };
}

function inferProvenanceIdentity(params: {
  issueNumber?: number;
  threadId?: string;
  createdById?: string | null;
  createdByEmail?: string | null;
  payloadRecord: Record<string, unknown>;
  promptPackageSource: { sourceKind: string; sourceRef: string | null };
}): TaskProvenanceIdentity {
  const payloadKind = optionalText(params.payloadRecord.kind);
  const inboundEventId = optionalText(params.payloadRecord.inboundEventId);
  const senderEmail = optionalText(params.payloadRecord.senderEmail);
  const senderName = optionalText(params.payloadRecord.senderName);
  const failureClass = optionalText(params.payloadRecord.failureClass);

  const channelByPromptSource: Record<string, string> = {
    ISSUE_EXECUTABLE_PROMPT: "issue",
    CHAT_MENTION: "chat",
    CHAT_MENTION_TOOL_CALL: "chat",
    EMAIL_INGRESS: "email",
    ALPHA_FAILURE_FALLBACK: "system"
  };

  let channel = channelByPromptSource[params.promptPackageSource.sourceKind] || "unknown";
  let sourceKind = payloadKind || params.promptPackageSource.sourceKind || "TASK_INPUT_FALLBACK";
  let sourceRef = params.promptPackageSource.sourceRef ?? null;
  let actorType =
    params.createdById || params.createdByEmail ? "HUMAN_USER" : "SYSTEM";
  let actorUserId = optionalText(params.createdById);
  let actorEmail = optionalText(params.createdByEmail);
  let actorExternalId: string | null = null;
  let actorDisplayName: string | null = null;
  let ingressEventId: string | null = null;

  if (payloadKind === "chat_mention" || payloadKind === "chat_mention_tool_call") {
    channel = "chat";
    sourceKind = payloadKind;
    sourceRef = params.threadId ? `thread:${params.threadId}` : "thread:global";
    actorType = "HUMAN_USER";
    actorUserId = optionalText(params.createdById);
    actorEmail = optionalText(params.createdByEmail);
  } else if (payloadKind === "email_ingress_task") {
    channel = "email";
    sourceKind = payloadKind;
    ingressEventId = inboundEventId;
    sourceRef = inboundEventId
      ? `email-event:${inboundEventId}`
      : params.threadId
      ? `thread:${params.threadId}`
      : "channel:email";
    actorType = "EXTERNAL_SENDER";
    actorUserId = null;
    actorEmail = senderEmail;
    actorExternalId = senderEmail;
    actorDisplayName = senderName;
  } else if (payloadKind === "alpha_failure_fallback") {
    channel = "system";
    sourceKind = payloadKind;
    sourceRef = failureClass ? `alpha-failure:${failureClass}` : sourceRef;
    actorType = "SYSTEM_POLICY";
    actorUserId = null;
    actorEmail = null;
    actorExternalId = failureClass;
  } else if (typeof params.issueNumber === "number" && Number.isFinite(params.issueNumber)) {
    channel = "issue";
    sourceKind = payloadKind || "issue_task_enqueue";
    sourceRef = `issue:${Math.trunc(params.issueNumber)}`;
    actorType =
      params.createdById || params.createdByEmail ? "HUMAN_USER" : "SYSTEM";
  }

  return {
    channel,
    sourceKind,
    sourceRef,
    actorType,
    actorUserId,
    actorEmail,
    actorExternalId,
    actorDisplayName,
    ingressEventId,
    threadId: optionalText(params.threadId)
  };
}

export async function enqueueTask(params: {
  agentKey: string;
  title: string;
  issueNumber?: number;
  threadId?: string;
  createdById?: string | null;
  createdByEmail?: string | null;
  payload?: unknown;
  promptPackageSnapshot?: EnqueueTaskPromptPackageSnapshot;
  runtimeConfigResolution?: RuntimeConfigResolution | null;
}) {
  const settings = await readSentinelSquadSettings();
  const activeTasteRubric = getActiveTasteRubricVersion(settings);
  const payloadRecord: Record<string, unknown> =
    params.payload && typeof params.payload === "object" && !Array.isArray(params.payload)
      ? { ...(params.payload as Record<string, unknown>) }
      : {
          value: params.payload ?? null
        };
  payloadRecord.tasteRubricVersion = activeTasteRubric?.version ?? null;
  payloadRecord.tasteRubricOwnerEmail = activeTasteRubric?.ownerEmail ?? null;
  if (params.runtimeConfigResolution) {
    payloadRecord.runtimeConfigResolution = params.runtimeConfigResolution;
  }
  const inferredPromptPackage = inferPromptPackageSource(params.issueNumber, payloadRecord);
  const existingProvenance =
    payloadRecord.provenance && typeof payloadRecord.provenance === "object" && !Array.isArray(payloadRecord.provenance)
      ? { ...(payloadRecord.provenance as Record<string, unknown>) }
      : {};
  const inferredProvenance = inferProvenanceIdentity({
    issueNumber: params.issueNumber,
    threadId: params.threadId,
    createdById: params.createdById ?? null,
    createdByEmail: params.createdByEmail ?? null,
    payloadRecord,
    promptPackageSource: inferredPromptPackage
  });
  const existingIssueNumber = optionalIssueNumber(existingProvenance.issueNumber);
  const normalizedIssueNumber =
    typeof params.issueNumber === "number" && Number.isFinite(params.issueNumber)
      ? Math.trunc(params.issueNumber)
      : existingIssueNumber;
  const chainId = asTrimmed(existingProvenance.chainId) || crypto.randomUUID();
  payloadRecord.provenance = {
    ...existingProvenance,
    chainId,
    issueNumber: normalizedIssueNumber ?? null,
    createdById: optionalText(existingProvenance.createdById) ?? optionalText(params.createdById),
    createdByEmail:
      optionalText(existingProvenance.createdByEmail) ?? optionalText(params.createdByEmail),
    createdAt: optionalText(existingProvenance.createdAt) || new Date().toISOString(),
    channel: optionalText(existingProvenance.channel) || inferredProvenance.channel,
    sourceKind: optionalText(existingProvenance.sourceKind) || inferredProvenance.sourceKind,
    sourceRef: optionalText(existingProvenance.sourceRef) || inferredProvenance.sourceRef,
    actorType: optionalText(existingProvenance.actorType) || inferredProvenance.actorType,
    actorUserId: optionalText(existingProvenance.actorUserId) || inferredProvenance.actorUserId,
    actorEmail: optionalText(existingProvenance.actorEmail) || inferredProvenance.actorEmail,
    actorExternalId:
      optionalText(existingProvenance.actorExternalId) || inferredProvenance.actorExternalId,
    actorDisplayName:
      optionalText(existingProvenance.actorDisplayName) || inferredProvenance.actorDisplayName,
    ingressEventId:
      optionalText(existingProvenance.ingressEventId) || inferredProvenance.ingressEventId,
    threadId: optionalText(existingProvenance.threadId) || inferredProvenance.threadId
  };
  const toolCallProtocolValidation = validateToolCallProtocolEnvelope(
    payloadRecord.toolCallProtocol
  );
  if (toolCallProtocolValidation.present && toolCallProtocolValidation.ok) {
    payloadRecord.toolCallProtocol = toolCallProtocolValidation.envelope;
    const observed = mergeObservedCommandAccessEntries(
      settings.commandAccess,
      deriveCoreCommandsForEnvelope(toolCallProtocolValidation.envelope)
    );
    if (observed.changed) {
      settings.commandAccess = observed.entries;
      await writeSentinelSquadSettings(settings);
    }
  } else if (toolCallProtocolValidation.present) {
    payloadRecord.toolCallProtocolValidation = {
      status: "DENIED",
      code: toolCallProtocolValidation.code,
      reason: toolCallProtocolValidation.reason
    };
  }
  const toolCallPolicyEvaluation =
    toolCallProtocolValidation.present && toolCallProtocolValidation.ok
      ? evaluateToolCommandPolicy(toolCallProtocolValidation.envelope, {
          commandAccessEntries: settings.commandAccess
        })
      : null;
  if (toolCallPolicyEvaluation) {
    payloadRecord.toolCallPolicyEvaluation = summarizeToolCommandPolicyEvaluation(
      toolCallPolicyEvaluation
    );
  }

  const initial = await initialTaskState(params.agentKey, params.title);
  let finalStatus: "QUEUED" | "MANUAL_REQUIRED" = initial.status;
  let finalError = initial.error;

  if (
    finalStatus !== "MANUAL_REQUIRED" &&
    toolCallProtocolValidation.present &&
    !toolCallProtocolValidation.ok
  ) {
    finalStatus = "MANUAL_REQUIRED";
    finalError = toolCallProtocolValidation.reason;
  }

  if (toolCallPolicyEvaluation) {
    if (finalStatus !== "MANUAL_REQUIRED" && !toolCallPolicyEvaluation.allowed) {
      finalStatus = "MANUAL_REQUIRED";
      finalError = toolCallPolicyEvaluation.denyReason || "Tool command policy denied the action.";
    } else if (finalStatus !== "MANUAL_REQUIRED" && toolCallPolicyEvaluation.requiresApproval) {
      const approvalToken = asTrimmed(payloadRecord.toolCallApprovalToken);
      if (!approvalToken) {
        finalStatus = "MANUAL_REQUIRED";
        finalError =
          toolCallPolicyEvaluation.approvalReason ||
          "Tool command policy requires explicit approval token before execution.";
      }
    }
  }

  const maxAttempts = resolveMaxAttempts();
  return prisma.$transaction(async (tx) => {
    const decision = evaluateTaskTransition({
      actorRole: "HUMAN_OPERATOR",
      action: "ENQUEUE_TASK",
      fromState: null,
      toState: finalStatus
    });
    if (!decision.allowed) {
      await recordLifecycleAudit({
        entityType: "TASK",
        actorRole: "HUMAN_OPERATOR",
        action: "ENQUEUE_TASK",
        fromState: null,
        toState: finalStatus,
        allowed: false,
        reason: decision.reason,
        metadata: {
          agentKey: params.agentKey,
          title: params.title
        },
        db: tx
      });
      throw new Error(decision.reason);
    }

    const task = await tx.agentTask.create({
      data: {
        agentKey: params.agentKey,
        status: finalStatus,
        attemptCount: 0,
        maxAttempts,
        nextAttemptAt: new Date(),
        lastFailureCode: null,
        lastFailureKind: null,
        deadLetteredAt: null,
        title: params.title,
        issueNumber: params.issueNumber,
        threadId: params.threadId,
        createdById: params.createdById ?? null,
        error: finalError,
        ...(finalStatus === "MANUAL_REQUIRED" ? { finishedAt: new Date() } : {}),
        payload: payloadRecord as never
      }
    });

    await recordTaskPromptPackageInvariant({
      db: tx,
      taskId: task.id,
      snapshot: {
        sourceKind:
          String(params.promptPackageSnapshot?.sourceKind || "").trim() ||
          inferredPromptPackage.sourceKind,
        sourceRef:
          params.promptPackageSnapshot?.sourceRef ?? inferredPromptPackage.sourceRef ?? null,
        issueNumber: params.issueNumber ?? null,
        promptText: params.title,
        packageBody: params.promptPackageSnapshot?.packageBody ?? null,
        packageSections: params.promptPackageSnapshot?.packageSections ?? null,
        payloadSnapshot: payloadRecord
      }
    });

    if (params.runtimeConfigResolution) {
      await recordLifecycleAudit({
        entityType: "TASK",
        entityId: task.id,
        actorRole: "HUMAN_OPERATOR",
        action: "RUNTIME_CONFIG_RESOLUTION",
        fromState: null,
        toState: finalStatus,
        allowed: true,
        reason: "Runtime config resolved for task execution.",
        metadata: {
          digest: params.runtimeConfigResolution.digest,
          projectKey: params.runtimeConfigResolution.projectKey,
          projectName: params.runtimeConfigResolution.projectName,
          activeContextWindowId: params.runtimeConfigResolution.activeContextWindowId,
          activeContextOwnerAgentKey:
            params.runtimeConfigResolution.activeContextOwnerAgentKey,
          sourceChain: params.runtimeConfigResolution.sourceChain,
          resolvedAt: params.runtimeConfigResolution.resolvedAt
        },
        db: tx
      });
    }

    await recordLifecycleAudit({
      entityType: "TASK_PROVENANCE",
      entityId: chainId,
      actorRole: "HUMAN_OPERATOR",
      action: "REGISTER_PROVENANCE_CHAIN",
      fromState: null,
      toState: finalStatus,
      allowed: true,
      reason: "Provenance chain registered at task enqueue.",
      metadata: {
        chainId,
        taskId: task.id,
        issueNumber: normalizedIssueNumber ?? null,
        createdById:
          optionalText(existingProvenance.createdById) ?? optionalText(params.createdById),
        createdByEmail:
          optionalText(existingProvenance.createdByEmail) ?? optionalText(params.createdByEmail),
        channel: optionalText(existingProvenance.channel) || inferredProvenance.channel,
        sourceKind: optionalText(existingProvenance.sourceKind) || inferredProvenance.sourceKind,
        sourceRef: optionalText(existingProvenance.sourceRef) || inferredProvenance.sourceRef,
        actorType: optionalText(existingProvenance.actorType) || inferredProvenance.actorType,
        actorUserId:
          optionalText(existingProvenance.actorUserId) || inferredProvenance.actorUserId,
        actorEmail: optionalText(existingProvenance.actorEmail) || inferredProvenance.actorEmail,
        actorExternalId:
          optionalText(existingProvenance.actorExternalId) || inferredProvenance.actorExternalId,
        actorDisplayName:
          optionalText(existingProvenance.actorDisplayName) || inferredProvenance.actorDisplayName,
        ingressEventId:
          optionalText(existingProvenance.ingressEventId) || inferredProvenance.ingressEventId,
        threadId: optionalText(existingProvenance.threadId) || inferredProvenance.threadId,
        agentKey: params.agentKey
      },
      db: tx
    });

    if (toolCallProtocolValidation.present) {
      await recordLifecycleAudit({
        entityType: "TASK",
        entityId: task.id,
        actorRole: "HUMAN_OPERATOR",
        action: "TOOL_CALL_PROTOCOL_VALIDATE",
        fromState: null,
        toState: finalStatus,
        allowed: toolCallProtocolValidation.ok,
        reason: toolCallProtocolValidation.reason,
        metadata: {
          agentKey: params.agentKey,
          issueNumber: params.issueNumber ?? null,
          threadId: params.threadId ?? null,
          ...(toolCallProtocolValidation.ok
            ? summarizeToolCallProtocolEnvelope(toolCallProtocolValidation.envelope)
            : { code: toolCallProtocolValidation.code })
        },
        db: tx
      });
    }

    if (toolCallPolicyEvaluation) {
      await recordLifecycleAudit({
        entityType: "TASK",
        entityId: task.id,
        actorRole: "HUMAN_OPERATOR",
        action: "TOOL_COMMAND_POLICY_EVALUATE",
        fromState: null,
        toState: finalStatus,
        allowed: toolCallPolicyEvaluation.allowed,
        reason:
          toolCallPolicyEvaluation.denyReason ||
          toolCallPolicyEvaluation.approvalReason ||
          "Tool command policy evaluation passed.",
        metadata: {
          issueNumber: params.issueNumber ?? null,
          threadId: params.threadId ?? null,
          approvalTokenPresent: asTrimmed(payloadRecord.toolCallApprovalToken).length > 0,
          ...summarizeToolCommandPolicyEvaluation(toolCallPolicyEvaluation)
        },
        db: tx
      });
    }

    await recordLifecycleAudit({
      entityType: "TASK",
      entityId: task.id,
      actorRole: "HUMAN_OPERATOR",
      action: "JUDGEMENT_GATE",
      fromState: null,
      toState: finalStatus,
      allowed: initial.judgement.allowed,
      reason: initial.judgement.summary,
      metadata: {
        issueNumber: params.issueNumber ?? null,
        threadId: params.threadId ?? null,
        agentKey: params.agentKey,
        decision: initial.judgement.decision,
        policyVersion: initial.judgement.policyVersion,
        checks: initial.judgement.checks,
        tasteRubricVersion: activeTasteRubric?.version ?? null
      },
      db: tx
    });

    await recordLifecycleAudit({
      entityType: "TASK",
      entityId: task.id,
      actorRole: "HUMAN_OPERATOR",
      action: "ENQUEUE_TASK",
      fromState: null,
      toState: finalStatus,
      allowed: true,
      reason: decision.reason,
      metadata: {
        agentKey: params.agentKey,
        issueNumber: params.issueNumber ?? null,
        threadId: params.threadId ?? null,
        tasteRubricVersion: activeTasteRubric?.version ?? null
      },
      db: tx
    });

    if (initial.controlBoundaryDenied) {
      await recordLifecycleAudit({
        entityType: "TASK",
        entityId: task.id,
        actorRole: "HUMAN_OPERATOR",
        action: "BETA_CONTROL_BOUNDARY",
        fromState: null,
        toState: finalStatus,
        allowed: false,
        reason: initial.error || CONTROL_INTENT_BETA_REASON,
        metadata: {
          agentKey: params.agentKey,
          title: params.title
        },
        db: tx
      });
    }

    if (params.threadId) {
      await tx.chatEvent.create({
        data: {
          threadId: params.threadId,
          kind: finalStatus === "MANUAL_REQUIRED" ? "TASK_MANUAL_REQUIRED" : "TASK_ENQUEUED",
          actorKey: params.agentKey,
          taskId: task.id,
          payload: {
            agentKey: params.agentKey,
            title: params.title,
            issueNumber: params.issueNumber ?? null,
            status: finalStatus,
            error: finalError,
            projectSessionId:
              payloadRecord && typeof payloadRecord.projectSessionId === "string"
                ? payloadRecord.projectSessionId
                : null,
            projectSessionRelPath:
              payloadRecord && typeof payloadRecord.projectSessionRelPath === "string"
                ? payloadRecord.projectSessionRelPath
                : null,
            sourceKind:
              payloadRecord.provenance &&
              typeof payloadRecord.provenance === "object" &&
              !Array.isArray(payloadRecord.provenance) &&
              typeof (payloadRecord.provenance as Record<string, unknown>).sourceKind === "string"
                ? (payloadRecord.provenance as Record<string, unknown>).sourceKind
                : null
          } as never
        }
      });
    }

    return task;
  });
}

export async function markQueuedTasksManualRequired(agentKey: string, reason: string) {
  return prisma.agentTask.updateMany({
    where: { agentKey, status: "QUEUED" },
    data: {
      status: "MANUAL_REQUIRED",
      error: reason,
      finishedAt: new Date()
    }
  });
}

export async function listAgentTasks(params: {
  agentKey: string;
  issueNumber?: number;
  limit?: number;
}) {
  return prisma.agentTask.findMany({
    where: {
      agentKey: params.agentKey,
      ...(typeof params.issueNumber === "number" ? { issueNumber: params.issueNumber } : {})
    },
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(params.limit ?? 50, 1), 200)
  });
}
