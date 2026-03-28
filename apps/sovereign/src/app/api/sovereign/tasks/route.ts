import { NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { listSovereignTasks } from "@/lib/nexus-control";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requireSession();
  if (!session) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const tasks = await listSovereignTasks(30);
  return NextResponse.json(tasks);
}
