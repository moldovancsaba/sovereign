# Self-hosted wiki (LLD-007)

**Goal:** Run an optional wiki (**BookStack** and/or **Outline**) alongside {sovereign}, expose pages as MCP resources, and ingest into `ProjectMemory`.

Only **one** wiki backend is active at a time: set **`SOVEREIGN_WIKI_TYPE`** to **`bookstack`** or **`outline`**. If **`SOVEREIGN_WIKI_TYPE` is unset**, the app prefers BookStack when BookStack credentials exist; otherwise Outline when Outline credentials exist.

## 1. Deploy BookStack (Docker)

From the **repository root**:

```bash
docker compose -f docker-compose.wiki.yml up -d
```

- UI: **http://127.0.0.1:6875** (override host port with `BOOKSTACK_PORT`).
- **Change default passwords** in `docker-compose.wiki.yml` before any shared or production use.

This stack is **independent** of `docker-compose.yml` (Postgres for the app).

## 2. Outline

Outline is usually **self-hosted or cloud** per [getoutline.com](https://www.getoutline.com/). There is no extra compose file in this repo for it—point **`SOVEREIGN_WIKI_BASE_URL`** at your workspace origin (no trailing slash).

1. Workspace **Settings → API keys** → create a key with **`documents.*`** (or broader) scope.
2. Set **`SOVEREIGN_WIKI_TYPE=outline`**, **`SOVEREIGN_WIKI_API_KEY`**, and **`SOVEREIGN_WIKI_BASE_URL`**.

MCP URIs use **`doc://wiki/outline/doc/{uuid}`** (document id from the API / app URL).

## 3. MCP docs server (repo runbooks)

**`npm run mcp:docs`** (`apps/sovereign/scripts/mcp-docs-server.js`) always exposes repo files (e.g. `doc://runbooks/getting-started`). Wiki URIs are added when wiki env is configured.

```bash
cd apps/sovereign
npm run mcp:docs
```

Send JSON-RPC lines on stdin: `resources/list`, `resources/read` with `params.uri`.

## 4. API tokens

### BookStack

1. User profile → **API Tokens** → create token (**Token ID** + **Token Secret**).
2. Role must allow **Access system API** and read access to content.

### Outline

Bearer token from **API keys**; optional **`SOVEREIGN_WIKI_OUTLINE_TOKEN_IN_BODY=1`** if your deployment expects the token in the JSON body instead of `Authorization`.

## 5. Environment (`apps/sovereign/.env`)

### BookStack

| Variable | Example |
|----------|---------|
| `SOVEREIGN_WIKI_TYPE` | `bookstack` |
| `SOVEREIGN_WIKI_BASE_URL` | `http://127.0.0.1:6875` |
| `SOVEREIGN_WIKI_TOKEN_ID` / `SOVEREIGN_WIKI_TOKEN_SECRET` | from BookStack |
| `SOVEREIGN_WIKI_MCP_PAGE_LIMIT` | optional (default 60, max 200) |

Wiki URIs: **`doc://wiki/bookstack/page/{id}`**. Read path uses **`/api/pages/{id}/export/markdown`** with fallbacks.

### Outline

| Variable | Example |
|----------|---------|
| `SOVEREIGN_WIKI_TYPE` | `outline` |
| `SOVEREIGN_WIKI_BASE_URL` | `https://wiki.example.com` |
| `SOVEREIGN_WIKI_API_KEY` | API key |
| `SOVEREIGN_WIKI_MCP_PAGE_LIMIT` | optional (default 60, max 100 per Outline list) |

RPC: **`POST /api/documents.list`** and **`POST /api/documents.info`**. Requests send **`x-api-version: 1`** so responses include markdown **`text`** when available.

If the wiki is down or auth fails, `resources/read` returns JSON-RPC **`-32002`**; `resources/list` still returns repo files (wiki portion may be missing—check stderr).

## 6. Ingest into `ProjectMemory`

Creates **PO_PRODUCT** rows with **`sourceKind`** `bookstack` or `outline` and **`sourceUrl`**.

**Single page**

```bash
cd apps/sovereign
node scripts/ingest-wiki-to-memory.js --page-id=<id> --project-session-id=<cuid> --dry-run
npm run wiki:ingest-page -- --page-id=<id> --project-session-id=<cuid>
```

- BookStack: numeric **page** id.
- Outline: document **UUID**.

**Batch** (first N items from wiki list; skips existing rows with the same **`sourceUrl`** in that session)

```bash
npm run wiki:ingest-batch -- --project-session-id=<cuid> --batch-limit=25
# or --dry-run
```

Requires **`DATABASE_URL`** and a valid **`projectSessionId`** from the app.
