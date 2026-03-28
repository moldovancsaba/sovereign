import { NextResponse } from "next/server";

/**
 * Instant 200 for load balancers and native shells (Sovereign.app).
 * Does not call Ollama or the database — unlike `/api/v1/health`.
 */
export async function GET() {
  return NextResponse.json({ ok: true, role: "http-ready" }, { status: 200 });
}
