import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const { taskId, callbackToken, approved, feedback } = await req.json();

    if (!taskId || !callbackToken) {
      return NextResponse.json({ error: "taskId and callbackToken are required" }, { status: 400 });
    }

    const task = await prisma.agentTask.findUnique({
      where: { id: taskId }
    });

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    const payload = task.payload as any;
    
    // Verify token
    if (payload?.execution_state?.callback_token !== callbackToken) {
        return NextResponse.json({ error: "Invalid callback token" }, { status: 403 });
    }

    if (approved) {
        // Resume task
        // We set it back to QUEUED so the bridge picks it up.
        // We mark human_approved: true in the payload so Node 5 skips the pause.
        const updatedPayload = {
            ...payload,
            execution_state: {
                ...payload.execution_state,
                human_approved: true,
                status: "in_progress" // Valid enum value
            }
        };

        await prisma.agentTask.update({
            where: { id: taskId },
            data: {
                status: "QUEUED",
                payload: updatedPayload
            }
        });

        return NextResponse.json({ success: true, message: "Task approved and re-enqueued" });
    } else {
        // Fail task
        const updatedPayload = {
            ...payload,
            execution_state: {
                ...payload.execution_state,
                status: "failed"
            },
            draft_payload: {
                ...payload.draft_payload,
                feedback_history: [...(payload.draft_payload?.feedback_history || []), feedback || "Rejected by human."]
            }
        };

        await prisma.agentTask.update({
            where: { id: taskId },
            data: {
                status: "FAILED",
                payload: updatedPayload
            }
        });

        return NextResponse.json({ success: true, message: "Task rejected" });
    }

  } catch (error) {
    console.error("Approval Error:", error);
    return NextResponse.json({ error: "Failed to process approval" }, { status: 500 });
  }
}
