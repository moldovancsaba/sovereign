import { NextResponse } from "next/server";
import { getAppSession } from "@/lib/app-session";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  const session = await getAppSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  try {
    const body = await req.json();
    const backlogItemId = typeof body.backlogItemId === "string" ? body.backlogItemId : null;
    const kind = body.kind;
    const reason = typeof body.reason === "string" ? body.reason : null;
    const threadId = typeof body.threadId === "string" ? body.threadId : null;

    if (!backlogItemId) {
      return NextResponse.json({ error: "backlogItemId is required." }, { status: 400 });
    }
    if (!["ACCEPTED", "REJECTED", "CHANGE_REQUEST"].includes(kind)) {
      return NextResponse.json({ error: "kind must be ACCEPTED, REJECTED, or CHANGE_REQUEST." }, { status: 400 });
    }

    const feedback = await prisma.pOFeedback.create({
      data: {
        backlogItemId,
        kind,
        reason,
        threadId,
        createdById: session.user.id
      }
    });
    return NextResponse.json(feedback, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: "Failed to add feedback.", message }, { status: 500 });
  }
}
