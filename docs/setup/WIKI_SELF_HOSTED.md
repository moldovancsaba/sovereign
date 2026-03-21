# Self-hosted wiki (LLD-007)

**Goal:** Run an optional wiki (BookStack) alongside {sovereign}, then expose documentation to agents via MCP.

## 1. Deploy BookStack (Docker)

From the **repository root**:

```bash
docker compose -f docker-compose.wiki.yml up -d
```

- UI: **http://127.0.0.1:6875** (override host port with `BOOKSTACK_PORT`).
- **Change default passwords** in `docker-compose.wiki.yml` before any shared or production use.

This stack is **independent** of `docker-compose.yml` (Postgres for the app).

## 2. MCP docs server (repo runbooks today)

The app ships **`npm run mcp:docs`** (`apps/sovereign/scripts/mcp-docs-server.js`), which exposes read-only **MCP resources** backed by files in this repo (e.g. `doc://runbooks/getting-started`). No wiki is required for that path.

```bash
cd apps/sovereign
npm run mcp:docs
```

Send JSON-RPC lines on stdin, e.g. `resources/list` and `resources/read` with `params.uri` set to a listed URI.

## 3. Remote wiki bridge (follow-up)

Reading live pages from BookStack via MCP (HTTP API + token) is **not** implemented in the first slice. When added:

- Document `SOVEREIGN_WIKI_BASE_URL` and API token env vars here.
- Extend `mcp-docs-server.js` or add a thin adapter that maps `doc://…` to wiki page IDs or slugs.

## 4. Optional ingestion to project memory

LLD-007 optional AC: ingest selected wiki pages into `ProjectMemory` with `sourceUrl`. That can be a scheduled script calling the existing memory APIs — track in [mvp-factory-control#443](https://github.com/moldovancsaba/mvp-factory-control/issues/443).
