import { promises as fs } from "node:fs";
import path from "node:path";

export type NexusRoleMapping = {
  drafterKey: string;
  writerKey: string;
  controllerKey: string;
};

export function getNexusRoleMapping(): NexusRoleMapping {
  return {
    drafterKey: String(process.env.SENTINELSQUAD_ORCH_DRAFTER_KEY || "Drafter").trim(),
    writerKey: String(process.env.SENTINELSQUAD_ORCH_WRITER_KEY || "Writer").trim(),
    controllerKey: String(process.env.SENTINELSQUAD_ORCH_CONTROLLER_KEY || "Controller").trim()
  };
}

export function getExternalWorkflowRuntimePath() {
  return String(
    process.env.SENTINELSQUAD_CHATDEV_PATH ||
      path.resolve(process.cwd(), "..", "..", "external", "ChatDev")
  ).trim();
}

export function getOrchestrationBenchmarkWorkflowPath() {
  return String(
    process.env.SENTINELSQUAD_CHATDEV_WORKFLOW_PATH ||
      path.join(getExternalWorkflowRuntimePath(), "yaml_instance", "nexus_controller_seminar.yaml")
  ).trim();
}

export function getNexusRunArtifactPath() {
  return path.resolve(process.cwd(), ".sentinelsquad", "nexus-last-run.json");
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
