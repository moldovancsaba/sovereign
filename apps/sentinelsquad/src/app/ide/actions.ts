"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/session";
import {
  getIdeUnsafeModeInfo,
  getIdeGitDiff,
  listIdeTree,
  readIdeFile,
  runIdeCommand,
  saveIdeFile
} from "@/lib/ide";
import { enqueueTask } from "@/lib/tasks";
import { createMessage, getOrCreateThread } from "@/lib/chat";
import { prisma } from "@/lib/prisma";
import { archiveProjectSession, getOrCreateProjectSession } from "@/lib/project-sessions";
import { createThreadEvent } from "@/lib/thread-events";

export async function ideListAction(formData: FormData) {
  const session = await requireSession();
  if (!session) throw new Error("Unauthorized");
  const relPath = String(formData.get("relPath") || "");
  return await listIdeTree(relPath);
}

export async function ideReadAction(formData: FormData) {
  const session = await requireSession();
  if (!session) throw new Error("Unauthorized");
  const relPath = String(formData.get("relPath") || "");
  return await readIdeFile(relPath);
}

export async function ideSaveAction(formData: FormData) {
  const session = await requireSession();
  if (!session) throw new Error("Unauthorized");
  const relPath = String(formData.get("relPath") || "");
  const content = String(formData.get("content") || "");
  await saveIdeFile(relPath, content);
  revalidatePath("/ide");
  return { ok: true };
}

export async function ideRunCommandAction(formData: FormData) {
  const session = await requireSession();
  if (!session) throw new Error("Unauthorized");
  const command = String(formData.get("command") || "");
  const cwdRelPath = String(formData.get("cwdRelPath") || "");
  const unsafePhrase = String(formData.get("unsafePhrase") || "");
  return await runIdeCommand(command, cwdRelPath, unsafePhrase);
}

export async function ideUnsafeModeInfoAction() {
  const session = await requireSession();
  if (!session) throw new Error("Unauthorized");
  return getIdeUnsafeModeInfo();
}

export async function ideGitDiffAction(formData: FormData) {
  const session = await requireSession();
  if (!session) throw new Error("Unauthorized");
  const relPath = String(formData.get("relPath") || "");
  const cwdRelPath = String(formData.get("cwdRelPath") || "");
  return await getIdeGitDiff(relPath, cwdRelPath);
}

export async function ideOpenProjectSessionAction(formData: FormData) {
  const session = await requireSession();
  if (!session) throw new Error("Unauthorized");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userId = (session.user as any).id as string | undefined;

  const relPath = String(formData.get("relPath") || "").trim();
  const displayName = String(formData.get("displayName") || "").trim();

  const projectSession = await getOrCreateProjectSession({
    relPath,
    displayName,
    createdById: userId ?? null,
    metadata: {
      source: "ide",
      openedFrom: relPath || "."
    }
  });
  const globalThread = await getOrCreateThread({
    kind: "GLOBAL",
    ref: "main",
    title: "Global",
    createdById: userId ?? null
  });
  await createThreadEvent({
    threadId: globalThread.id,
    kind: "PROJECT_SESSION_OPENED",
    payload: {
      projectSessionId: projectSession.id,
      relPath: projectSession.relPath,
      displayName: projectSession.displayName,
      source: "ide"
    }
  });

  revalidatePath("/ide");
  revalidatePath("/chat");
  return projectSession;
}

export async function ideArchiveProjectSessionAction(formData: FormData) {
  const session = await requireSession();
  if (!session) throw new Error("Unauthorized");
  const sessionId = String(formData.get("sessionId") || "").trim();
  if (!sessionId) throw new Error("sessionId is required.");
  await archiveProjectSession(sessionId);
  revalidatePath("/ide");
  return { ok: true };
}

export async function ideHandoffAction(formData: FormData) {
  const session = await requireSession();
  if (!session) throw new Error("Unauthorized");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userId = (session.user as any).id as string | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userEmail = ((session.user as any).email as string | undefined) ?? null;

  const agentInput = String(formData.get("agentKey") || "").trim();
  const relPath = String(formData.get("relPath") || "").trim();
  const context = String(formData.get("context") || "").trim();
  const cwdRelPath = String(formData.get("cwdRelPath") || "").trim();

  if (!agentInput) throw new Error("agentKey is required.");
  if (!relPath) throw new Error("relPath is required.");

  const agent = await prisma.agent.findFirst({
    where: {
      key: { equals: agentInput, mode: "insensitive" },
      runtime: { not: "MANUAL" },
      enabled: true
    },
    select: { key: true }
  });
  if (!agent) throw new Error(`Unknown runtime agent: ${agentInput}`);

  const thread = await getOrCreateThread({
    kind: "GLOBAL",
    ref: "main",
    title: "Global",
    createdById: userId ?? null
  });
  const projectSession = await getOrCreateProjectSession({
    relPath: cwdRelPath,
    createdById: userId ?? null,
    metadata: {
      source: "ide_handoff",
      selectedFile: relPath
    }
  });

  const title = `IDE handoff: ${relPath}`;
  const task = await enqueueTask({
    agentKey: agent.key,
    title,
    threadId: thread.id,
    createdById: userId ?? null,
    createdByEmail: userEmail,
    payload: {
      kind: "ide_handoff",
      relPath,
      cwdRelPath,
      context,
      projectSessionId: projectSession.id,
      projectSessionRelPath: projectSession.relPath,
      projectSessionDisplayName: projectSession.displayName
    }
  });

  await createMessage({
    threadId: thread.id,
    userId: userId ?? null,
    authorType: "SYSTEM",
    content:
      task.status === "MANUAL_REQUIRED"
        ? `IDE handoff pending manual step for @${agent.key}: ${title}`
        : `IDE handoff queued for @${agent.key}: ${title}`,
      meta: {
      kind: "ide_handoff_enqueued",
      agentKey: agent.key,
      taskId: task.id,
      relPath,
      projectSessionId: projectSession.id,
      projectSessionRelPath: projectSession.relPath
    }
  });

  revalidatePath("/chat");
  revalidatePath("/ide");
  return { ok: true, taskId: task.id, status: task.status };
}
