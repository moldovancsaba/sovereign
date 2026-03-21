import { NextResponse } from "next/server";
import { getAppSession } from "@/lib/app-session";
import { getOrCreateDefaultBoard } from "@/lib/backlog";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getAppSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  try {
    const boards = await prisma.backlogBoard.findMany({
      orderBy: { updatedAt: "desc" },
      include: {
        _count: { select: { items: true, goals: true } }
      }
    });
    return NextResponse.json(boards, { status: 200 });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: "Failed to list boards.", message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const session = await getAppSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  try {
    const body = await req.json();
    const name = typeof body.name === "string" ? body.name.trim() : "Backlog";
    const productScope = typeof body.productScope === "string" ? body.productScope.trim() || null : null;

    const board = await prisma.backlogBoard.create({
      data: { name, productScope }
    });
    return NextResponse.json(board, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: "Failed to create board.", message }, { status: 500 });
  }
}
