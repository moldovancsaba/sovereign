import path from "node:path";
import { prisma } from "@/lib/prisma";
import { getIdeWorkspaceRoot } from "@/lib/ide";

function normalizeRelPath(relPath: string) {
  const normalized = String(relPath || "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");
  return normalized;
}

function deriveDisplayName(relPath: string) {
  if (!relPath) return path.basename(getIdeWorkspaceRoot()) || "workspace";
  const parts = relPath.split("/").filter(Boolean);
  return parts[parts.length - 1] || "workspace";
}

export async function getOrCreateProjectSession(params: {
  relPath?: string;
  displayName?: string | null;
  createdById?: string | null;
  metadata?: unknown;
}) {
  const rootPath = getIdeWorkspaceRoot();
  const relPath = normalizeRelPath(params.relPath || "");
  const displayName = (params.displayName || "").trim() || deriveDisplayName(relPath);
  const metadata = (params.metadata ?? {}) as never;

  const existing = await prisma.projectSession.findUnique({
    where: { rootPath_relPath: { rootPath, relPath } }
  });

  if (existing) {
    return prisma.projectSession.update({
      where: { id: existing.id },
      data: {
        displayName,
        status: "ACTIVE",
        metadata,
        lastOpenedAt: new Date()
      }
    });
  }

  return prisma.projectSession.create({
    data: {
      rootPath,
      relPath,
      displayName,
      metadata,
      createdById: params.createdById ?? null
    }
  });
}

export async function listRecentProjectSessions(limit = 12) {
  return prisma.projectSession.findMany({
    where: { status: "ACTIVE" },
    orderBy: [{ lastOpenedAt: "desc" }, { createdAt: "desc" }],
    take: limit
  });
}

export async function archiveProjectSession(sessionId: string) {
  return prisma.projectSession.update({
    where: { id: sessionId },
    data: { status: "ARCHIVED" }
  });
}
