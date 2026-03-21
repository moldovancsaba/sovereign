import { NextResponse } from "next/server";
import { getAppSession } from "@/lib/app-session";
import { prisma } from "@/lib/prisma";
import type { BacklogItemStatus } from "@prisma/client";

type Params = { params: Promise<{ id: string }> };

const VALID_STATUSES: BacklogItemStatus[] = ["BACKLOG", "READY", "IN_PROGRESS", "IN_REVIEW", "DONE", "CANCELLED"];

export async function GET(_req: Request, { params }: Params) {
  const session = await getAppSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { id } = await params;
  try {
    const item = await prisma.backlogItem.findUnique({
      where: { id },
      include: {
        board: true,
        goal: true,
        thread: { select: { id: true, ref: true, title: true } },
        feedback: { orderBy: { createdAt: "desc" }, take: 20 }
      }
    });
    if (!item) return NextResponse.json({ error: "Not found." }, { status: 404 });
    return NextResponse.json(item, { status: 200 });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: "Failed to get item.", message }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: Params) {
  const session = await getAppSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { id } = await params;
  try {
    const body = await req.json();
    const data: Parameters<typeof prisma.backlogItem.update>[0]["data"] = {};

    if (typeof body.title === "string") data.title = body.title.trim();
    if (body.description !== undefined) data.description = body.description === null || body.description === "" ? null : String(body.description);
    if (body.goalId !== undefined) data.goalId = body.goalId === null || body.goalId === "" ? null : body.goalId;
    if (Array.isArray(body.acceptanceCriteria)) data.acceptanceCriteria = body.acceptanceCriteria;
    if (body.threadId !== undefined) data.threadId = typeof body.threadId === "string" && body.threadId ? body.threadId : null;
    if (typeof body.priority === "number") data.priority = body.priority;
    if (typeof body.sortOrder === "number") data.sortOrder = body.sortOrder;
    if (VALID_STATUSES.includes(body.status)) data.status = body.status as BacklogItemStatus;

    const item = await prisma.backlogItem.update({
      where: { id },
      data,
      include: {
        goal: { select: { id: true, title: true } },
        thread: { select: { id: true, ref: true } }
      }
    });
    return NextResponse.json(item, { status: 200 });
  } catch (e) {
    if (e && typeof e === "object" && "code" in e && e.code === "P2025") {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: "Failed to update item.", message }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  const session = await getAppSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { id } = await params;
  try {
    await prisma.backlogItem.delete({ where: { id } });
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    if (e && typeof e === "object" && "code" in e && e.code === "P2025") {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: "Failed to delete item.", message }, { status: 500 });
  }
}
