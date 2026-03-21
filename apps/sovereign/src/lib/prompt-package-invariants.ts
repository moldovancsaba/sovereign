import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { AlphaContextPackageSnapshotKind, Prisma } from "@prisma/client";

type InvariantDb = Prisma.TransactionClient | typeof prisma;

function normalizeText(input: string | null | undefined) {
  return String(input || "").trim();
}

function normalizeProjectKey(projectName: string) {
  return normalizeText(projectName).toLowerCase();
}

function toJsonValue(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined;
  return value as Prisma.InputJsonValue;
}

function normalizeForHash(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map((entry) => normalizeForHash(entry));
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      out[key] = normalizeForHash(record[key]);
    }
    return out;
  }
  return value;
}

function computeSnapshotHash(value: unknown) {
  const canonical = JSON.stringify(normalizeForHash(value));
  return createHash("sha256").update(canonical).digest("hex");
}

export type TaskPromptPackageSnapshotInput = {
  sourceKind: string;
  sourceRef?: string | null;
  issueNumber?: number | null;
  promptText: string;
  packageBody?: string | null;
  packageSections?: unknown;
  payloadSnapshot?: unknown;
};

export async function recordTaskPromptPackageInvariant(params: {
  db: InvariantDb;
  taskId: string;
  snapshot: TaskPromptPackageSnapshotInput;
}) {
  const issueNumber =
    typeof params.snapshot.issueNumber === "number" && Number.isFinite(params.snapshot.issueNumber)
      ? Math.trunc(params.snapshot.issueNumber)
      : null;
  const sourceKind = normalizeText(params.snapshot.sourceKind) || "TASK_INPUT_FALLBACK";
  const sourceRef = normalizeText(params.snapshot.sourceRef) || null;
  const promptText = normalizeText(params.snapshot.promptText) || "(untitled task)";
  const packageBody = normalizeText(params.snapshot.packageBody) || null;

  const sectionsJson = toJsonValue(params.snapshot.packageSections);
  const payloadJson = toJsonValue(params.snapshot.payloadSnapshot);
  const snapshotHash = computeSnapshotHash({
    taskId: params.taskId,
    sourceKind,
    sourceRef,
    issueNumber,
    promptText,
    packageBody,
    packageSections: sectionsJson ?? null,
    payloadSnapshot: payloadJson ?? null
  });

  return params.db.taskPromptPackageInvariant.create({
    data: {
      taskId: params.taskId,
      sourceKind,
      sourceRef,
      issueNumber,
      snapshotHash,
      promptText,
      packageBody,
      packageSections: sectionsJson,
      payloadSnapshot: payloadJson
    }
  });
}

export type TaskPromptPackageInvariantSummary = {
  id: string;
  taskId: string;
  issueNumber: number | null;
  sourceKind: string;
  sourceRef: string | null;
  snapshotHash: string;
  promptText: string;
  createdAt: string;
  task: {
    status: string;
    title: string;
    agentKey: string;
    createdAt: string;
  };
};

export async function listIssueTaskPromptPackageInvariants(params: {
  issueNumber: number;
  limit?: number;
}): Promise<TaskPromptPackageInvariantSummary[]> {
  const issueNumber = Math.trunc(params.issueNumber);
  const rows = await prisma.taskPromptPackageInvariant.findMany({
    where: { issueNumber },
    include: {
      task: {
        select: {
          status: true,
          title: true,
          agentKey: true,
          createdAt: true
        }
      }
    },
    orderBy: [{ createdAt: "desc" }],
    take: Math.min(Math.max(params.limit ?? 30, 1), 200)
  });

  return rows.map((row) => ({
    id: row.id,
    taskId: row.taskId,
    issueNumber: row.issueNumber,
    sourceKind: row.sourceKind,
    sourceRef: row.sourceRef,
    snapshotHash: row.snapshotHash,
    promptText: row.promptText,
    createdAt: row.createdAt.toISOString(),
    task: {
      status: row.task.status,
      title: row.task.title,
      agentKey: row.task.agentKey,
      createdAt: row.task.createdAt.toISOString()
    }
  }));
}

export type AlphaContextPackageInvariantInput = {
  windowId: string;
  projectKey: string;
  projectName: string;
  snapshotKind: AlphaContextPackageSnapshotKind;
  sourceRef?: string | null;
  handoverRef?: string | null;
  handoverPackageRef?: string | null;
  continuationPromptRef?: string | null;
  continuityNote?: string | null;
  payloadSnapshot?: unknown;
  createdById?: string | null;
  predecessorSnapshotId?: string | null;
};

export async function getLatestAlphaContextPackageInvariant(params: {
  db: InvariantDb;
  windowId: string;
}) {
  return params.db.alphaContextPackageInvariant.findFirst({
    where: { windowId: params.windowId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { id: true }
  });
}

export async function recordAlphaContextPackageInvariant(params: {
  db: InvariantDb;
  input: AlphaContextPackageInvariantInput;
}) {
  const projectKey = normalizeText(params.input.projectKey).toLowerCase();
  const projectName = normalizeText(params.input.projectName);
  const sourceRef = normalizeText(params.input.sourceRef) || null;
  const handoverRef = normalizeText(params.input.handoverRef) || null;
  const handoverPackageRef = normalizeText(params.input.handoverPackageRef) || null;
  const continuationPromptRef = normalizeText(params.input.continuationPromptRef) || null;
  const continuityNote = normalizeText(params.input.continuityNote) || null;

  const predecessorSnapshotId =
    params.input.predecessorSnapshotId !== undefined
      ? params.input.predecessorSnapshotId
      : (await getLatestAlphaContextPackageInvariant({
          db: params.db,
          windowId: params.input.windowId
        }))?.id || null;

  const payloadJson = toJsonValue(params.input.payloadSnapshot);
  const snapshotHash = computeSnapshotHash({
    windowId: params.input.windowId,
    projectKey,
    projectName,
    snapshotKind: params.input.snapshotKind,
    predecessorSnapshotId,
    sourceRef,
    handoverRef,
    handoverPackageRef,
    continuationPromptRef,
    continuityNote,
    payloadSnapshot: payloadJson ?? null
  });

  return params.db.alphaContextPackageInvariant.create({
    data: {
      windowId: params.input.windowId,
      projectKey,
      projectName,
      snapshotKind: params.input.snapshotKind,
      predecessorSnapshotId,
      sourceRef,
      snapshotHash,
      handoverRef,
      handoverPackageRef,
      continuationPromptRef,
      continuityNote,
      payloadSnapshot: payloadJson,
      createdById: normalizeText(params.input.createdById) || null
    }
  });
}

export type AlphaContextPackageInvariantSummary = {
  id: string;
  windowId: string;
  projectKey: string;
  projectName: string;
  snapshotKind: AlphaContextPackageSnapshotKind;
  predecessorSnapshotId: string | null;
  sourceRef: string | null;
  snapshotHash: string;
  handoverRef: string | null;
  handoverPackageRef: string | null;
  continuationPromptRef: string | null;
  continuityNote: string | null;
  createdAt: string;
  ownerAgentKey: string;
  windowStatus: string;
};

export async function listProjectAlphaContextPackageInvariants(params: {
  projectName: string;
  limit?: number;
}): Promise<AlphaContextPackageInvariantSummary[]> {
  const projectKey = normalizeProjectKey(params.projectName);
  if (!projectKey) return [];

  const rows = await prisma.alphaContextPackageInvariant.findMany({
    where: { projectKey },
    include: {
      window: {
        select: {
          ownerAgentKey: true,
          status: true
        }
      }
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: Math.min(Math.max(params.limit ?? 40, 1), 250)
  });

  return rows.map((row) => ({
    id: row.id,
    windowId: row.windowId,
    projectKey: row.projectKey,
    projectName: row.projectName,
    snapshotKind: row.snapshotKind,
    predecessorSnapshotId: row.predecessorSnapshotId,
    sourceRef: row.sourceRef,
    snapshotHash: row.snapshotHash,
    handoverRef: row.handoverRef,
    handoverPackageRef: row.handoverPackageRef,
    continuationPromptRef: row.continuationPromptRef,
    continuityNote: row.continuityNote,
    createdAt: row.createdAt.toISOString(),
    ownerAgentKey: row.window.ownerAgentKey,
    windowStatus: row.window.status
  }));
}
