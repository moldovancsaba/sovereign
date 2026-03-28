import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const taskId = searchParams.get("taskId");

  if (!taskId) {
    return NextResponse.json({ error: "taskId is required" }, { status: 400 });
  }

  try {
    const task = await prisma.agentTask.findUnique({
      where: { id: taskId },
      select: {
        id: true,
        status: true,
        payload: true,
        error: true,
        finishedAt: true,
      }
    });

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    return NextResponse.json(task);

  } catch (error) {
    console.error("Status Check Error:", error);
    return NextResponse.json({ error: "Failed to retrieve task status" }, { status: 500 });
  }
}
