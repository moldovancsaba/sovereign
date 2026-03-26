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

function parsePositiveInt(raw: string | null, fallback: number, max: number) {
  const parsed = Number(raw || "");
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

export async function GET(req: NextRequest) {
  if (!isSovereignApiAuthorized(req)) {
    return errorResponse(401, "Unauthorized API token.", "unauthorized");
  }

  const url = new URL(req.url);
  const limit = parsePositiveInt(url.searchParams.get("limit"), 20, 100);
  const page = parsePositiveInt(url.searchParams.get("page"), 1, 100000);
  const offset = (page - 1) * limit;

  const status = (url.searchParams.get("status") || "").trim();
  const provider = (url.searchParams.get("provider") || "").trim();
  const model = (url.searchParams.get("model") || "").trim();
  const createdAfter = (url.searchParams.get("created_after") || "").trim();
  const createdBefore = (url.searchParams.get("created_before") || "").trim();

  const conditions: Prisma.Sql[] = [Prisma.sql`1 = 1`];
  if (status) conditions.push(Prisma.sql`"status" = ${status}`);
  if (provider) conditions.push(Prisma.sql`"provider" = ${provider}`);
  if (model) conditions.push(Prisma.sql`"model" = ${model}`);

  if (createdAfter) {
    const d = new Date(createdAfter);
    if (Number.isNaN(d.getTime())) {
      return errorResponse(400, "created_after must be an ISO datetime.", "invalid_created_after");
    }
    conditions.push(Prisma.sql`"createdAt" >= ${d}`);
  }
  if (createdBefore) {
    const d = new Date(createdBefore);
    if (Number.isNaN(d.getTime())) {
      return errorResponse(400, "created_before must be an ISO datetime.", "invalid_created_before");
    }
    conditions.push(Prisma.sql`"createdAt" <= ${d}`);
  }

  const whereClause = Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}`;

  const totalRows = await prisma.$queryRaw<Array<{ count: bigint | number }>>(
    Prisma.sql`
      SELECT COUNT(*) AS count
      FROM "TrinityExecutionRun"
      ${whereClause}
    `
  );
  const totalRaw = totalRows[0]?.count ?? 0;
  const total = typeof totalRaw === "bigint" ? Number(totalRaw) : Number(totalRaw);

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
      outputText: string;
      stageTrace: unknown;
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
        "outputText",
        "stageTrace",
        "createdAt"
      FROM "TrinityExecutionRun"
      ${whereClause}
      ORDER BY "createdAt" DESC, "id" DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `
  );

  return NextResponse.json(
    {
      object: "list",
      data: rows.map((row) => ({
        id: row.id,
        request_id: row.requestId,
        mode: row.mode,
        provider: row.provider,
        model: row.model,
        status: row.status,
        final_confidence: row.finalConfidence,
        attempts: row.attempts,
        output_text: row.outputText,
        stage_trace: row.stageTrace,
        created_at: row.createdAt.toISOString()
      })),
      page,
      limit,
      total,
      has_more: offset + rows.length < total
    },
    { status: 200 }
  );
}
