import { prisma } from "@/lib/prisma";

export async function getOrCreateThread(params: {
  kind: "GLOBAL" | "ISSUE" | "PRODUCT";
  ref: string;
  title?: string;
  createdById?: string | null;
}) {
  const existing = await prisma.chatThread.findUnique({
    where: { kind_ref: { kind: params.kind, ref: params.ref } }
  });
  if (existing) return existing;

  return prisma.chatThread.create({
    data: {
      kind: params.kind,
      ref: params.ref,
      title: params.title,
      createdById: params.createdById ?? null
    }
  });
}

export async function listMessages(threadId: string, limit = 200) {
  return prisma.chatMessage.findMany({
    where: { threadId },
    orderBy: { createdAt: "asc" },
    take: limit,
    include: { user: true }
  });
}

export async function createMessage(params: {
  threadId: string;
  userId?: string | null;
  authorType: "HUMAN" | "AGENT" | "SYSTEM";
  authorKey?: string | null;
  content: string;
  meta?: unknown;
}) {
  const content = params.content.trim();
  if (!content) throw new Error("Empty message.");
  if (content.length > 12000) throw new Error("Message too large.");

  return prisma.chatMessage.create({
    data: {
      threadId: params.threadId,
      userId: params.userId ?? null,
      authorType: params.authorType,
      authorKey: params.authorKey ?? null,
      content,
      meta: params.meta as never
    }
  });
}

