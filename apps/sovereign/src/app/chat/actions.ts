"use server";

import { revalidatePath } from "next/cache";
import { getAppSession } from "@/lib/app-session";
import { createMessage, getOrCreateThread } from "@/lib/chat";
import { parseAgentMention } from "@/lib/mentions";
import { enqueueTask } from "@/lib/tasks";
import {
  listUnifiedChatAgentAvailability,
  type UnifiedChatAgentAvailability,
  resolveUnifiedChatControllerAgent
} from "@/lib/active-agents";
import { getLocalRuntimeHealth } from "@/lib/runtime-health";
import {
  parseToolCallApprovalRequestCommand,
  parseToolCallCommand,
  summarizeToolCallProtocolEnvelope,
  validateToolCallProtocolEnvelope
} from "@/lib/tool-call-protocol";
import {
  buildToolCallActionFingerprint,
  createToolCallApprovalToken
} from "@/lib/tool-call-approval";
import { sovereignEnvDefault } from "@/lib/env-sovereign";

function normalizeOperatorCommand(input: string) {
  return input
    .trim()
    .replace(/^@sovereign-local-operator\s+/i, "")
    .replace(/^@sentinelsquad-local-operator\s+/i, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function isAvailabilityCommand(input: string) {
  const normalized = normalizeOperatorCommand(input);
  return (
    normalized === "/agents" ||
    normalized === "agents" ||
    normalized === "what agents are available?" ||
    normalized === "what agents are available" ||
    normalized === "/status"
  );
}

function isStatusCommand(input: string) {
  const normalized = normalizeOperatorCommand(input);
  return normalized === "/status";
}

function formatAvailabilitySummary(agents: UnifiedChatAgentAvailability[]) {
  if (!agents.length) {
    return "No unified-chat agents are registered yet.";
  }

  const lines = agents.map((agent) => {
    const status = agent.active ? "active" : "inactive";
    const details = [
      agent.controlRole,
      agent.runtime,
      agent.readiness,
      agent.model || "no-model"
    ].join(" / ");
    return `@${agent.key}: ${status} (${details})${agent.reason ? ` - ${agent.reason}` : ""}`;
  });

  return `Available agents:\n${lines.join("\n")}`;
}

export async function sendGlobalMessage(formData: FormData) {
  const session = await getAppSession();
  if (!session?.user) throw new Error("Not authenticated.");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userId = (session.user as any).id as string | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userEmail = ((session.user as any).email as string | undefined) ?? null;
  const content = String(formData.get("content") || "").trim();
  if (!content) return;

  const thread = await getOrCreateThread({
    kind: "GLOBAL",
    ref: "main",
    title: "Global",
    createdById: userId ?? null
  });

  await createMessage({
    threadId: thread.id,
    userId: userId ?? null,
    authorType: "HUMAN",
    content
  });

  if (isAvailabilityCommand(content)) {
    const agents = await listUnifiedChatAgentAvailability();
    if (isStatusCommand(content)) {
      const runtime = await getLocalRuntimeHealth();
      const provider = runtime.providers[0];
      const providerLine = provider
        ? `Runtime: ${provider.provider} ${provider.status} @ ${provider.endpoint}${
            provider.error ? ` - ${provider.error}` : ""
          }`
        : "Runtime: unavailable";
      const modelsLine = provider
        ? `Installed models: ${
            provider.installedModels.length ? provider.installedModels.join(", ") : "none"
          }`
        : "Installed models: none";
      const agentLines = runtime.agents.map((agent) => {
        const model = agent.resolvedModel || agent.configuredModel || "no-model";
        return `@${agent.agentKey}: ${agent.runtime} / ${agent.providerStatus} / ${model}${
          agent.issue ? ` - ${agent.issue}` : ""
        }`;
      });
      await createMessage({
        threadId: thread.id,
        authorType: "SYSTEM",
        content: [providerLine, modelsLine, "", "Agent runtime status:", ...agentLines].join("\n"),
        meta: {
          kind: "runtime_status_snapshot",
          providerStatus: provider?.status || "UNAVAILABLE",
          installedModelCount: provider?.installedModels.length || 0,
          agentCount: runtime.agents.length
        }
      });
      revalidatePath("/chat");
      return;
    }
    await createMessage({
      threadId: thread.id,
      authorType: "SYSTEM",
      content: formatAvailabilitySummary(agents),
      meta: {
        kind: "agent_availability_snapshot",
        count: agents.length,
        activeCount: agents.filter((agent) => agent.active).length
      }
    });
    revalidatePath("/chat");
    return;
  }

  const mention = parseAgentMention(content);
  if (mention.kind === "invalid") {
    await createMessage({
      threadId: thread.id,
      authorType: "SYSTEM",
      content: `Mention not queued: ${mention.reason}`,
      meta: {
        kind: "mention_invalid",
        reason: mention.reason,
        raw: mention.raw
      }
    });
  } else if (mention.kind === "agent") {
    const agents = await listUnifiedChatAgentAvailability();
    const knownAgent = agents.find(
      (agent) => agent.key.toLowerCase() === mention.agentKey.toLowerCase()
    );

    if (!knownAgent) {
      await createMessage({
        threadId: thread.id,
        authorType: "SYSTEM",
        content: `Mention not queued: @${mention.agentKey} is not a registered DB agent key.`,
        meta: {
          kind: "mention_unmapped",
          requestedAgent: mention.agentKey
        }
      });
    } else if (!knownAgent.active) {
      await createMessage({
        threadId: thread.id,
        authorType: "SYSTEM",
        content: `Mention not queued: @${knownAgent.key} is not active in unified chat. ${knownAgent.reason || ""}`.trim(),
        meta: {
          kind: "mention_inactive",
          requestedAgent: mention.agentKey,
          agentKey: knownAgent.key,
          reason: knownAgent.reason
        }
      });
    } else {
      const approvalCommand = parseToolCallApprovalRequestCommand(mention.command);
      if (approvalCommand.kind === "invalid") {
        await createMessage({
          threadId: thread.id,
          authorType: "SYSTEM",
          content: `Approval token not issued: ${approvalCommand.reason}`,
          meta: {
            kind: "tool_call_approval_invalid",
            reason: approvalCommand.reason
          }
        });
        revalidatePath("/chat");
        return;
      }
      if (approvalCommand.kind === "approve_tool_call") {
        if (!userId) {
          await createMessage({
            threadId: thread.id,
            authorType: "SYSTEM",
            content: "Approval token not issued: approver identity is missing from session.",
            meta: {
              kind: "tool_call_approval_denied",
              reason: "Approver identity is missing from session."
            }
          });
          revalidatePath("/chat");
          return;
        }
        const validation = validateToolCallProtocolEnvelope(approvalCommand.envelopeInput);
        if (!validation.present || !validation.ok) {
          await createMessage({
            threadId: thread.id,
            authorType: "SYSTEM",
            content: `Approval token not issued: ${validation.ok ? "tool-call payload is missing." : validation.reason}`,
            meta: {
              kind: "tool_call_approval_denied",
              reason: validation.ok ? "tool-call payload is missing." : validation.reason
            }
          });
          revalidatePath("/chat");
          return;
        }
        const actionFingerprint = buildToolCallActionFingerprint(validation.envelope);
        const tokenResult = createToolCallApprovalToken({
          approverUserId: userId,
          approverEmail: userEmail,
          actionFingerprint,
          ttlSeconds: approvalCommand.ttlSeconds ?? undefined
        });
        await createMessage({
          threadId: thread.id,
          authorType: "SYSTEM",
          content:
            `Approval token issued for @${knownAgent.key}. ` +
            `Expires: ${tokenResult.expiresAt}. ` +
            `Use with tool-call wrapper field \"approvalToken\".\n` +
            `Token: ${tokenResult.token}`,
          meta: {
            kind: "tool_call_approval_issued",
            agentKey: knownAgent.key,
            approverUserId: userId,
            approverEmail: userEmail,
            tokenId: tokenResult.tokenId,
            expiresAt: tokenResult.expiresAt,
            actionFingerprint,
            ...summarizeToolCallProtocolEnvelope(validation.envelope)
          }
        });
        revalidatePath("/chat");
        return;
      }

      const toolCallCommand = parseToolCallCommand(mention.command);
      if (toolCallCommand.kind === "invalid") {
        await createMessage({
          threadId: thread.id,
          authorType: "SYSTEM",
          content: `Mention not queued: ${toolCallCommand.reason}`,
          meta: {
            kind: "tool_call_invalid",
            reason: toolCallCommand.reason
          }
        });
        revalidatePath("/chat");
        return;
      }

      const isToolCall = toolCallCommand.kind === "tool_call";
      const taskTitle = isToolCall ? toolCallCommand.title : mention.command;
      const payload: Record<string, unknown> = {
        kind: isToolCall ? "chat_mention_tool_call" : "chat_mention",
        command: mention.command
      };
      if (isToolCall) {
        payload.toolCallProtocol = toolCallCommand.envelopeInput;
        if (toolCallCommand.approvalToken) {
          payload.toolCallApprovalToken = toolCallCommand.approvalToken;
        }
        payload.toolCallPolicy = {
          dryRun: toolCallCommand.dryRun
        };
      }

      const task = await enqueueTask({
        agentKey: knownAgent.key,
        title: taskTitle,
        threadId: thread.id,
        createdById: userId ?? null,
        createdByEmail: userEmail,
        payload
      });

      await createMessage({
        threadId: thread.id,
        authorType: "SYSTEM",
        content:
          task.status === "MANUAL_REQUIRED"
            ? `Manual required for @${knownAgent.key}: ${task.error || "Agent is not ready for autonomous execution."}`
            : task.error
            ? `Queued for @${knownAgent.key} (pending): ${task.error}`
            : isToolCall
            ? `Queued structured tool-call payload for @${knownAgent.key}.`
            : `Queued for @${knownAgent.key}: ${mention.command}`,
        meta: {
          kind: task.status === "MANUAL_REQUIRED" ? "task_manual_required" : "task_enqueued",
          agentKey: knownAgent.key,
          taskId: task.id,
          reason: task.error || null,
          structuredToolCall: isToolCall
        }
      });
    }
  }

  revalidatePath("/chat");
}

export async function initializeNexusCellAction() {
  const session = await getAppSession();
  if (!session?.user) throw new Error("Not authenticated.");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userId = (session.user as any).id as string | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userEmail = ((session.user as any).email as string | undefined) ?? null;

  const controllerKey = String(
    sovereignEnvDefault("SOVEREIGN_ORCH_CONTROLLER_KEY", "SENTINELSQUAD_ORCH_CONTROLLER_KEY", "Controller")
  ).trim();
  const command =
    "@Controller initialize the Sovereign orchestration environment and run a baseline team benchmark.";

  const thread = await getOrCreateThread({
    kind: "GLOBAL",
    ref: "main",
    title: "Global",
    createdById: userId ?? null
  });

  await createMessage({
    threadId: thread.id,
    userId: userId ?? null,
    authorType: "HUMAN",
    content: command
  });

  const controller = await resolveUnifiedChatControllerAgent(controllerKey);
  const resolvedController = controller.agent;

  if (!resolvedController) {
    await createMessage({
      threadId: thread.id,
      authorType: "SYSTEM",
      content: `Initialize squad orchestration not queued: neither @${controllerKey} nor any active ALPHA unified-chat agent is available.`,
      meta: {
        kind: "nexus_cell_init_unavailable",
        controllerKey
      }
    });
    revalidatePath("/chat");
    return;
  }

  const task = await enqueueTask({
    agentKey: resolvedController.key,
    title: command,
    threadId: thread.id,
    createdById: userId ?? null,
    createdByEmail: userEmail,
    payload: {
      kind: "chatdev_initialize_cell",
      command
    }
  });

  await createMessage({
    threadId: thread.id,
    authorType: "SYSTEM",
    content:
      task.status === "MANUAL_REQUIRED"
        ? `Initialize squad orchestration queued as manual-required for @${resolvedController.key}: ${task.error || "Agent not ready."}`
        : controller.fallback
        ? `Initialize squad orchestration queued for @${resolvedController.key} (fallback ALPHA; @${controllerKey} not found).`
        : `Initialize squad orchestration queued for @${resolvedController.key}.`,
    meta: {
      kind: "nexus_cell_init_enqueued",
      agentKey: resolvedController.key,
      taskId: task.id,
      reason: task.error || null,
      fallbackAlpha: controller.fallback,
      requestedControllerKey: controllerKey
    }
  });

  revalidatePath("/chat");
}
