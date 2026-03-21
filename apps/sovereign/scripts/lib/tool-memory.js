/**
 * Project memory tools for worker + MCP (LLD-006 follow-through).
 * Lexical + optional semantic search (Ollama + pgvector), list recent, get by id.
 */
const MEMORY_KINDS = new Set([
  "THREAD",
  "PROJECT",
  "AGENT",
  "EVIDENCE",
  "PO_PRODUCT",
  "DECISION",
  "OTHER"
]);

const EMBED_DIM = 768;

function asRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value;
}

function asTrimmed(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeKinds(raw) {
  if (!Array.isArray(raw)) return undefined;
  const out = raw.filter((k) => typeof k === "string" && MEMORY_KINDS.has(k));
  return out.length ? out : undefined;
}

function embeddingToVectorLiteral(embedding) {
  if (!embedding.length) return "[]";
  return `[${embedding.map((n) => Number(n).toFixed(8)).join(",")}]`;
}

async function embedTextOllama(text) {
  const base = String(process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434").replace(/\/$/, "");
  const model = process.env.SOVEREIGN_EMBEDDING_MODEL || "nomic-embed-text";
  const trimmed = String(text || "").trim();
  if (!trimmed) throw new Error("embedTextOllama: empty text");
  const res = await fetch(`${base}/api/embeddings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, prompt: trimmed })
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Ollama embeddings failed: HTTP ${res.status} ${errText.slice(0, 200)}`);
  }
  const body = await res.json();
  const embedding = Array.isArray(body.embedding) ? body.embedding : [];
  if (embedding.length !== EMBED_DIM) {
    throw new Error(
      `Embedding length ${embedding.length} does not match expected ${EMBED_DIM}. ` +
        "Set SOVEREIGN_EMBEDDING_MODEL to a 768-d model or adjust schema/migration."
    );
  }
  return { model, dimensions: embedding.length, embedding };
}

function isMissingProjectMemoryTable(error) {
  return error && typeof error === "object" && error.code === "P2021";
}

async function runMemorySearch(prisma, args) {
  const projectSessionId = asTrimmed(args.projectSessionId);
  const query = asTrimmed(args.query);
  if (!projectSessionId || !query) {
    return {
      answer: JSON.stringify({ error: "projectSessionId and query are required." }),
      audit: {}
    };
  }
  const limit = Math.min(Math.max(Number(args.limit) || 8, 1), 20);
  const kinds = normalizeKinds(args.kinds);
  const wantSemantic = args.semantic !== false;

  const whereLexical = {
    projectSessionId,
    status: { in: ["CAPTURED", "REVIEWED"] },
    ...(kinds ? { kind: { in: kinds } } : {}),
    OR: [
      { title: { contains: query, mode: "insensitive" } },
      { summary: { contains: query, mode: "insensitive" } },
      { content: { contains: query, mode: "insensitive" } }
    ]
  };

  let lexical = [];
  try {
    const rows = await prisma.projectMemory.findMany({
      where: whereLexical,
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
      take: limit,
      select: {
        id: true,
        title: true,
        summary: true,
        status: true,
        kind: true,
        sourceMessageId: true,
        taskId: true,
        createdAt: true,
        updatedAt: true
      }
    });
    lexical = rows;
  } catch (e) {
    if (isMissingProjectMemoryTable(e)) lexical = [];
    else throw e;
  }

  let semantic = [];
  let embeddingMeta = null;
  let embeddingError = null;
  if (wantSemantic) {
    try {
      const { embedding, model, dimensions } = await embedTextOllama(query);
      embeddingMeta = { model, dimensions };
      const vec = embeddingToVectorLiteral(embedding);
      const kindList = (kinds || []).filter((k) => MEMORY_KINDS.has(k));
      const kindClause =
        kindList.length > 0
          ? `AND kind IN (${kindList.map((k) => `'${String(k).replace(/'/g, "''")}'`).join(",")})`
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
      const raw = await prisma.$queryRawUnsafe(sql, vec, projectSessionId, limit);
      semantic = (raw || []).map((r) => ({
        id: r.id,
        title: r.title,
        summary: r.summary,
        kind: r.kind,
        distance: Number(r.distance)
      }));
    } catch (e) {
      embeddingError = e instanceof Error ? e.message : String(e);
    }
  }

  return {
    answer: JSON.stringify(
      {
        query,
        projectSessionId,
        ...(embeddingMeta
          ? { embeddingModel: embeddingMeta.model, embeddingDimensions: embeddingMeta.dimensions }
          : {}),
        lexical,
        semantic,
        ...(embeddingError ? { embeddingError } : {})
      },
      null,
      2
    ),
    audit: { lexicalCount: lexical.length, semanticCount: semantic.length }
  };
}

async function runMemoryListRecent(prisma, args) {
  const projectSessionId = asTrimmed(args.projectSessionId);
  if (!projectSessionId) {
    return {
      answer: JSON.stringify({ error: "projectSessionId is required." }),
      audit: {}
    };
  }
  const limit = Math.min(Math.max(Number(args.limit) || 12, 1), 40);
  const kinds = normalizeKinds(args.kinds);
  try {
    const rows = await prisma.projectMemory.findMany({
      where: {
        projectSessionId,
        status: { in: ["CAPTURED", "REVIEWED"] },
        ...(kinds ? { kind: { in: kinds } } : {})
      },
      orderBy: [{ updatedAt: "desc" }],
      take: limit,
      select: {
        id: true,
        title: true,
        summary: true,
        kind: true,
        status: true,
        taskId: true,
        sourceAgentKey: true,
        updatedAt: true
      }
    });
    return {
      answer: JSON.stringify(rows, null, 2),
      audit: { count: rows.length }
    };
  } catch (e) {
    if (isMissingProjectMemoryTable(e)) {
      return { answer: JSON.stringify([]), audit: { count: 0 } };
    }
    throw e;
  }
}

const MEMORY_SELECT_ONE = {
  id: true,
  projectSessionId: true,
  threadId: true,
  taskId: true,
  sourceMessageId: true,
  title: true,
  summary: true,
  content: true,
  tags: true,
  status: true,
  kind: true,
  sourceKind: true,
  sourceUrl: true,
  sourceAgentKey: true,
  createdByUserId: true,
  embeddingModel: true,
  embeddingDimensions: true,
  createdAt: true,
  updatedAt: true
};

async function runMemoryGet(prisma, args) {
  const id = asTrimmed(args.id);
  if (!id) {
    return {
      answer: JSON.stringify({ error: "id is required." }),
      audit: {}
    };
  }
  try {
    const row = await prisma.projectMemory.findUnique({
      where: { id },
      select: MEMORY_SELECT_ONE
    });
    if (!row) {
      return { answer: JSON.stringify({ error: "Not found" }), audit: {} };
    }
    return { answer: JSON.stringify(row, null, 2), audit: { id } };
  } catch (e) {
    if (isMissingProjectMemoryTable(e)) {
      return { answer: JSON.stringify({ error: "Not found" }), audit: {} };
    }
    throw e;
  }
}

/**
 * @param {{ id: string, tool: string, args: object }} call
 * @param {import('@prisma/client').PrismaClient} prisma
 * @returns {Promise<{ answer: string, audit?: object }>}
 */
async function executeMemoryToolCall(call, prisma) {
  if (!call || !call.tool) {
    return { answer: JSON.stringify({ error: "Invalid call: tool required" }), audit: {} };
  }
  const args = asRecord(call.args) || {};
  if (call.tool === "memory.search") return runMemorySearch(prisma, args);
  if (call.tool === "memory.list_recent") return runMemoryListRecent(prisma, args);
  if (call.tool === "memory.get") return runMemoryGet(prisma, args);
  return {
    answer: JSON.stringify({
      error: `Unknown memory tool: ${call.tool}. Supported: memory.search, memory.list_recent, memory.get`
    }),
    audit: {}
  };
}

module.exports = {
  executeMemoryToolCall
};
