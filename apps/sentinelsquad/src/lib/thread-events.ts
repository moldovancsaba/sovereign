import { prisma } from "@/lib/prisma";
import type { ChatEvent, ChatMessage, User } from "../../node_modules/.prisma/client";

type ThreadEventPayload = Record<string, unknown> | null;

export async function createThreadEvent(params: {
  threadId: string;
  kind:
    | "TASK_ENQUEUED"
    | "TASK_MANUAL_REQUIRED"
    | "PROJECT_SESSION_OPENED"
    | "TOOL_CALL_EXECUTED"
    | "TOOL_CALL_FAILED";
  actorKey?: string | null;
  taskId?: string | null;
  payload?: ThreadEventPayload;
}) {
  return prisma.chatEvent.create({
    data: {
      threadId: params.threadId,
      kind: params.kind as never,
      actorKey: params.actorKey ?? null,
      taskId: params.taskId ?? null,
      payload: (params.payload ?? null) as never
    }
  });
}

export async function listThreadEvents(threadId: string, limit = 200) {
  return prisma.chatEvent.findMany({
    where: { threadId },
    orderBy: { createdAt: "asc" },
    take: limit
  });
}

export async function listThreadTimeline(threadId: string, limit = 200) {
  const [messages, events] = await Promise.all([
    prisma.chatMessage.findMany({
      where: { threadId },
      orderBy: { createdAt: "asc" },
      take: limit,
      include: { user: true }
    }),
    listThreadEvents(threadId, limit)
  ]);

  return [
    ...messages.map((message: ChatMessage & { user: User | null }) => ({
      type: "message" as const,
      createdAt: message.createdAt,
      message
    })),
    ...events.map((event: ChatEvent) => ({
      type: "event" as const,
      createdAt: event.createdAt,
      event
    }))
  ]
    .sort((a, b) => {
      const timeDelta = a.createdAt.getTime() - b.createdAt.getTime();
      if (timeDelta !== 0) return timeDelta;
      return a.type.localeCompare(b.type);
    });
}
