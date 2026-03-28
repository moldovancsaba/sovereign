import { NextResponse } from "next/server";
import { enqueueTask } from "@/lib/tasks";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const { intent, channel = "web", metadata = {} } = await req.json();

    if (!intent) {
      return NextResponse.json({ error: "Intent is required" }, { status: 400 });
    }

    // SovereignStatePayload structure
    const initialPayload = {
      task_profile: {
        intent_raw: intent,
        task_type: "internal_summary", // Valid enum value
        risk_tier: "R1" // Default, will be updated by Node 1
      },
      execution_state: {
        status: "in_progress", // Valid enum value
        retry_count: 0,
        current_node: "intent_router"
      },
      draft_payload: {
        content: "",
        feedback_history: []
      },
      node_results: {},
      ...metadata
    };

    const task = await enqueueTask({
      agentKey: "SOVEREIGN_DAG",
      title: `Sovereign DAG Task: ${intent.substring(0, 50)}...`,
      payload: initialPayload,
    });

    // Bypass existing judge/policy gates for Sovereign DAG by forcing status to MANUAL_REQUIRED.
    // This status is intentionally chosen to prevent all automated TS workers from picking it up
    // while our Python bridge (NexusBridge) will be updated to specifically poll for this as its start signal.
    await prisma.agentTask.update({
      where: { id: task.id },
      data: { status: "MANUAL_REQUIRED" }
    });

    return NextResponse.json({ 
      success: true, 
      taskId: task.id,
      message: "Task enqueued to Sovereign DAG" 
    }, { status: 202 });

  } catch (error) {
    console.error("Ingestion Error:", error);
    return NextResponse.json({ error: "Failed to ingest task" }, { status: 500 });
  }
}
