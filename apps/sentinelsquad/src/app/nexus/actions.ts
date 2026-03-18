"use server";

import { exec } from "node:child_process";
import { promisify } from "node:util";
import { revalidatePath } from "next/cache";
import { getAppSession } from "@/lib/app-session";
import { createMessage, getOrCreateThread } from "@/lib/chat";
import { enqueueTask } from "@/lib/tasks";
import { resolveUnifiedChatControllerAgent } from "@/lib/active-agents";
import {
  getExternalWorkflowRuntimePath,
  getNexusRoleMapping,
  getOrchestrationBenchmarkWorkflowPath,
  readNexusRunArtifact,
  writeNexusRunArtifact
} from "@/lib/nexus-control";

const execAsync = promisify(exec);

async function requireUser() {
  const session = await getAppSession();
  if (!session?.user) throw new Error("Not authenticated.");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userId = (session.user as any).id as string | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userEmail = ((session.user as any).email as string | undefined) ?? null;
  return { userId: userId ?? null, userEmail };
}

async function resolveControllerAgentKey() {
  const mapping = getNexusRoleMapping();
  const resolved = await resolveUnifiedChatControllerAgent(mapping.controllerKey);
  return {
    key: resolved.agent?.key || null,
    fallback: resolved.fallback,
    requested: mapping.controllerKey
  };
}

export async function runNexusSeminarAction() {
  await requireUser();

  const runtimePath = getExternalWorkflowRuntimePath();
  const workflowPath = getOrchestrationBenchmarkWorkflowPath();
  const prompt =
    "@Controller initialize the SentinelSquad orchestration environment and run a baseline team benchmark.";

  const command = [
    `cd \"${runtimePath}\"`,
    `source .venv/bin/activate`,
    `printf '%s\\n' \"${prompt.replace(/\"/g, "'")}\" | BASE_URL='http://127.0.0.1:11434/v1' API_KEY='ollama-local' python run.py --path \"${workflowPath}\" --name SentinelSquadControllerBenchmark`
  ].join(" && ");

  try {
    const { stdout, stderr } = await execAsync(`bash -lc ${JSON.stringify(command)}`, {
      timeout: 180_000,
      maxBuffer: 1024 * 1024
    });
    const output = `${stdout || ""}${stderr || ""}`.trim().slice(0, 30000);
    await writeNexusRunArtifact({
      timestamp: new Date().toISOString(),
      ok: true,
      command,
      workflowPath,
      output
    });
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string; message?: string };
    const output = `${err.stdout || ""}\n${err.stderr || ""}\n${err.message || ""}`
      .trim()
      .slice(0, 30000);
    await writeNexusRunArtifact({
      timestamp: new Date().toISOString(),
      ok: false,
      command,
      workflowPath,
      output
    });
    throw new Error("Orchestration benchmark execution failed. Check last run output on /nexus.");
  }

  revalidatePath("/nexus");
}

export async function syncNexusSeminarToSentinelSquadAction() {
  const { userId, userEmail } = await requireUser();

  const last = await readNexusRunArtifact();
  if (!last) throw new Error("No orchestration benchmark run artifact found.");

  const controller = await resolveControllerAgentKey();
  if (!controller.key) {
    throw new Error("No active controller or ALPHA fallback agent is available for unified execution.");
  }

  const thread = await getOrCreateThread({
    kind: "GLOBAL",
    ref: "main",
    title: "Global",
    createdById: userId
  });

  const summary = [
    `SentinelSquad orchestration sync (${last.ok ? "PASS" : "FAIL"})`,
    `timestamp=${last.timestamp}`,
    `workflow=${last.workflowPath}`,
    "output:",
    last.output.slice(0, 4000)
  ].join("\n");

  await createMessage({
    threadId: thread.id,
    userId,
    authorType: "SYSTEM",
    content: summary,
    meta: {
      kind: "orchestration_sync",
      success: last.ok,
      fallbackController: controller.fallback,
      requestedControllerKey: controller.requested
    }
  });

  const task = await enqueueTask({
    agentKey: controller.key,
    title: "SentinelSquad orchestration follow-up: validate and report",
    threadId: thread.id,
    createdById: userId,
    createdByEmail: userEmail,
    payload: {
      kind: "orchestration_sync_task",
      benchmarkSuccess: last.ok,
      benchmarkTimestamp: last.timestamp,
      benchmarkOutput: last.output.slice(0, 12000)
    }
  });

  await createMessage({
    threadId: thread.id,
    authorType: "SYSTEM",
    content: `SentinelSquad orchestration follow-up queued for @${controller.key} (task ${task.id}).`,
    meta: {
      kind: "orchestration_followup_enqueued",
      taskId: task.id,
      agentKey: controller.key
    }
  });

  revalidatePath("/chat");
  revalidatePath("/nexus");
}
