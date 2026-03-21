import { NextResponse } from "next/server";
import { getAppSession } from "@/lib/app-session";
import { getOrCreateDefaultBoard } from "@/lib/backlog";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const session = await getAppSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const boardId = searchParams.get("boardId");

  try {
    let boardIdResolved = boardId;
    if (!boardIdResolved) {
      const defaultBoard = await getOrCreateDefaultBoard();
      boardIdResolved = defaultBoard.id;
    }

    const goals = await prisma.backlogGoal.findMany({
      where: { boardId: boardIdResolved },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      include: { _count: { select: { items: true } } }
    });
    return NextResponse.json(goals, { status: 200 });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: "Failed to list goals.", message }, { status: 500 });
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
    const sortOrder = typeof body.sortOrder === "number" ? body.sortOrder : 0;

    const goal = await prisma.backlogGoal.create({
      data: { boardId, title, description, sortOrder }
    });
    return NextResponse.json(goal, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: "Failed to create goal.", message }, { status: 500 });
  }
}
