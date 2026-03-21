import { NextResponse } from "next/server";
import type { ProjectMemoryKind } from "@prisma/client";
import { getAppSession } from "@/lib/app-session";
import { embedTextOllama } from "@/lib/embeddings";
import { retrieveProjectMemory, searchProjectMemorySemantic } from "@/lib/memory";

const KINDS: ProjectMemoryKind[] = [
  "THREAD",
  "PROJECT",
  "AGENT",
  "EVIDENCE",
  "PO_PRODUCT",
  "DECISION",
  "OTHER"
];

function parseKinds(raw: unknown): ProjectMemoryKind[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const allowed = new Set(KINDS);
  const out = raw.filter((k): k is ProjectMemoryKind => typeof k === "string" && allowed.has(k as ProjectMemoryKind));
  return out.length ? out : undefined;
}

/**
 * POST { projectSessionId, query, limit?, kinds?, semantic?: boolean }
 * - semantic=true (default): Ollama embedding + pgvector similarity (rows with embedding only)
 * - always includes lexical matches via Prisma contains (subset) for operator visibility
 */
export async function POST(req: Request) {
  const session = await getAppSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const projectSessionId = typeof body.projectSessionId === "string" ? body.projectSessionId.trim() : "";
  const query = typeof body.query === "string" ? body.query.trim() : "";
  if (!projectSessionId || !query) {
    return NextResponse.json(
      { error: "projectSessionId and query are required." },
      { status: 400 }
    );
  }

  const limit = typeof body.limit === "number" && Number.isFinite(body.limit) ? Math.trunc(body.limit) : 8;
  const kinds = parseKinds(body.kinds);
  const wantSemantic = body.semantic !== false;

  const lexical = await retrieveProjectMemory({
    projectSessionId,
    query,
    limit: Math.min(Math.max(limit, 1), 20),
    kinds
  });

  let semantic: Awaited<ReturnType<typeof searchProjectMemorySemantic>> = [];
  let embeddingMeta: { model: string; dimensions: number } | null = null;
  let embeddingError: string | null = null;

  if (wantSemantic) {
    try {
      const { embedding, model, dimensions } = await embedTextOllama(query);
      embeddingMeta = { model, dimensions };
      semantic = await searchProjectMemorySemantic({
        projectSessionId,
        queryEmbedding: embedding,
        limit,
        kinds
      });
    } catch (e) {
      embeddingError = e instanceof Error ? e.message : String(e);
    }
  }

  return NextResponse.json({
    query,
    projectSessionId,
    ...(embeddingMeta
      ? {
          embeddingModel: embeddingMeta.model,
          embeddingDimensions: embeddingMeta.dimensions
        }
      : {}),
    semantic,
    lexical,
    ...(embeddingError ? { embeddingError } : {})
  });
}
