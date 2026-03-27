# {sovereign}

`{sovereign}` is a local-first desktop product for multi-agent software delivery.

The product goal is not “one coding assistant in an editor.” The goal is a company operating system where multiple AI agents collaborate in one transcript, execute bounded work inside real project workspaces, and build durable project memory over time.

## Delivery Status

Current release stage: `1.1.0`

What is implemented now:

- local macOS app wrapper that launches the product
- local web app and managed worker flow
- unified multi-agent chat with active-agent visibility
- execution-time role enforcement for `@Controller`, `@Drafter`, and `@Writer`
- project-session-aware tool execution
- thread and task event timeline
- local runtime health and service status views
- first durable project-memory capture foundation
- API v1 LLM-compatible surface (`/api/v1/chat/completions`, `/models`, `/health`)
- Trinity execution path with Drafter/Writer/Judge stages, confidence semantics, and bounded retries
- persisted Trinity runs with query endpoints (`/api/v1/trinity/runs`, `/api/v1/trinity/runs/:id`)
- workforce foundations: agent-group registry, nested group membership, cycle guard
- deterministic auto staffing with role scoring + persisted role rankings
- deterministic API v1 workforce e2e gate (`npm run e2e:api-v1-trinity`)

What is only partially implemented:

- Theia desktop integration
- memory retrieval, annotation, and review workflows
- provider abstraction beyond Ollama/OpenAI-compatible/mock execution
- final-judgement and operator review semantics
- advanced ranking calibration and adaptive scoring beyond current deterministic baseline

What is target architecture, not shipped baseline:

- Theia as the primary end-user shell
- `pgvector`-backed retrieval
- MLX as a first-class production runtime
- OpenClaw adapter support

## Recommended Stack

The target delivery stack for `{sovereign}` is:

- Eclipse Theia Desktop for the IDE shell
- Electron for desktop packaging
- TypeScript and Node.js for product logic
- PostgreSQL as the primary source of truth
- Prisma for schema and migrations
- `pgvector` for long-term memory retrieval
- Ollama as the default local model runtime
- MLX as the optional Apple Silicon runtime
- launchd for macOS background services
- custom `{sovereign}` orchestration, memory, policy, and tool-execution layers

GitHub is for source hosting and collaboration. It is not a required runtime dependency for the local product.

## Repository

- GitHub: [moldovancsaba/sovereign](https://github.com/moldovancsaba/sovereign)
- Local root: `/Users/moldovancsaba/Projects/sovereign`
- App: [`/Users/moldovancsaba/Projects/sovereign/apps/sovereign`](/Users/moldovancsaba/Projects/sovereign/apps/sovereign)
- Product version: `1.1.0`

## Repository Shape

```text
.
├── apps/
│   └── sovereign/   # app, worker, Prisma schema, launcher scripts
├── docs/                # architecture, operator docs, contributor docs, product docs
├── tools/theia-desktop/ # in-repo Theia desktop shell bootstrap
├── tools/macos/         # macOS app and helper installers
├── scripts/             # repo-level utility scripts
├── docker-compose.yml   # local Postgres
└── README.md
```

## Product Principles

- local-first runtime
- desktop-first experience
- one unified multi-agent transcript
- explicit agent roles and handoffs
- project-session-aware execution
- durable long-term memory per project
- fail-closed execution and auditability
- open-source foundations instead of closed platform lock-in

## Quick Start

### Developer path

1. Start Postgres (image includes **pgvector** for semantic project memory):

```bash
cd /Users/moldovancsaba/Projects/sovereign
npm run db:up
```

If you previously used plain `postgres:16` without pgvector, recreate the DB volume once after pulling the updated compose file, then run migrations again.

2. Prepare the app:

```bash
cd /Users/moldovancsaba/Projects/sovereign/apps/sovereign
cp .env.example .env
```

3. Install dependencies and generate Prisma client:

```bash
cd /Users/moldovancsaba/Projects/sovereign
npm run install:app
npm run prisma:generate
```

4. Run migrations:

```bash
cd /Users/moldovancsaba/Projects/sovereign/apps/sovereign
npx prisma migrate dev
```

For **non-dev** databases (Docker bootstrap, CI, staging), use `npm run prisma:migrate:deploy` from the repo root (see [docs/SETUP.md](docs/SETUP.md)).

5. Start local development:

```bash
cd /Users/moldovancsaba/Projects/sovereign
npm run dev
```

6. Start the worker in a second terminal:

```bash
cd /Users/moldovancsaba/Projects/sovereign
npm run worker
```

7. Open:

- app: [http://127.0.0.1:3007](http://127.0.0.1:3007)
- dashboard: [http://127.0.0.1:3007/dashboard](http://127.0.0.1:3007/dashboard)
- chat: [http://127.0.0.1:3007/chat](http://127.0.0.1:3007/chat)

### macOS desktop path

Install the app bundle from the repo root:

```bash
cd /Users/moldovancsaba/Projects/sovereign
npm run desktop:install-app
```

This compiles a small native shell, installs **Sovereign.app** to `/Applications` when that folder is writable, otherwise to **`~/Applications`**, and tries to open it. First launch runs `bootstrap-local-dev.sh` (Docker Postgres if needed, Prisma, seeds), then starts `next dev` and the worker and loads chat in a **WebKit** window.

To force the install location (example: system folder when your user cannot write `/Applications`):

`SOVEREIGN_INSTALL_PARENT="$HOME/Applications" npm run desktop:install-app`

or

`sudo SOVEREIGN_INSTALL_PARENT=/Applications bash tools/macos/SovereignDesktop/install_SovereignDesktop.sh`

Optional slow step: `DESKTOP_BUILD_THEIA_ELECTRON=1 npm run desktop:install-app` also builds the Theia Electron shell (not required for the WebKit launcher).

### One-command macOS install

For a fresh Mac (after cloning the repo), run from repo root:

```bash
cd /Users/moldovancsaba/Projects/sovereign
npm run install:macos
```

What it does:

- checks required tools (`node`, `npm`, `docker`, `swiftc`)
- installs app dependencies
- starts local Postgres container
- bootstraps `.env`, Prisma client/migrations, seed data, and runtime doctor
- installs `Sovereign.app`
- starts app + worker in background (`/tmp/sovereign-dev.log`, `/tmp/sovereign-worker.log`)

Optional flags:

- `SKIP_DESKTOP_INSTALL=1 npm run install:macos`
- `SKIP_START=1 npm run install:macos`

## Launch Modes

- Local web/dev app: `http://127.0.0.1:3007`
- Local Postgres: `127.0.0.1:34765`
- Containerized app port remains separate from the main local-first flow
- Theia shell bootstrap is available through repo scripts, but it is still an architecture track, not the default end-user shell

## Runtime Model

Current runtime path:

- Ollama: implemented primary local provider
- local model auto-resolution: implemented
- runtime doctor and health views: implemented

Target runtime path:

- MLX: optional provider for Apple Silicon
- OpenClaw: optional adapter, never the product core

The product should resolve an installed local model automatically where possible instead of failing because one preferred alias is missing. That fallback behavior is implemented for the current Ollama path.

## Documentation Map

- architecture baseline: [`/Users/moldovancsaba/Projects/sovereign/docs/architecture/0001-theia-desktop-foundation.md`](/Users/moldovancsaba/Projects/sovereign/docs/architecture/0001-theia-desktop-foundation.md)
- hardening blueprint: [`/Users/moldovancsaba/Projects/sovereign/docs/architecture/0002-rock-solid-open-source-hardening.md`](/Users/moldovancsaba/Projects/sovereign/docs/architecture/0002-rock-solid-open-source-hardening.md)
- delivery roadmap: [`/Users/moldovancsaba/Projects/sovereign/docs/SOVEREIGN_DELIVERY_ROADMAP.md`](/Users/moldovancsaba/Projects/sovereign/docs/SOVEREIGN_DELIVERY_ROADMAP.md)
- handover: [`/Users/moldovancsaba/Projects/sovereign/HANDOVER.md`](/Users/moldovancsaba/Projects/sovereign/HANDOVER.md)
- setup: [`/Users/moldovancsaba/Projects/sovereign/docs/SETUP.md`](/Users/moldovancsaba/Projects/sovereign/docs/SETUP.md)
- build and run: [`/Users/moldovancsaba/Projects/sovereign/docs/BUILD_AND_RUN.md`](/Users/moldovancsaba/Projects/sovereign/docs/BUILD_AND_RUN.md)
- API v1: [`/Users/moldovancsaba/Projects/sovereign/docs/API_V1.md`](/Users/moldovancsaba/Projects/sovereign/docs/API_V1.md)
- contributing: [`/Users/moldovancsaba/Projects/sovereign/CONTRIBUTING.md`](/Users/moldovancsaba/Projects/sovereign/CONTRIBUTING.md)

## Verification

From the repo root:

```bash
npm run verify
```

## Current Truth

The current codebase is in active hardening and is suitable for first-client delivery preparation, but it has not yet reached the full target architecture. Read the docs with these rules:

- `README.md`, `BUILD_AND_RUN.md`, `SETUP.md`, and `HANDOVER.md` describe the implemented baseline
- the ADRs and roadmap describe both implemented work and target architecture
- anything marked as Theia-primary, MLX-first-class, OpenClaw-integrated, or `pgvector` retrieval should be treated as target state unless explicitly called out as implemented
