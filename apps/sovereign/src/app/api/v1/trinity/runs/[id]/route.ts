import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isSovereignApiAuthorized } from "@/lib/sovereign-api-auth";

function errorResponse(status: number, message: string, code: string) {
  return NextResponse.json(
    {
      error: {
        message,
        type: status === 401 ? "authentication_error" : "invalid_request_error",
        code,
        param: null
      }
    },
    { status }
  );
}

export async function GET(
  req: NextRequest,
  context: {
    params: Promise<{ id: string }>;
  }
) {
  if (!isSovereignApiAuthorized(req)) {
    return errorResponse(401, "Unauthorized API token.", "unauthorized");
  }

  const { id } = await context.params;
  const lookup = String(id || "").trim();
  if (!lookup) {
    return errorResponse(400, "Run id is required.", "invalid_id");
  }

  const rows = await prisma.$queryRaw<
    Array<{
      id: string;
      requestId: string;
      mode: string;
      provider: string;
      model: string;
      status: string;
      finalConfidence: number | null;
      attempts: number;
      inputMessages: unknown;
      outputText: string;
      stageTrace: unknown;
      meta: unknown;
      createdAt: Date;
    }>
  >(
    Prisma.sql`
      SELECT
        "id",
        "requestId",
        "mode",
        "provider",
        "model",
        "status",
        "finalConfidence",
        "attempts",
        "inputMessages",
        "outputText",
        "stageTrace",
        "meta",
        "createdAt"
      FROM "TrinityExecutionRun"
      WHERE "id" = ${lookup} OR "requestId" = ${lookup}
      ORDER BY "createdAt" DESC
      LIMIT 1
    `
  );

  const run = rows[0];
  if (!run) {
    return errorResponse(404, "Trinity run not found.", "run_not_found");
  }

  return NextResponse.json(
    {
      id: run.id,
      request_id: run.requestId,
      mode: run.mode,
      provider: run.provider,
      model: run.model,
      status: run.status,
      final_confidence: run.finalConfidence,
      attempts: run.attempts,
      input_messages: run.inputMessages,
      output_text: run.outputText,
      stage_trace: run.stageTrace,
      meta: run.meta,
      created_at: run.createdAt.toISOString()
    },
    { status: 200 }
  );
}
