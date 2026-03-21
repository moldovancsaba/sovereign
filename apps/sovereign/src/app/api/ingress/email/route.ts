import { NextRequest, NextResponse } from "next/server";
import { handleInboundEmail } from "@/lib/email-ingress";

function readBearerToken(value: string | null) {
  if (!value) return null;
  const match = /^Bearer\s+(.+)$/i.exec(value.trim());
  return match ? match[1].trim() : null;
}

function isIngressAuthorized(req: NextRequest) {
  const expected = String(
    process.env.SOVEREIGN_EMAIL_INGRESS_TOKEN || process.env.SENTINELSQUAD_EMAIL_INGRESS_TOKEN || ""
  ).trim();
  if (!expected) return true;
  const headerToken =
    req.headers.get("x-sovereign-ingress-token") ||
    req.headers.get("x-sentinelsquad-ingress-token") ||
    readBearerToken(req.headers.get("authorization")) ||
    "";
  return String(headerToken).trim() === expected;
}

export async function POST(req: NextRequest) {
  if (!isIngressAuthorized(req)) {
    return NextResponse.json(
      {
        ok: false,
        error: "Unauthorized email ingress token."
      },
      { status: 401 }
    );
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: "Invalid JSON payload."
      },
      { status: 400 }
    );
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await handleInboundEmail(payload as any);
    const statusCode =
      result.status === "ENQUEUED"
        ? 202
        : result.status === "BLOCKED"
        ? 403
        : result.status === "DEAD_LETTER"
        ? 422
        : 200;
    return NextResponse.json(
      {
        ok: result.accepted,
        status: result.status,
        eventId: result.eventId,
        threadId: result.threadId ?? null,
        taskId: result.taskId ?? null,
        reason: result.reason
      },
      { status: statusCode }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = /unsupported external ingress channel/i.test(message) ? 400 : 500;
    return NextResponse.json(
      {
        ok: false,
        error: message
      },
      { status }
    );
  }
}
