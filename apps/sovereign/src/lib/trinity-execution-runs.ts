import { prisma } from "@/lib/prisma";
import { randomUUID } from "node:crypto";

type TrinityRunPersistenceInput = {
  requestId: string;
  mode: string;
  provider: string;
  model: string;
  status: string;
  finalConfidence: number | null;
  attempts: number;
  inputMessages: Array<{ role: string; content: string }>;
  outputText: string;
  stageTrace: unknown[];
  meta?: Record<string, unknown> | null;
};

export async function persistTrinityExecutionRun(input: TrinityRunPersistenceInput) {
  const id = `trrun_${randomUUID()}`;
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    INSERT INTO "TrinityExecutionRun" (
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
      "meta"
    ) VALUES (
      ${id},
      ${input.requestId},
      ${input.mode},
      ${input.provider},
      ${input.model},
      ${input.status},
      ${input.finalConfidence},
      ${input.attempts},
      ${JSON.stringify(input.inputMessages)}::jsonb,
      ${input.outputText},
      ${JSON.stringify(input.stageTrace)}::jsonb,
      ${JSON.stringify(input.meta || null)}::jsonb
    )
    RETURNING "id"
  `;
  return rows[0]?.id || null;
}
