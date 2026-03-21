#!/usr/bin/env node
/* eslint-disable no-console */
const path = require("node:path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const { PrismaClient } = require("@prisma/client");

async function main() {
  const prisma = new PrismaClient();
  try {
    const ext = await prisma.$queryRaw`SELECT extversion::text AS v FROM pg_extension WHERE extname = 'vector'`;
    if (!Array.isArray(ext) || !ext.length) {
      throw new Error('Postgres extension "vector" not found. Use pgvector/pgvector image and run migrations.');
    }
    console.log("pgvector:", ext[0].v || "present");

    const base = String(process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434").replace(/\/$/, "");
    const model = process.env.SOVEREIGN_EMBEDDING_MODEL || "nomic-embed-text";
    const res = await fetch(`${base}/api/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, prompt: "semantic memory ping" })
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`Ollama embeddings HTTP ${res.status}: ${t.slice(0, 200)}`);
    }
    const body = await res.json();
    const dim = Array.isArray(body.embedding) ? body.embedding.length : 0;
    if (dim !== 768) {
      throw new Error(`Expected 768-d embedding for schema vector(768); got ${dim}. Adjust SOVEREIGN_EMBEDDING_MODEL or migration.`);
    }
    console.log("ollama:", model, "dim=", dim);
    console.log("OK — semantic memory stack ready.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
