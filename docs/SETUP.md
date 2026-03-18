# Setup

This page describes one-time setup for working on `{sentinelsquad}` locally.

## Product Mode

`{sentinelsquad}` is a local-only product by default.

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

- repo root: `/Users/moldovancsaba/Projects/sentinelsquad`
- app: `/Users/moldovancsaba/Projects/sentinelsquad/apps/sentinelsquad`

## First-Time Local Setup

### 1. Start Postgres

```bash
cd /Users/moldovancsaba/Projects/sentinelsquad
npm run db:up
```

### 2. Create local env

```bash
cd /Users/moldovancsaba/Projects/sentinelsquad/apps/sentinelsquad
cp .env.example .env
```

### 3. Install dependencies

```bash
cd /Users/moldovancsaba/Projects/sentinelsquad
npm run install:app
npm run prisma:generate
```

### 4. Run migrations

```bash
cd /Users/moldovancsaba/Projects/sentinelsquad/apps/sentinelsquad
npx prisma migrate dev
```

### 5. Ensure Ollama is available

At minimum:

```bash
curl http://127.0.0.1:11434/api/tags
```

The recommended product behavior is to resolve an installed local model automatically, but the local runtime must still be available.

## Optional GitHub CLI Setup

Only needed for SSOT board/project maintenance:

```bash
gh auth refresh -h github.com -s read:project,project
```

This is not required for running `{sentinelsquad}` locally.

## Optional MLX Setup

MLX is not required for first delivery. It is an optional target runtime path for Apple Silicon and should be treated as an additive provider track, not a prerequisite for the current shipped baseline.

## After Setup

Continue with:

- [`/Users/moldovancsaba/Projects/sentinelsquad/docs/BUILD_AND_RUN.md`](/Users/moldovancsaba/Projects/sentinelsquad/docs/BUILD_AND_RUN.md)
- [`/Users/moldovancsaba/Projects/sentinelsquad/docs/architecture/0001-theia-desktop-foundation.md`](/Users/moldovancsaba/Projects/sentinelsquad/docs/architecture/0001-theia-desktop-foundation.md)
- [`/Users/moldovancsaba/Projects/sentinelsquad/docs/architecture/0002-rock-solid-open-source-hardening.md`](/Users/moldovancsaba/Projects/sentinelsquad/docs/architecture/0002-rock-solid-open-source-hardening.md)
