/**
 * Ollama embeddings for LLD-006 semantic memory (default: nomic-embed-text, 768-d).
 * Dimension must match Prisma `ProjectMemory.embedding` (vector(768)).
 */

const DEFAULT_MODEL = process.env.SOVEREIGN_EMBEDDING_MODEL || "nomic-embed-text";
export const SOVEREIGN_EMBEDDING_DIMENSIONS = 768;

function normalizeBaseUrl(url: string) {
  return url.replace(/\/$/, "");
}

export async function embedTextOllama(text: string): Promise<{
  model: string;
  dimensions: number;
  embedding: number[];
}> {
  const base = normalizeBaseUrl(process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434");
  const model = process.env.SOVEREIGN_EMBEDDING_MODEL || DEFAULT_MODEL;
  const trimmed = String(text || "").trim();
  if (!trimmed) {
    throw new Error("embedTextOllama: empty text");
  }

  const res = await fetch(`${base}/api/embeddings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, prompt: trimmed })
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Ollama embeddings failed: HTTP ${res.status} ${errText.slice(0, 200)}`);
  }

  const body = (await res.json()) as { embedding?: number[] };
  const embedding = Array.isArray(body.embedding) ? body.embedding : [];
  if (embedding.length !== SOVEREIGN_EMBEDDING_DIMENSIONS) {
    throw new Error(
      `Embedding length ${embedding.length} does not match expected ${SOVEREIGN_EMBEDDING_DIMENSIONS}. Set SOVEREIGN_EMBEDDING_MODEL to a 768-d model or adjust schema/migration.`
    );
  }

  return { model, dimensions: embedding.length, embedding };
}

export function embeddingToVectorLiteral(embedding: number[]): string {
  if (!embedding.length) return "[]";
  return `[${embedding.map((n) => Number(n).toFixed(8)).join(",")}]`;
}
