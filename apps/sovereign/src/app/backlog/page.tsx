import { redirect } from "next/navigation";
import { Shell } from "@/components/Shell";
import { requireSession } from "@/lib/session";
import { getOrCreateDefaultBoard } from "@/lib/backlog";
import { prisma } from "@/lib/prisma";
import { BacklogBoardClient } from "./BacklogBoardClient";

export const dynamic = "force-dynamic";

const COLUMN_ORDER = [
  "BACKLOG",
  "READY",
  "IN_PROGRESS",
  "IN_REVIEW",
  "DONE",
  "CANCELLED"
] as const;

export default async function BacklogPage() {
  const session = await requireSession();
  if (!session) redirect("/signin");

  const board = await getOrCreateDefaultBoard();
  const items = await prisma.backlogItem.findMany({
    where: { boardId: board.id },
    orderBy: [{ priority: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
    include: {
      goal: { select: { id: true, title: true } },
      thread: { select: { id: true, ref: true, title: true } }
    }
  });

  const goals = await prisma.backlogGoal.findMany({
    where: { boardId: board.id },
    orderBy: { sortOrder: "asc" }
  });

  return (
    <Shell
      title="Backlog"
      subtitle="Read-only view. Create, update, and prioritise items via chat with the agent."
    >
      <BacklogBoardClient
        boardId={board.id}
        boardName={board.name}
        columns={COLUMN_ORDER}
        items={items.map((it) => ({
          id: it.id,
          title: it.title,
          description: it.description,
          status: it.status,
          priority: it.priority,
          acceptanceCriteria: it.acceptanceCriteria as string[] | null,
          goalId: it.goalId,
          goalTitle: it.goal?.title ?? null,
          threadRef: it.thread?.ref ?? null,
          createdAt: it.createdAt.toISOString()
        }))}
        goals={goals.map((g) => ({ id: g.id, title: g.title }))}
      />
    </Shell>
  );
}
