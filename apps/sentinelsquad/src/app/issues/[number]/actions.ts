"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { getAppSession } from "@/lib/app-session";
import { createMessage, getOrCreateThread } from "@/lib/chat";
import { enqueueTask } from "@/lib/tasks";
import {
  consumeContextBudgetForScopeExpansion,
  closeActiveAlphaContextWindow,
  openAndActivateAlphaContextWindow,
  recordActiveContextHandoverPackage,
  setContextGuardrailOverride,
  transferActiveAlphaContextWindow
} from "@/lib/alpha-context";
import {
  ensureProjectItemForIssue,
  ensureSingleSelectOption,
  getIssueDetails,
  getItemSingleSelectValues,
  updateSingleSelectField
} from "@/lib/github";
import {
  promptPackageMissingSummary,
  validateExecutablePromptPackage
} from "@/lib/executable-prompt";
import { resolveRuntimeConfigForTask } from "@/lib/runtime-config";
import { prisma } from "@/lib/prisma";
import { getOrchestratorLeaseSnapshot } from "@/lib/orchestrator-lease";
import {
  enqueueManualFallbackTask,
  getAlphaFailureDecision,
  recordAlphaFailureEvent
} from "@/lib/alpha-failure-policy";
import {
  evaluateTaskTransition,
  recordLifecycleAudit
} from "@/lib/lifecycle-policy";
import { resolveUnifiedChatAgent } from "@/lib/active-agents";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

async function resolveCanonicalRuntimeAgentKey(input: string) {
  const raw = String(input || "").trim();
  if (!raw) return null;
  const agent = await prisma.agent.findFirst({
    where: {
      key: { equals: raw, mode: "insensitive" },
      runtime: { not: "MANUAL" }
    },
    select: { key: true }
  });
  return agent?.key ?? null;
}

async function resolveActiveIssueAgent(input: string) {
  const resolved = await resolveUnifiedChatAgent(input);
  if (!resolved.agent) {
    return {
      ok: false as const,
      error: `Unknown runtime agent key: ${input}`
    };
  }
  if (!resolved.agent.active) {
    return {
      ok: false as const,
      error: `Agent @${resolved.agent.key} is not active for execution. ${resolved.agent.reason || ""}`.trim()
    };
  }
  return {
    ok: true as const,
    agentKey: resolved.agent.key
  };
}

export async function updateIssueFields(issueNumber: number, formData: FormData) {
  const session = await getAppSession();
  if (!session?.user) throw new Error("Not authenticated.");

  const status = String(formData.get("Status") || "").trim();
  const agentInput = String(formData.get("Agent") || "").trim();
  const priority = String(formData.get("Priority") || "").trim();
  const dod = String(formData.get("DoD") || "").trim();

  if (status.toLowerCase() === "ready") {
    const issue = await getIssueDetails({ issueNumber });
    const promptValidation = validateExecutablePromptPackage(issue.body || "");
    if (!promptValidation.valid) {
      throw new Error(promptPackageMissingSummary(promptValidation));
    }
  }

  const { itemId } = await ensureProjectItemForIssue({ issueNumber });

  const updates: Array<{ fieldName: string; optionName: string }> = [];
  if (status) updates.push({ fieldName: "Status", optionName: status });
  if (agentInput) {
    const canonicalAgentKey = await resolveCanonicalRuntimeAgentKey(agentInput);
    if (!canonicalAgentKey) {
      throw new Error(`Unknown runtime agent key: ${agentInput}`);
    }
    await ensureSingleSelectOption({
      fieldName: "Agent",
      optionName: canonicalAgentKey,
      color: "BLUE",
      description: "SentinelSquad runtime agent key"
    });
    updates.push({ fieldName: "Agent", optionName: canonicalAgentKey });
  }
  if (priority) updates.push({ fieldName: "Priority", optionName: priority });
  if (dod) updates.push({ fieldName: "DoD", optionName: dod });

  for (const u of updates) {
    await updateSingleSelectField({
      itemId,
      fieldName: u.fieldName,
      optionName: u.optionName
    });
  }

  revalidatePath(`/issues/${issueNumber}`);
  revalidatePath(`/dashboard`);
}

export async function sendIssueMessage(issueNumber: number, formData: FormData) {
  const session = await getAppSession();
  if (!session?.user) throw new Error("Not authenticated.");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userId = (session.user as any).id as string | undefined;
  const content = String(formData.get("content") || "").trim();
  if (!content) return;

  const thread = await getOrCreateThread({
    kind: "ISSUE",
    ref: String(issueNumber),
    title: `Issue #${issueNumber}`,
    createdById: userId ?? null
  });

  await createMessage({
    threadId: thread.id,
    userId: userId ?? null,
    authorType: "HUMAN",
    content
  });

  revalidatePath(`/issues/${issueNumber}`);
  revalidatePath("/dashboard");
}

export async function enqueueIssueTask(issueNumber: number, formData: FormData) {
  const session = await getAppSession();
  if (!session?.user) throw new Error("Not authenticated.");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userId = (session.user as any).id as string | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userEmail = ((session.user as any).email as string | undefined) ?? null;

  const agentInput = String(formData.get("agentKey") || "").trim();
  const title = String(formData.get("title") || "").trim();
  if (!agentInput) throw new Error("Missing agentKey.");
  if (!title) throw new Error("Missing title.");
  const resolvedAgent = await resolveActiveIssueAgent(agentInput);
  if (!resolvedAgent.ok) {
    throw new Error(resolvedAgent.error);
  }
  const agentKey = resolvedAgent.agentKey;

  const issue = await getIssueDetails({ issueNumber });
  const promptValidation = validateExecutablePromptPackage(issue.body || "");
  if (!promptValidation.valid) {
    throw new Error(promptPackageMissingSummary(promptValidation));
  }

  const thread = await getOrCreateThread({
    kind: "ISSUE",
    ref: String(issueNumber),
    title: `Issue #${issueNumber}`,
    createdById: userId ?? null
  });

  const { itemId } = await ensureProjectItemForIssue({ issueNumber });
  const boardFields = await getItemSingleSelectValues({ itemId });
  const projectName = String(boardFields["Product"] || "").trim();
  const projectKey = projectName ? projectName.toLowerCase() : null;
  const runtimeConfigResolution = projectName
    ? await resolveRuntimeConfigForTask({
        projectName,
        agentKey
      })
    : null;
  if (projectName) {
    const lease = await getOrchestratorLeaseSnapshot();
    if (lease.health === "STALE" || lease.health === "UNHELD") {
      const decision = getAlphaFailureDecision("LEASE_AUTHORITY_UNAVAILABLE");
      const fallbackReason = `Alpha failure fallback (${decision.failureClass}): ${decision.remediation}`;
      const fallbackTask = await enqueueManualFallbackTask({
        agentKey,
        title,
        issueNumber,
        threadId: thread.id,
        createdById: userId ?? null,
        createdByEmail: userEmail,
        reason: fallbackReason,
        failureClass: decision.failureClass,
        projectKey,
        projectName,
        metadata: {
          leaseHealth: lease.health,
          leaseOwner: lease.ownerId,
          runtimeConfigDigest: runtimeConfigResolution?.digest ?? null
        }
      });
      await recordAlphaFailureEvent({
        failureClass: decision.failureClass,
        projectKey,
        projectName,
        issueNumber,
        taskId: fallbackTask.id,
        threadId: thread.id,
        leaseHealth: lease.health,
        metadata: {
          leaseOwner: lease.ownerId,
          leaseAgent: lease.ownerAgentKey,
          fallbackTaskId: fallbackTask.id
        }
      });
      await createMessage({
        threadId: thread.id,
        authorType: "SYSTEM",
        content: `Fallback applied: ${fallbackReason}`,
        meta: {
          kind: "alpha_failure_fallback",
          failureClass: decision.failureClass,
          fallbackAction: decision.fallbackAction,
          severity: decision.severity,
          remediation: decision.remediation,
          taskId: fallbackTask.id,
          issueNumber,
          projectName
        }
      });
      revalidatePath(`/issues/${issueNumber}`);
      revalidatePath("/dashboard");
      return;
    }

    const guardrail = await consumeContextBudgetForScopeExpansion({
      projectName,
      actorUserId: userId ?? null,
      sourceAction: "ISSUE_TASK_ENQUEUE",
      incrementPercent: 8,
      metadata: {
        issueNumber,
        agentKey,
        title
      }
    });

    if (!guardrail.allowed) {
      const decision = getAlphaFailureDecision("CONTEXT_GUARDRAIL_BLOCKED");
      const fallbackReason = `Alpha failure fallback (${decision.failureClass}): ${guardrail.reason}`;
      const fallbackTask = await enqueueManualFallbackTask({
        agentKey,
        title,
        issueNumber,
        threadId: thread.id,
        createdById: userId ?? null,
        createdByEmail: userEmail,
        reason: fallbackReason,
        failureClass: decision.failureClass,
        projectKey,
        projectName,
        metadata: {
          usagePercent: guardrail.usagePercent,
          guardrailStatus: guardrail.status,
          contextWindowId: guardrail.activeWindowId,
          runtimeConfigDigest: runtimeConfigResolution?.digest ?? null
        }
      });
      await recordAlphaFailureEvent({
        failureClass: decision.failureClass,
        projectKey,
        projectName,
        issueNumber,
        taskId: fallbackTask.id,
        threadId: thread.id,
        contextWindowId: guardrail.activeWindowId,
        metadata: {
          usagePercent: guardrail.usagePercent,
          guardrailStatus: guardrail.status
        }
      });
      await createMessage({
        threadId: thread.id,
        authorType: "SYSTEM",
        content: `Fallback applied: ${fallbackReason}`,
        meta: {
          kind: "alpha_failure_fallback",
          failureClass: decision.failureClass,
          fallbackAction: decision.fallbackAction,
          severity: decision.severity,
          issueNumber,
          projectName,
          taskId: fallbackTask.id,
          usagePercent: guardrail.usagePercent,
          status: guardrail.status,
          remediation: decision.remediation,
          reason: fallbackReason
        }
      });
      revalidatePath(`/issues/${issueNumber}`);
      revalidatePath("/dashboard");
      return;
    }

    if (guardrail.status === "WARNING" || guardrail.status === "OVERRIDE_ACTIVE") {
      const warningDecision = getAlphaFailureDecision("CONTEXT_GUARDRAIL_WARNING");
      await recordAlphaFailureEvent({
        failureClass: "CONTEXT_GUARDRAIL_WARNING",
        projectKey,
        projectName,
        issueNumber,
        threadId: thread.id,
        contextWindowId: guardrail.activeWindowId,
        metadata: {
          status: guardrail.status,
          usagePercent: guardrail.usagePercent
        }
      });
      await createMessage({
        threadId: thread.id,
        authorType: "SYSTEM",
        content: `${guardrail.reason} Remediation: ${warningDecision.remediation}`,
        meta: {
          kind: "alpha_context_guardrail_warning",
          issueNumber,
          projectName,
          usagePercent: guardrail.usagePercent,
          status: guardrail.status,
          remediation: warningDecision.remediation
        }
      });
    }
  }

  const task = await enqueueTask({
    agentKey,
    title,
    issueNumber,
    threadId: thread.id,
    createdById: userId ?? null,
    createdByEmail: userEmail,
    payload: { issueNumber },
    runtimeConfigResolution,
    promptPackageSnapshot: {
      sourceKind: "ISSUE_EXECUTABLE_PROMPT",
      sourceRef: issue.url,
      packageBody: issue.body || null,
      packageSections: promptValidation.sections
    }
  });

  await createMessage({
    threadId: thread.id,
    userId: userId ?? null,
    authorType: "SYSTEM",
    content:
      task.status === "MANUAL_REQUIRED"
        ? `Manual required for @${agentKey}: ${task.error || "Agent is not ready for autonomous execution."}`
        : task.error
        ? `Enqueued task for @${agentKey} (pending): ${task.error}`
        : `Enqueued task for @${agentKey}: ${title}`,
    meta: {
      kind: task.status === "MANUAL_REQUIRED" ? "task_manual_required" : "task_enqueued",
      agentKey,
      title,
      issueNumber,
      taskId: task.id,
      reason: task.error || null
    }
  });

  revalidatePath(`/issues/${issueNumber}`);
}

export async function requestIssueTaskControlAction(issueNumber: number, formData: FormData) {
  const session = await getAppSession();
  if (!session?.user) throw new Error("Not authenticated.");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userId = (session.user as any).id as string | undefined;
  const taskId = String(formData.get("taskId") || "").trim();
  const control = String(formData.get("control") || "")
    .trim()
    .toUpperCase();
  const reason = String(formData.get("reason") || "").trim();
  if (!taskId) throw new Error("Missing taskId.");
  if (control !== "CANCEL" && control !== "INTERRUPT") {
    throw new Error(`Unsupported task control action: ${control || "(empty)"}`);
  }

  const task = await prisma.agentTask.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      status: true,
      issueNumber: true,
      threadId: true,
      title: true,
      agentKey: true,
      payload: true
    }
  });
  if (!task) throw new Error(`Task not found: ${taskId}`);
  if ((task.issueNumber ?? null) !== issueNumber) {
    throw new Error("Task does not belong to this issue.");
  }
  if (task.status !== "RUNNING") {
    throw new Error(`Task control denied: expected RUNNING task, got ${task.status}.`);
  }

  const transitionAction = control === "INTERRUPT" ? "INTERRUPT_TASK" : "CANCEL_TASK";
  const decision = evaluateTaskTransition({
    actorRole: "HUMAN_OPERATOR",
    action: transitionAction,
    fromState: task.status,
    toState: "CANCELED"
  });
  if (!decision.allowed) {
    throw new Error(decision.reason);
  }

  const payloadRecord = asRecord(task.payload) ? { ...(task.payload as Record<string, unknown>) } : {};
  const currentControl = asRecord(payloadRecord.taskControl);
  const currentState = asRecord(currentControl?.state);
  payloadRecord.taskControl = {
    ...(currentControl || {}),
    state: {
      ...(currentState || {}),
      lastAction: control,
      reason: reason || null,
      requestedByUserId: userId ?? null,
      requestedAt: new Date().toISOString(),
      resumeAllowed: control === "INTERRUPT"
    }
  };

  await prisma.agentTask.update({
    where: { id: task.id },
    data: {
      status: "CANCELED",
      finishedAt: new Date(),
      error:
        control === "INTERRUPT"
          ? `Task interrupted by operator${reason ? `: ${reason}` : "."}`
          : `Task canceled by operator${reason ? `: ${reason}` : "."}`,
      payload: payloadRecord as Prisma.InputJsonValue
    }
  });

  await recordLifecycleAudit({
    entityType: "TASK",
    entityId: task.id,
    actorRole: "HUMAN_OPERATOR",
    action: transitionAction,
    fromState: task.status,
    toState: "CANCELED",
    allowed: true,
    reason: decision.reason,
    metadata: {
      issueNumber,
      taskId: task.id,
      control,
      requestedByUserId: userId ?? null,
      reason: reason || null,
      resumeAllowed: control === "INTERRUPT"
    }
  });

  const thread = await getOrCreateThread({
    kind: "ISSUE",
    ref: String(issueNumber),
    title: `Issue #${issueNumber}`,
    createdById: userId ?? null
  });
  await createMessage({
    threadId: thread.id,
    authorType: "SYSTEM",
    content:
      control === "INTERRUPT"
        ? `Operator interrupted task ${task.id.slice(0, 8)} for @${task.agentKey}. Resume is available.`
        : `Operator canceled task ${task.id.slice(0, 8)} for @${task.agentKey}.`,
    meta: {
      kind: control === "INTERRUPT" ? "task_interrupted" : "task_canceled_by_operator",
      issueNumber,
      taskId: task.id,
      agentKey: task.agentKey,
      reason: reason || null,
      resumeAllowed: control === "INTERRUPT"
    }
  });

  revalidatePath(`/issues/${issueNumber}`);
  revalidatePath("/dashboard");
}

export async function resumeIssueTaskAction(issueNumber: number, formData: FormData) {
  const session = await getAppSession();
  if (!session?.user) throw new Error("Not authenticated.");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userId = (session.user as any).id as string | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userEmail = ((session.user as any).email as string | undefined) ?? null;
  const taskId = String(formData.get("taskId") || "").trim();
  const resumeNote = String(formData.get("resumeNote") || "").trim();
  if (!taskId) throw new Error("Missing taskId.");

  const sourceTask = await prisma.agentTask.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      status: true,
      issueNumber: true,
      threadId: true,
      title: true,
      agentKey: true,
      payload: true
    }
  });
  if (!sourceTask) throw new Error(`Task not found: ${taskId}`);
  if ((sourceTask.issueNumber ?? null) !== issueNumber) {
    throw new Error("Task does not belong to this issue.");
  }
  if (sourceTask.status !== "CANCELED") {
    throw new Error(`Resume denied: expected CANCELED task, got ${sourceTask.status}.`);
  }

  const payloadRecord = asRecord(sourceTask.payload)
    ? { ...(sourceTask.payload as Record<string, unknown>) }
    : {};
  const taskControl = asRecord(payloadRecord.taskControl);
  const state = asRecord(taskControl?.state);
  const resumeAllowed = state?.resumeAllowed === true;
  if (!resumeAllowed) {
    throw new Error("Resume denied by policy: source task is not marked resumable.");
  }

  const thread = sourceTask.threadId
    ? { id: sourceTask.threadId }
    : await getOrCreateThread({
        kind: "ISSUE",
        ref: String(issueNumber),
        title: `Issue #${issueNumber}`,
        createdById: userId ?? null
      });

  const nextResumeCount =
    Number.isFinite(Number(state?.resumeCount)) && Number(state?.resumeCount) >= 0
      ? Number(state?.resumeCount) + 1
      : 1;
  const resumedPayload = {
    ...payloadRecord,
    resumedFromTaskId: sourceTask.id,
    resumeNote: resumeNote || null,
    taskControl: {
      ...(taskControl || {}),
      state: {
        ...(state || {}),
        lastAction: "RESUME",
        resumedFromTaskId: sourceTask.id,
        resumedByUserId: userId ?? null,
        resumedAt: new Date().toISOString(),
        resumeCount: nextResumeCount,
        resumeAllowed: false
      }
    }
  };

  const resumedTask = await enqueueTask({
    agentKey: sourceTask.agentKey,
    title: sourceTask.title,
    issueNumber,
    threadId: thread.id,
    createdById: userId ?? null,
    createdByEmail: userEmail,
    payload: resumedPayload
  });

  const decision = evaluateTaskTransition({
    actorRole: "HUMAN_OPERATOR",
    action: "RESUME_TASK",
    fromState: sourceTask.status,
    toState: resumedTask.status
  });
  if (!decision.allowed) {
    throw new Error(decision.reason);
  }

  await recordLifecycleAudit({
    entityType: "TASK",
    entityId: sourceTask.id,
    actorRole: "HUMAN_OPERATOR",
    action: "RESUME_TASK",
    fromState: sourceTask.status,
    toState: resumedTask.status,
    allowed: true,
    reason: decision.reason,
    metadata: {
      issueNumber,
      sourceTaskId: sourceTask.id,
      resumedTaskId: resumedTask.id,
      agentKey: sourceTask.agentKey,
      resumeNote: resumeNote || null,
      requestedByUserId: userId ?? null
    }
  });

  await createMessage({
    threadId: thread.id,
    authorType: "SYSTEM",
    content: `Operator resumed task ${sourceTask.id.slice(0, 8)} as ${resumedTask.id.slice(0, 8)} for @${sourceTask.agentKey}.`,
    meta: {
      kind: "task_resumed",
      issueNumber,
      sourceTaskId: sourceTask.id,
      resumedTaskId: resumedTask.id,
      agentKey: sourceTask.agentKey,
      resumeNote: resumeNote || null
    }
  });

  revalidatePath(`/issues/${issueNumber}`);
  revalidatePath("/dashboard");
}

export async function activateIssueAlphaContextAction(issueNumber: number, formData: FormData) {
  const session = await getAppSession();
  if (!session?.user) throw new Error("Not authenticated.");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userId = (session.user as any).id as string | undefined;
  const projectName = String(formData.get("projectName") || "").trim();
  const ownerAgentKey = String(formData.get("ownerAgentKey") || "").trim();
  const handoverRef = String(formData.get("activationHandoverRef") || "").trim();
  const continuityNote = String(formData.get("continuityNote") || "").trim();
  if (!projectName) throw new Error("Missing project for Alpha context activation.");
  if (!ownerAgentKey) throw new Error("Missing Alpha agent key.");

  const result = await openAndActivateAlphaContextWindow({
    projectName,
    ownerAgentKey,
    actorUserId: userId ?? null,
    activationHandoverRef: handoverRef || null,
    continuityNote: continuityNote || null
  });

  const thread = await getOrCreateThread({
    kind: "ISSUE",
    ref: String(issueNumber),
    title: `Issue #${issueNumber}`,
    createdById: userId ?? null
  });
  await createMessage({
    threadId: thread.id,
    authorType: "SYSTEM",
    content: result.ok
      ? `Alpha context lock activated for ${projectName}: @${ownerAgentKey}.`
      : result.reason,
    meta: {
      kind: result.ok ? "alpha_context_activated" : "alpha_context_activation_denied",
      issueNumber,
      projectName,
      requestedOwnerAgentKey: ownerAgentKey,
      activeWindowId: result.activeWindowId,
      reason: result.reason
    }
  });

  revalidatePath(`/issues/${issueNumber}`);
  revalidatePath("/dashboard");
}

export async function transferIssueAlphaContextAction(issueNumber: number, formData: FormData) {
  const session = await getAppSession();
  if (!session?.user) throw new Error("Not authenticated.");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userId = (session.user as any).id as string | undefined;
  const projectName = String(formData.get("projectName") || "").trim();
  const toAgentKey = String(formData.get("toAgentKey") || "").trim();
  const handoverRef = String(formData.get("handoverRef") || "").trim();
  const continuityNote = String(formData.get("continuityNote") || "").trim();
  if (!projectName) throw new Error("Missing project for Alpha context transfer.");
  if (!toAgentKey) throw new Error("Missing transfer target Alpha agent key.");

  const result = await transferActiveAlphaContextWindow({
    projectName,
    toAgentKey,
    actorUserId: userId ?? null,
    handoverRef,
    continuityNote: continuityNote || null
  });

  const thread = await getOrCreateThread({
    kind: "ISSUE",
    ref: String(issueNumber),
    title: `Issue #${issueNumber}`,
    createdById: userId ?? null
  });
  await createMessage({
    threadId: thread.id,
    authorType: "SYSTEM",
    content: result.ok
      ? `Alpha context lock transferred for ${projectName} to @${toAgentKey}.`
      : result.reason,
    meta: {
      kind: result.ok ? "alpha_context_transferred" : "alpha_context_transfer_denied",
      issueNumber,
      projectName,
      requestedToAgentKey: toAgentKey,
      activeWindowId: result.activeWindowId,
      handoverRef: handoverRef || null,
      reason: result.reason
    }
  });

  revalidatePath(`/issues/${issueNumber}`);
  revalidatePath("/dashboard");
}

export async function closeIssueAlphaContextAction(issueNumber: number, formData: FormData) {
  const session = await getAppSession();
  if (!session?.user) throw new Error("Not authenticated.");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userId = (session.user as any).id as string | undefined;
  const projectName = String(formData.get("projectName") || "").trim();
  const handoverRef = String(formData.get("handoverRef") || "").trim();
  const closeReason = String(formData.get("closeReason") || "").trim();
  if (!projectName) throw new Error("Missing project for Alpha context close.");

  const result = await closeActiveAlphaContextWindow({
    projectName,
    actorUserId: userId ?? null,
    handoverRef,
    closeReason: closeReason || null
  });

  const thread = await getOrCreateThread({
    kind: "ISSUE",
    ref: String(issueNumber),
    title: `Issue #${issueNumber}`,
    createdById: userId ?? null
  });
  await createMessage({
    threadId: thread.id,
    authorType: "SYSTEM",
    content: result.ok
      ? `Alpha context lock closed for ${projectName}.`
      : result.reason,
    meta: {
      kind: result.ok ? "alpha_context_closed" : "alpha_context_close_denied",
      issueNumber,
      projectName,
      activeWindowId: result.activeWindowId,
      handoverRef: handoverRef || null,
      closeReason: closeReason || null,
      reason: result.reason
    }
  });

  revalidatePath(`/issues/${issueNumber}`);
  revalidatePath("/dashboard");
}

export async function recordIssueHandoverPackageAction(issueNumber: number, formData: FormData) {
  const session = await getAppSession();
  if (!session?.user) throw new Error("Not authenticated.");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userId = (session.user as any).id as string | undefined;
  const projectName = String(formData.get("projectName") || "").trim();
  const handoverPackageRef = String(formData.get("handoverPackageRef") || "").trim();
  const continuationPromptRef = String(formData.get("continuationPromptRef") || "").trim();
  const note = String(formData.get("handoverNote") || "").trim();
  if (!projectName) throw new Error("Missing project for handover package update.");

  const result = await recordActiveContextHandoverPackage({
    projectName,
    handoverPackageRef,
    continuationPromptRef,
    note: note || null,
    actorUserId: userId ?? null
  });

  const thread = await getOrCreateThread({
    kind: "ISSUE",
    ref: String(issueNumber),
    title: `Issue #${issueNumber}`,
    createdById: userId ?? null
  });
  await createMessage({
    threadId: thread.id,
    authorType: "SYSTEM",
    content: result.ok
      ? `Handover package recorded for ${projectName}.`
      : result.reason,
    meta: {
      kind: result.ok ? "alpha_context_handover_package" : "alpha_context_handover_package_denied",
      issueNumber,
      projectName,
      activeWindowId: result.activeWindowId,
      handoverPackageRef: handoverPackageRef || null,
      continuationPromptRef: continuationPromptRef || null,
      reason: result.reason
    }
  });

  revalidatePath(`/issues/${issueNumber}`);
  revalidatePath("/dashboard");
}

export async function overrideIssueGuardrailAction(issueNumber: number, formData: FormData) {
  const session = await getAppSession();
  if (!session?.user) throw new Error("Not authenticated.");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userId = (session.user as any).id as string | undefined;
  const projectName = String(formData.get("projectName") || "").trim();
  const overrideReason = String(formData.get("overrideReason") || "").trim();
  const durationMinutes = Number(formData.get("durationMinutes") || "30");
  if (!projectName) throw new Error("Missing project for guardrail override.");

  const result = await setContextGuardrailOverride({
    projectName,
    overrideReason,
    durationMinutes,
    actorUserId: userId ?? null
  });

  const thread = await getOrCreateThread({
    kind: "ISSUE",
    ref: String(issueNumber),
    title: `Issue #${issueNumber}`,
    createdById: userId ?? null
  });
  await createMessage({
    threadId: thread.id,
    authorType: "SYSTEM",
    content: result.ok
      ? `Guardrail override set for ${projectName}.`
      : result.reason,
    meta: {
      kind: result.ok ? "alpha_context_guardrail_override" : "alpha_context_guardrail_override_denied",
      issueNumber,
      projectName,
      activeWindowId: result.activeWindowId,
      durationMinutes: Number.isFinite(durationMinutes) ? durationMinutes : 30,
      reason: result.reason
    }
  });

  revalidatePath(`/issues/${issueNumber}`);
  revalidatePath("/dashboard");
}
