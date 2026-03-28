# Build And Run

This document defines the supported local build and launch flows for `{sovereign}`.

Use **your clone directory** everywhere you see `<repo>` below, or set a variable once:

```bash
export SOVEREIGN_REPO="$(git rev-parse --show-toplevel)"
cd "$SOVEREIGN_REPO"
```

## Runtime Assumptions

`{sovereign}` is a local-first desktop product.

Supported local foundations:

- Node.js 20
- PostgreSQL
- Ollama as the default model runtime
- optional MLX on Apple Silicon
- macOS launchd for managed local services

GitHub is not required to run the local product.

## Stage Classification

Implemented now:

- local app and Nexus Bridge launch
- External Vanguard (Discord) integration
- macOS app bundle install
- managed local services
- unified chat with live agent visibility
- Ollama-first runtime health and model auto-resolution

Partially implemented:

- Theia shell integration
- long-term memory retrieval and review
- non-Ollama provider integration

## Primary Paths

### 1. Developer path

Use this when developing or debugging the product directly.

#### Start the database

```bash
cd <repo>
npm run db:up
```

#### Prepare environment

```bash
cd <repo>/apps/sovereign
cp .env.example .env
```

#### Install and generate Prisma client

```bash
cd <repo>
npm run install:app
npm run prisma:generate
```

#### Run migrations

**Dev:** `cd apps/sovereign && npx prisma migrate dev`

**Deploy-style (Docker, CI, shared DB):** from repo root, `npm run prisma:migrate:deploy` (after `db:up` if using compose). Same command CI uses via `sovereign-docker-bootstrap.sh`.

#### Start the app

```bash
cd <repo>
npm run dev
```

#### Activate the Nexus Bridge
 
In a second terminal:
 
```bash
cd <repo>
npm run nexus:bridge
```
 
#### Deploy the External Vanguard
 
In a third terminal:
 
```bash
cd <repo>
npm run vanguard:run
```

Open (use **`localhost`** so the host matches **`NEXTAUTH_URL`** in `.env.example`):

- [http://localhost:3007/dashboard](http://localhost:3007/dashboard)
- [http://localhost:3007/chat](http://localhost:3007/chat)

### 2. Managed local service path

Use this when you want the local app, Nexus Bridge, and Ollama integration managed by launchd.

```bash
cd <repo>
npm run service:install
npm run service:status
```

### 3. macOS app bundle path

Use this for the product-style local launch experience.

```bash
cd <repo>
npm run desktop:install-app
open ~/Applications/Sovereign.app
```

If the installer placed the app under `/Applications`, use `open /Applications/Sovereign.app` instead.

## Theia Desktop Path

Theia is the target shell foundation, not the current default end-user shell.

Bootstrap path:

```bash
cd <repo>
npm run desktop:bootstrap
npm run desktop:build
npm run desktop:start
```

This exists to evolve the desktop shell architecture. The core orchestration, memory, and task system still belong to `{sovereign}`, and the primary current UX still comes from the product app launched by the native macOS wrapper.

## Verification

Run from repo root:

```bash
npm run verify
```

Minimum successful local validation:

- database reachable on `127.0.0.1:34765` (or `localhost:34765`)
- app reachable on **`http://localhost:3007`**
- fresh intent ingested via Discord Vanguard completes in chat
- dashboard shows local service and runtime health without requiring GitHub

## Troubleshooting

### Build fails because DB is unreachable

Symptoms:

- Prisma client initialization errors
- prerender/build failures on pages that touch DB-backed session state

Fix:

```bash
cd <repo>
npm run db:up
```

### Nexus Bridge is alive but tasks fail immediately

Check:

- local provider health
- installed Ollama models
- Nexus Bridge log output

The runtime layer should resolve an installed model instead of failing on a missing preferred alias, but if startup is broken, inspect:

- `apps/sovereign/.sovereign/daemon-logs/nexus-bridge.out.log` (or legacy `.sentinelsquad/` if not migrated)
- `apps/sovereign/.sovereign/daemon-logs/nexus-bridge.err.log`

### Dashboard still shows GitHub-related messaging

That is a documentation or UI bug, not an intended operating requirement. `{sovereign}` is a local-only product by default and should remain usable without GitHub runtime access.

## Related Documents

- [`docs/BUILD_AND_RUN.md`](BUILD_AND_RUN.md) — The 3-command bootstrap missions
- [`docs/SOVEREIGN_GEMINI_INITIATIVE.md`](SOVEREIGN_GEMINI_INITIATIVE.md) — The joint vision
- [architecture/0002-rock-solid-open-source-hardening.md](architecture/0002-rock-solid-open-source-hardening.md)
