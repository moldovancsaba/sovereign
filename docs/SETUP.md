# Setup

This page describes one-time setup for working on `{sovereign}` locally.

## Product Mode

`{sovereign}` is a local-only product by default.

That means:

- GitHub is optional for product runtime
- GitHub CLI is only needed for repository and board maintenance workflows
- local app, worker, runtime, and memory should work without GitHub tokens

## Stage Classification

Implemented now:

- local-only runtime path
- local desktop auth bypass for single-operator mode
- Ollama-first setup

Partially implemented:

- richer memory workflows
- Theia-primary shell
- multi-provider runtime setup beyond Ollama

## Required Local Software

- Node.js 20
- npm
- Docker Desktop or equivalent local container runtime
- Ollama

Optional:

- GitHub CLI
- MLX / MLX-LM on Apple Silicon

## Local Paths

- repo root: `/Users/moldovancsaba/Projects/sovereign`
- app: `/Users/moldovancsaba/Projects/sovereign/apps/sovereign`

## First-Time Local Setup

### 1. Start Postgres

```bash
cd /Users/moldovancsaba/Projects/sovereign
npm run db:up
```

### 2. Create local env

```bash
cd /Users/moldovancsaba/Projects/sovereign/apps/sovereign
cp .env.example .env
```

### 3. Install dependencies

```bash
cd /Users/moldovancsaba/Projects/sovereign
npm run install:app
npm run prisma:generate
```

### 4. Run migrations

**Local dev (interactive, creates migration files if schema drift):**

```bash
cd /Users/moldovancsaba/Projects/sovereign/apps/sovereign
npx prisma migrate dev
```

**Any environment with an existing Postgres URL** (staging, teammate laptop, shell in Docker): use **deploy** (idempotent, no prompts):

```bash
cd /Users/moldovancsaba/Projects/sovereign
npm run db:up   # optional: only if you use compose for Postgres
npm run prisma:migrate:deploy
```

`DATABASE_URL` must point at **pgvector-capable** Postgres (`pgvector/pgvector:pg16` in compose). That applies all pending migrations, including the **HNSW** index on `ProjectMemory.embedding` (`20260321103000_project_memory_embedding_hnsw`).

**Docker stack** (app + DB): `./scripts/sovereign-docker-bootstrap.sh` already runs `prisma migrate deploy` inside the app container after the DB is healthy.

### 5. Ensure Ollama is available

At minimum:

```bash
curl http://127.0.0.1:11434/api/tags
```

The recommended product behavior is to resolve an installed local model automatically, but the local runtime must still be available.

For **semantic project memory** (pgvector), pull the default embedding model once:

```bash
ollama pull nomic-embed-text
```

Then verify DB + Ollama together:

```bash
cd /Users/moldovancsaba/Projects/sovereign
npm run memory:verify
```

## Optional GitHub CLI Setup

Only needed for SSOT board/project maintenance:

```bash
gh auth refresh -h github.com -s read:project,project
```

This is not required for running `{sovereign}` locally.

## Optional MLX Setup

MLX is not required for first delivery. It is an optional target runtime path for Apple Silicon and should be treated as an additive provider track, not a prerequisite for the current shipped baseline.

## After Setup

Continue with:

- [`docs/BUILD_AND_RUN.md`](BUILD_AND_RUN.md)
- [`docs/architecture/0001-theia-desktop-foundation.md`](architecture/0001-theia-desktop-foundation.md)
- [`docs/architecture/0002-rock-solid-open-source-hardening.md`](architecture/0002-rock-solid-open-source-hardening.md)
- [`docs/architecture/0004-memory-pgvector-embedding.md`](architecture/0004-memory-pgvector-embedding.md)
