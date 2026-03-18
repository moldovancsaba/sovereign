# {sentinelsquad}

`{sentinelsquad}` is a local-first desktop product for multi-agent software delivery.

The product goal is not “one coding assistant in an editor.” The goal is a company operating system where multiple AI agents collaborate in one transcript, execute bounded work inside real project workspaces, and build durable project memory over time.

## Delivery Status

Current release stage: `1.0.1`

What is implemented now:

- local macOS app wrapper that launches the product
- local web app and managed worker flow
- unified multi-agent chat with active-agent visibility
- execution-time role enforcement for `@Controller`, `@Drafter`, and `@Writer`
- project-session-aware tool execution
- thread and task event timeline
- local runtime health and service status views
- first durable project-memory capture foundation

What is only partially implemented:

- Theia desktop integration
- memory retrieval, annotation, and review workflows
- provider abstraction beyond Ollama-first execution
- final-judgement and operator review semantics

What is target architecture, not shipped baseline:

- Theia as the primary end-user shell
- `pgvector`-backed retrieval
- MLX as a first-class production runtime
- OpenClaw adapter support

## Recommended Stack

The target delivery stack for `{sentinelsquad}` is:

- Eclipse Theia Desktop for the IDE shell
- Electron for desktop packaging
- TypeScript and Node.js for product logic
- PostgreSQL as the primary source of truth
- Prisma for schema and migrations
- `pgvector` for long-term memory retrieval
- Ollama as the default local model runtime
- MLX as the optional Apple Silicon runtime
- launchd for macOS background services
- custom `{sentinelsquad}` orchestration, memory, policy, and tool-execution layers

GitHub is for source hosting and collaboration. It is not a required runtime dependency for the local product.

## Repository

- GitHub: [moldovancsaba/sentinelsquad](https://github.com/moldovancsaba/sentinelsquad)
- Local root: `/Users/moldovancsaba/Projects/sentinelsquad`
- App: [`/Users/moldovancsaba/Projects/sentinelsquad/apps/sentinelsquad`](/Users/moldovancsaba/Projects/sentinelsquad/apps/sentinelsquad)
- Product version: `1.0.1`

## Repository Shape

```text
.
├── apps/
│   └── sentinelsquad/   # app, worker, Prisma schema, launcher scripts
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

1. Start Postgres:

```bash
cd /Users/moldovancsaba/Projects/sentinelsquad
npm run db:up
```

2. Prepare the app:

```bash
cd /Users/moldovancsaba/Projects/sentinelsquad/apps/sentinelsquad
cp .env.example .env
```

3. Install dependencies and generate Prisma client:

```bash
cd /Users/moldovancsaba/Projects/sentinelsquad
npm run install:app
npm run prisma:generate
```

4. Run migrations:

```bash
cd /Users/moldovancsaba/Projects/sentinelsquad/apps/sentinelsquad
npx prisma migrate dev
```

5. Start local development:

```bash
cd /Users/moldovancsaba/Projects/sentinelsquad
npm run dev
```

6. Open:

- app: [http://127.0.0.1:3007](http://127.0.0.1:3007)
- dashboard: [http://127.0.0.1:3007/dashboard](http://127.0.0.1:3007/dashboard)
- chat: [http://127.0.0.1:3007/chat](http://127.0.0.1:3007/chat)

### macOS desktop path

Install the app bundle from the repo root:

```bash
cd /Users/moldovancsaba/Projects/sentinelsquad
npm run desktop:install-app
open /Users/moldovancsaba/Applications/SentinelSquad.app
```

The desktop app bootstraps the local `.env`, starts the local stack, and opens the current `{sentinelsquad}` product UI in local desktop mode.

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

- architecture baseline: [`/Users/moldovancsaba/Projects/sentinelsquad/docs/architecture/0001-theia-desktop-foundation.md`](/Users/moldovancsaba/Projects/sentinelsquad/docs/architecture/0001-theia-desktop-foundation.md)
- hardening blueprint: [`/Users/moldovancsaba/Projects/sentinelsquad/docs/architecture/0002-rock-solid-open-source-hardening.md`](/Users/moldovancsaba/Projects/sentinelsquad/docs/architecture/0002-rock-solid-open-source-hardening.md)
- delivery roadmap: [`/Users/moldovancsaba/Projects/sentinelsquad/docs/SENTINELSQUAD_DELIVERY_ROADMAP.md`](/Users/moldovancsaba/Projects/sentinelsquad/docs/SENTINELSQUAD_DELIVERY_ROADMAP.md)
- handover: [`/Users/moldovancsaba/Projects/sentinelsquad/HANDOVER.md`](/Users/moldovancsaba/Projects/sentinelsquad/HANDOVER.md)
- setup: [`/Users/moldovancsaba/Projects/sentinelsquad/docs/SETUP.md`](/Users/moldovancsaba/Projects/sentinelsquad/docs/SETUP.md)
- build and run: [`/Users/moldovancsaba/Projects/sentinelsquad/docs/BUILD_AND_RUN.md`](/Users/moldovancsaba/Projects/sentinelsquad/docs/BUILD_AND_RUN.md)
- contributing: [`/Users/moldovancsaba/Projects/sentinelsquad/CONTRIBUTING.md`](/Users/moldovancsaba/Projects/sentinelsquad/CONTRIBUTING.md)

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
