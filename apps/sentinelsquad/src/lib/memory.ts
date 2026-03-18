import { prisma } from "@/lib/prisma";

function normalizeText(value: unknown) {
  return String(value || "").trim();
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
      status: "CAPTURED"
    }
  });
}

export async function retrieveProjectMemory(params: {
  projectSessionId: string;
  query?: string;
  limit?: number;
}) {
  const query = normalizeText(params.query);
  const limit = Math.min(Math.max(params.limit ?? 6, 1), 20);

  const rows = await prisma.projectMemory.findMany({
    where: {
      projectSessionId: params.projectSessionId,
      status: { in: ["CAPTURED", "REVIEWED"] },
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

  return rows.map((row: {
    id: string;
    title: string;
    summary: string;
    status: string;
    sourceMessageId: string | null;
    taskId: string | null;
    createdAt: Date;
    updatedAt: Date;
  }) => ({
    id: row.id,
    title: row.title,
    summary: row.summary,
    status: row.status,
    sourceMessageId: row.sourceMessageId,
    taskId: row.taskId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }));
}
