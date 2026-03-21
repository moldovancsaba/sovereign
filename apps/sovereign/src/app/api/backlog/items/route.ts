import { NextResponse } from "next/server";
import { getAppSession } from "@/lib/app-session";
import { getOrCreateDefaultBoard } from "@/lib/backlog";
import { prisma } from "@/lib/prisma";
import type { BacklogItemStatus } from "@prisma/client";

const VALID_STATUSES: BacklogItemStatus[] = ["BACKLOG", "READY", "IN_PROGRESS", "IN_REVIEW", "DONE", "CANCELLED"];

export async function GET(req: Request) {
  const session = await getAppSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const boardId = searchParams.get("boardId");
  const status = searchParams.get("status");
  const goalId = searchParams.get("goalId");

  try {
    let boardIdResolved = boardId;
    if (!boardIdResolved) {
      const defaultBoard = await getOrCreateDefaultBoard();
      boardIdResolved = defaultBoard.id;
    }

    const where: { boardId: string; status?: BacklogItemStatus; goalId?: string | null } = {
      boardId: boardIdResolved
    };
    if (status && VALID_STATUSES.includes(status as BacklogItemStatus)) where.status = status as BacklogItemStatus;
    if (goalId) where.goalId = goalId;

    const items = await prisma.backlogItem.findMany({
      where,
      orderBy: [{ priority: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
      include: {
        goal: { select: { id: true, title: true } },
        thread: { select: { id: true, ref: true, title: true } }
      }
    });
    return NextResponse.json(items, { status: 200 });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: "Failed to list items.", message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const session = await getAppSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  try {
    const body = await req.json();
    let boardId = typeof body.boardId === "string" ? body.boardId : null;
    if (!boardId) {
      const defaultBoard = await getOrCreateDefaultBoard();
      boardId = defaultBoard.id;
    }

    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!title) {
      return NextResponse.json({ error: "title is required." }, { status: 400 });
    }

    const description = typeof body.description === "string" ? body.description : null;
    const goalId = typeof body.goalId === "string" ? body.goalId : null;
    const acceptanceCriteria = Array.isArray(body.acceptanceCriteria)
      ? body.acceptanceCriteria
      : typeof body.acceptanceCriteria === "string"
        ? body.acceptanceCriteria.split("\n").filter(Boolean)
        : null;
    const threadId = typeof body.threadId === "string" ? body.threadId : null;
    const priority = typeof body.priority === "number" ? body.priority : 0;
    const status = typeof body.status === "string" && ["BACKLOG","READY","IN_PROGRESS","IN_REVIEW","DONE","CANCELLED"].includes(body.status)
      ? body.status
      : "BACKLOG";

    const item = await prisma.backlogItem.create({
      data: {
        boardId,
        goalId,
        title,
        description,
        acceptanceCriteria: acceptanceCriteria ? acceptanceCriteria : undefined,
        status,
        priority,
        threadId,
        createdById: session.user.id
      },
      include: {
        goal: { select: { id: true, title: true } },
        thread: { select: { id: true, ref: true } }
      }
    });
    return NextResponse.json(item, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: "Failed to create item.", message }, { status: 500 });
  }
}
