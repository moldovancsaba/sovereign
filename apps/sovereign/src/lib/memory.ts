import { prisma } from "@/lib/prisma";
import type { ProjectMemoryKind } from "@prisma/client";
import { embeddingToVectorLiteral } from "@/lib/embeddings";

function normalizeText(value: unknown) {
  return String(value || "").trim();
}

function isMissingProjectMemoryTable(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: unknown }).code;
  return code === "P2021";
}

function compactText(value: string, maxChars: number) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, Math.max(0, maxChars - 3)).trimEnd()}...`;
}

function tokenize(value: string, maxTerms = 12) {
  const matches = value.toLowerCase().match(/[a-z0-9_]+/g) || [];
  const seen = new Set<string>();
  const terms: string[] = [];
  for (const match of matches) {
    if (match.length < 3 || seen.has(match)) continue;
    seen.add(match);
    terms.push(match);
    if (terms.length >= maxTerms) break;
  }
  return terms;
}

export async function captureProjectMemoryFromTaskResult(params: {
  projectSessionId: string | null;
  threadId: string | null;
  taskId: string;
  sourceMessageId?: string | null;
  title: string;
  answer: string;
  agentKey: string;
  model?: string | null;
}) {
  if (!params.projectSessionId) return null;

  const title = normalizeText(params.title) || "Untitled task result";
  const answer = normalizeText(params.answer);
  if (!answer) return null;

  const summary = compactText(answer, 240);
  const content = compactText(answer, 4000);
  const tags = Array.from(
    new Set([
      params.agentKey,
      ...(params.model ? [params.model] : []),
      ...tokenize(title),
      ...tokenize(summary)
    ])
  ).slice(0, 16);

  return prisma.projectMemory.create({
    data: {
      projectSessionId: params.projectSessionId,
      threadId: params.threadId,
      taskId: params.taskId,
      sourceMessageId: params.sourceMessageId ?? null,
      title,
      summary,
      content,
      tags,
      status: "CAPTURED",
      kind: "AGENT",
      sourceKind: "task_completion",
      sourceAgentKey: normalizeText(params.agentKey) || null
    }
  });
}

export async function retrieveProjectMemory(params: {
  projectSessionId: string;
  query?: string;
  limit?: number;
  kinds?: ProjectMemoryKind[];
}) {
  const query = normalizeText(params.query);
  const limit = Math.min(Math.max(params.limit ?? 6, 1), 20);
  const kinds =
    Array.isArray(params.kinds) && params.kinds.length
      ? params.kinds
      : undefined;

  let rows;
  try {
    rows = await prisma.projectMemory.findMany({
      where: {
        projectSessionId: params.projectSessionId,
        status: { in: ["CAPTURED", "REVIEWED"] },
        ...(kinds ? { kind: { in: kinds } } : {}),
        ...(query
          ? {
              OR: [
                { title: { contains: query, mode: "insensitive" } },
                { summary: { contains: query, mode: "insensitive" } },
                { content: { contains: query, mode: "insensitive" } }
              ]
            }
          : {})
      },
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
      take: limit
    });
  } catch (error) {
    if (isMissingProjectMemoryTable(error)) {
      return [];
    }
    throw error;
  }

  return rows.map((row: {
    id: string;
    title: string;
    summary: string;
    status: string;
    kind: ProjectMemoryKind;
    sourceMessageId: string | null;
    taskId: string | null;
    createdAt: Date;
    updatedAt: Date;
  }) => ({
    id: row.id,
    title: row.title,
    summary: row.summary,
    status: row.status,
    kind: row.kind,
    sourceMessageId: row.sourceMessageId,
    taskId: row.taskId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }));
}

const MEMORY_KIND_SET = new Set<string>([
  "THREAD",
  "PROJECT",
  "AGENT",
  "EVIDENCE",
  "PO_PRODUCT",
  "DECISION",
  "OTHER"
]);

export async function updateProjectMemoryEmbedding(params: {
  memoryId: string;
  embedding: number[];
  model: string;
  dimensions: number;
}) {
  const vec = embeddingToVectorLiteral(params.embedding);
  await prisma.$executeRawUnsafe(
    `UPDATE "ProjectMemory" SET embedding = $1::vector, "embeddingModel" = $2, "embeddingDimensions" = $3, "updatedAt" = NOW() WHERE id = $4`,
    vec,
    params.model,
    params.dimensions,
    params.memoryId
  );
}

export type SemanticMemoryHit = {
  id: string;
  title: string;
  summary: string;
  kind: string;
  distance: number;
};

/**
 * Cosine distance via pgvector `<=>` (requires rows with non-null embedding).
 */
export async function searchProjectMemorySemantic(params: {
  projectSessionId: string;
  queryEmbedding: number[];
  limit?: number;
  kinds?: ProjectMemoryKind[];
}): Promise<SemanticMemoryHit[]> {
  const limit = Math.min(Math.max(params.limit ?? 8, 1), 24);
  const vec = embeddingToVectorLiteral(params.queryEmbedding);
  const kinds = (params.kinds || []).filter((k) => MEMORY_KIND_SET.has(k));
  const kindClause =
    kinds.length > 0
      ? `AND kind IN (${kinds.map((k) => `'${k.replace(/'/g, "''")}'`).join(",")})`
      : "";

  const sql = `
    SELECT id, title, summary, kind::text AS kind,
           ("embedding" <=> $1::vector) AS distance
    FROM "ProjectMemory"
    WHERE "projectSessionId" = $2
      AND "embedding" IS NOT NULL
      AND status IN ('CAPTURED','REVIEWED')
      ${kindClause}
    ORDER BY "embedding" <=> $1::vector
    LIMIT $3
  `;

  const rows = await prisma.$queryRawUnsafe<
    Array<{ id: string; title: string; summary: string; kind: string; distance: number }>
  >(sql, vec, params.projectSessionId, limit);

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    summary: r.summary,
    kind: r.kind,
    distance: Number(r.distance)
  }));
}
