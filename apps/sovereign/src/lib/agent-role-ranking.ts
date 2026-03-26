import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type TrinityRole = "drafter" | "writer" | "judge";

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function eloExpected(rA: number, rB: number) {
  return 1 / (1 + 10 ** ((rB - rA) / 400));
}

function eloUpdate(rA: number, rB: number, resultA: 0 | 0.5 | 1, k = 16) {
  const eA = eloExpected(rA, rB);
  return rA + k * (resultA - eA);
}

async function ensureRankingRow(role: TrinityRole, agentKey: string) {
  const existing = await prisma.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`SELECT "id" FROM "AgentRoleRanking" WHERE "role" = ${role} AND "agentKey" = ${agentKey} LIMIT 1`
  );
  if (existing.length) return;
  await prisma.$queryRaw(
    Prisma.sql`
      INSERT INTO "AgentRoleRanking" ("id", "role", "agentKey", "rating", "matches", "wins", "losses", "draws", "confidence", "updatedAt")
      VALUES (${`arr_${randomUUID()}`}, ${role}, ${agentKey}, 1000, 0, 0, 0, 0, NULL, NOW())
    `
  );
}

export async function getRoleRankingMap(role: TrinityRole) {
  const rows = await prisma.$queryRaw<Array<{ agentKey: string; rating: number; confidence: number | null }>>(
    Prisma.sql`
      SELECT "agentKey", "rating", "confidence"
      FROM "AgentRoleRanking"
      WHERE "role" = ${role}
      ORDER BY "rating" DESC
    `
  );
  const out = new Map<string, { rating: number; confidence: number | null }>();
  for (const row of rows) out.set(row.agentKey, { rating: Number(row.rating) || 1000, confidence: row.confidence });
  return out;
}

export async function applyRoleRankingOutcome(params: {
  role: TrinityRole;
  selectedAgentKey: string;
  selectedConfidence?: number | null;
  contenderAgentKeys: string[];
  accepted: boolean;
}) {
  const selected = params.selectedAgentKey;
  const contenders = params.contenderAgentKeys.filter((k) => k && k !== selected);
  await ensureRankingRow(params.role, selected);
  for (const contender of contenders) {
    await ensureRankingRow(params.role, contender);
  }

  const allRows = await prisma.$queryRaw<Array<{ agentKey: string; rating: number }>>(
    Prisma.sql`
      SELECT "agentKey", "rating"
      FROM "AgentRoleRanking"
      WHERE "role" = ${params.role}
      AND "agentKey" IN (${Prisma.join([selected, ...contenders])})
    `
  );
  const ratingByAgent = new Map<string, number>();
  for (const row of allRows) ratingByAgent.set(row.agentKey, Number(row.rating) || 1000);

  // Outcome semantics:
  // - accepted => selected wins against contenders.
  // - not accepted => selected loses against contenders.
  const selectedBase = ratingByAgent.get(selected) ?? 1000;
  let selectedNext = selectedBase;
  for (const contender of contenders) {
    const contenderBase = ratingByAgent.get(contender) ?? 1000;
    selectedNext = eloUpdate(selectedNext, contenderBase, params.accepted ? 1 : 0, 12);
    const contenderNext = eloUpdate(contenderBase, selectedBase, params.accepted ? 0 : 1, 12);
    await prisma.$queryRaw(
      Prisma.sql`
        UPDATE "AgentRoleRanking"
        SET
          "rating" = ${contenderNext},
          "matches" = "matches" + 1,
          "wins" = "wins" + ${params.accepted ? 1 : 0},
          "losses" = "losses" + ${params.accepted ? 0 : 1},
          "updatedAt" = NOW()
        WHERE "role" = ${params.role}
          AND "agentKey" = ${contender}
      `
    );
  }

  await prisma.$queryRaw(
    Prisma.sql`
      UPDATE "AgentRoleRanking"
      SET
        "rating" = ${selectedNext},
        "matches" = "matches" + 1,
        "wins" = "wins" + ${params.accepted ? 1 : 0},
        "losses" = "losses" + ${params.accepted ? 0 : 1},
        "confidence" = ${params.selectedConfidence == null ? null : clamp01(params.selectedConfidence)},
        "updatedAt" = NOW()
      WHERE "role" = ${params.role}
        AND "agentKey" = ${selected}
    `
  );
}
