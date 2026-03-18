# Build And Run

This document defines the supported local build and launch flows for `{sentinelsquad}`.

## Runtime Assumptions

`{sentinelsquad}` is a local-first desktop product.

Supported local foundations:

- Node.js 20
- PostgreSQL
- Ollama as the default model runtime
- optional MLX on Apple Silicon
- macOS launchd for managed local services

GitHub is not required to run the local product.

## Stage Classification

Implemented now:

- local app and worker launch
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
cd /Users/moldovancsaba/Projects/sentinelsquad
npm run db:up
```

#### Prepare environment

```bash
cd /Users/moldovancsaba/Projects/sentinelsquad/apps/sentinelsquad
cp .env.example .env
```

#### Install and generate Prisma client

```bash
cd /Users/moldovancsaba/Projects/sentinelsquad
npm run install:app
npm run prisma:generate
```

#### Run migrations

```bash
cd /Users/moldovancsaba/Projects/sentinelsquad/apps/sentinelsquad
npx prisma migrate dev
```

#### Start the app

```bash
cd /Users/moldovancsaba/Projects/sentinelsquad
npm run dev
```

Open:

- [http://127.0.0.1:3007/dashboard](http://127.0.0.1:3007/dashboard)
- [http://127.0.0.1:3007/chat](http://127.0.0.1:3007/chat)

### 2. Managed local service path

Use this when you want the local app, worker, and Ollama integration managed by launchd.

```bash
cd /Users/moldovancsaba/Projects/sentinelsquad
npm run service:install
npm run service:status
```

### 3. macOS app bundle path

Use this for the product-style local launch experience.

```bash
cd /Users/moldovancsaba/Projects/sentinelsquad
npm run desktop:install-app
open /Users/moldovancsaba/Applications/SentinelSquad.app
```

## Theia Desktop Path

Theia is the target shell foundation, not the current default end-user shell.

Bootstrap path:

```bash
cd /Users/moldovancsaba/Projects/sentinelsquad
npm run desktop:bootstrap
npm run desktop:build
npm run desktop:start
```

This exists to evolve the desktop shell architecture. The core orchestration, memory, and task system still belong to `{sentinelsquad}`, and the primary current UX still comes from the product app launched by the native macOS wrapper.

## Verification

Run from repo root:

```bash
npm run verify
```

Minimum successful local validation:

- database reachable on `127.0.0.1:34765`
- app reachable on `127.0.0.1:3007`
- fresh `@Controller` task completes in chat
- dashboard shows local service and runtime health without requiring GitHub

## Troubleshooting

### Build fails because DB is unreachable

Symptoms:

- Prisma client initialization errors
- prerender/build failures on pages that touch DB-backed session state

Fix:

```bash
cd /Users/moldovancsaba/Projects/sentinelsquad
npm run db:up
```

### Worker is alive but tasks fail immediately

Check:

- local provider health
- installed Ollama models
- worker log output

The runtime layer should resolve an installed model instead of failing on a missing preferred alias, but if startup is broken, inspect:

- `apps/sentinelsquad/.sentinelsquad/daemon-logs/worker.out.log`
- `apps/sentinelsquad/.sentinelsquad/daemon-logs/worker.err.log`

### Dashboard still shows GitHub-related messaging

That is a documentation or UI bug, not an intended operating requirement. `{sentinelsquad}` is a local-only product by default and should remain usable without GitHub runtime access.

## Related Documents

- [`/Users/moldovancsaba/Projects/sentinelsquad/docs/SETUP.md`](/Users/moldovancsaba/Projects/sentinelsquad/docs/SETUP.md)
- [`/Users/moldovancsaba/Projects/sentinelsquad/docs/architecture/0001-theia-desktop-foundation.md`](/Users/moldovancsaba/Projects/sentinelsquad/docs/architecture/0001-theia-desktop-foundation.md)
- [`/Users/moldovancsaba/Projects/sentinelsquad/docs/architecture/0002-rock-solid-open-source-hardening.md`](/Users/moldovancsaba/Projects/sentinelsquad/docs/architecture/0002-rock-solid-open-source-hardening.md)
