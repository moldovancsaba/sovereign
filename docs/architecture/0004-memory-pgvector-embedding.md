# ADR 0004: Project memory — kinds, provenance, pgvector embeddings

**Status:** Accepted (foundation + HNSW index + MCP resources + PROJECT_SESSION worker scope shipped)  
**Date:** 2026-03-19  
**Context:** [LLD-006 in SOVEREIGN_MASTER_PLAN_AND_LLD.md](../SOVEREIGN_MASTER_PLAN_AND_LLD.md)

## Context

`{sovereign}` stores durable **project memory** in `ProjectMemory`, linked to `ProjectSession`. Long-term delivery requires:

- Typed memory (thread, agent, PO/product, evidence, decisions).
- Provenance (who/what produced a record; optional URL).
- **Semantic retrieval** via embeddings, not only token overlap in the worker.

## Decision

1. **PostgreSQL + pgvector** for the embedding column (`vector(768)`), defaulting to **Ollama `nomic-embed-text`** (768 dimensions). Other models require a matching migration (column dimension) and `SOVEREIGN_EMBEDDING_MODEL`.

2. **Docker** local DB uses image **`pgvector/pgvector:pg16`** (see root `docker-compose.yml`). Upgrading from plain `postgres:16` requires a DB that has the `vector` extension available (recreate volume or migrate data).

3. **Prisma** models new fields; `embedding` is `Unsupported("vector(768)")` — reads/writes for vectors use **`$queryRawUnsafe` / `$executeRawUnsafe`** in `src/lib/memory.ts` (and optional worker embedding).

4. **API:** `POST /api/memory/search` — lexical Prisma filter + optional semantic search (Ollama embed + pgvector ordering).

5. **Worker:** On task completion, new rows use `kind: AGENT`, `sourceKind: task_result`, `sourceAgentKey`. Optional **`SOVEREIGN_MEMORY_EMBED_ON_CAPTURE=1`** embeds via Ollama after commit (best-effort).

6. **MCP + tool protocol:** Stdio server `npm run mcp:memory` (`memory_search`, `memory_list_recent`, `memory_get`). **MCP resources:** `resources/list` + `resources/read` — `sovereign-memory://docs/operator-guide` (markdown) and `sovereign-memory://memory/{id}` (JSON row, no embedding). Worker accepts `memory.search`, `memory.list_recent`, `memory.get` (same semantics; task session supplies `projectSessionId` when args omit it).

7. **Worker prompt memory:** Default task payload uses **THREAD** scope (chat messages only). Opt-in **PROJECT_SESSION** via `payload.memory.scope` — durable `ProjectMemory` rows for the active project session (lexical match), same bounded snippet machinery as thread memory.

8. **HNSW:** Migration `ProjectMemory_embedding_hnsw_idx` — partial `hnsw` index on `embedding` (cosine) where non-null, for faster semantic KNN at scale.

## Consequences

- Operators must run **pgvector-capable Postgres** for semantic search; lexical search still works without embeddings.
- Embedding dimension is **fixed in the migration**; changing model dims is a schema/migration change.
- LLD-007 (wiki ingestion into memory) builds on MCP resources + durable memory; further retrieval tuning (e.g. semantic worker prompts) remains optional.

## Validation

- `npx prisma migrate deploy` after switching to pgvector image.
- `npm run verify` (repo root: typecheck + build).
- `npm run memory:verify` (repo root or `apps/sovereign`): checks pgvector in DB and Ollama embedding dimension (768 for `nomic-embed-text`).
- MCP smoke: `printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | node apps/sovereign/scripts/mcp-memory-server.js` (from repo root). Resources: `{"jsonrpc":"2.0","id":2,"method":"resources/list"}` and `resources/read` with `params.uri` = `sovereign-memory://docs/operator-guide`.
- With Ollama + `nomic-embed-text` pulled: `POST /api/memory/search` with `semantic: true` returns `semantic` hits for rows that have `embedding` set.
