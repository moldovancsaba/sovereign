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

export async function GET(req: NextRequest) {
  if (!isSovereignApiAuthorized(req)) {
    return errorResponse(401, "Unauthorized API token.", "unauthorized");
  }
  const url = new URL(req.url);
  const role = String(url.searchParams.get("role") || "").trim().toLowerCase();
  if (role && !["drafter", "writer", "judge"].includes(role)) {
    return errorResponse(400, "role must be one of drafter|writer|judge when provided.", "invalid_role");
  }
  const rows = await prisma.$queryRaw<
    Array<{
      role: string;
      agentKey: string;
      rating: number;
      matches: number;
      wins: number;
      losses: number;
      draws: number;
      confidence: number | null;
      updatedAt: Date;
    }>
  >(
    role
      ? Prisma.sql`
          SELECT "role", "agentKey", "rating", "matches", "wins", "losses", "draws", "confidence", "updatedAt"
          FROM "AgentRoleRanking"
          WHERE "role" = ${role}
          ORDER BY "rating" DESC, "updatedAt" DESC
        `
      : Prisma.sql`
          SELECT "role", "agentKey", "rating", "matches", "wins", "losses", "draws", "confidence", "updatedAt"
          FROM "AgentRoleRanking"
          ORDER BY "role" ASC, "rating" DESC, "updatedAt" DESC
        `
  );

  return NextResponse.json(
    {
      object: "list",
      data: rows.map((row) => ({
        role: row.role,
        agent_key: row.agentKey,
        rating: row.rating,
        matches: row.matches,
        wins: row.wins,
        losses: row.losses,
        draws: row.draws,
        confidence: row.confidence,
        updated_at: row.updatedAt.toISOString()
      }))
    },
    { status: 200 }
  );
}
