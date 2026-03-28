import fsSync from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";
import { sovereignEnvDefault } from "@/lib/env-sovereign";

export type NexusRoleMapping = {
  drafterKey: string;
  writerKey: string;
  controllerKey: string;
};

export function getNexusRoleMapping(): NexusRoleMapping {
  return {
    drafterKey: String(sovereignEnvDefault("SOVEREIGN_ORCH_DRAFTER_KEY", "Drafter")).trim(),
    writerKey: String(sovereignEnvDefault("SOVEREIGN_ORCH_WRITER_KEY", "Writer")).trim(),
    controllerKey: String(sovereignEnvDefault("SOVEREIGN_ORCH_CONTROLLER_KEY", "Controller")).trim()
  };
}

export function getExternalWorkflowRuntimePath() {
  return String(
    sovereignEnvDefault(
      "SOVEREIGN_CHATDEV_PATH",
      path.resolve(process.cwd(), "..", "..", "external", "ChatDev")
    )
  ).trim();
}

export function getOrchestrationBenchmarkWorkflowPath() {
  return String(
    process.env.SOVEREIGN_CHATDEV_WORKFLOW_PATH ||
      path.join(getExternalWorkflowRuntimePath(), "yaml_instance", "nexus_controller_seminar.yaml")
  ).trim();
}

export function getNexusRunArtifactPath() {
  return path.resolve(process.cwd(), ".sovereign", "nexus-last-run.json");
}

export async function readNexusRunArtifact() {
  const file = getNexusRunArtifactPath();
  try {
    const raw = await fs.readFile(file, "utf-8");
    return JSON.parse(raw) as {
      timestamp: string;
      ok: boolean;
      command: string;
      workflowPath: string;
      output: string;
    };
  } catch {
    return null;
  }
}

export async function writeNexusRunArtifact(data: {
  timestamp: string;
  ok: boolean;
  command: string;
  workflowPath: string;
  output: string;
}) {
  const file = getNexusRunArtifactPath();
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(data, null, 2)}\n`, "utf-8");
}

import { prisma } from "@/lib/prisma";
import { SovereignStatePayload } from "@/lib/sovereign-dag";

export async function listSovereignTasks(limit = 20) {
  try {
    return await prisma.agentTask.findMany({
      where: {
        agentKey: "SOVEREIGN_DAG",
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        status: true,
        title: true,
        createdAt: true,
        startedAt: true,
        finishedAt: true,
        payload: true,
      },
    });
  } catch (e) {
    console.error("Failed to list Sovereign tasks:", e);
    return [];
  }
}

export async function getSovereignTaskDetail(id: string) {
  try {
    const task = await prisma.agentTask.findUnique({
      where: { id },
    });
    if (!task) return null;
    return {
      ...task,
      payload: task.payload as unknown as SovereignStatePayload,
    };
  } catch (e) {
    console.error(`Failed to get Sovereign task ${id}:`, e);
    return null;
  }
}

export async function readNexusModelRouting() {
  const file = path.resolve(process.cwd(), "nexus", "ChatChainConfig.json");
  try {
    const raw = await fs.readFile(file, "utf-8");
    const parsed = JSON.parse(raw) as { modelRouting?: Record<string, string> };
    return parsed.modelRouting || {};
  } catch {
    return {};
  }
}
