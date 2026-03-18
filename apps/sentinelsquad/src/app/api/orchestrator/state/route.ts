import { NextResponse } from "next/server";
import { getAppSession } from "@/lib/app-session";
import { getOrchestratorIntrospectionSnapshot } from "@/lib/orchestrator-introspection";

export async function GET() {
  const session = await getAppSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  try {
    const snapshot = await getOrchestratorIntrospectionSnapshot();
    return NextResponse.json(snapshot, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      {
        error: "Failed to load orchestrator introspection snapshot.",
        message
      },
      { status: 500 }
    );
  }
}
