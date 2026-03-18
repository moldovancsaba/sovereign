# Contributing

## Repository Scope

This repository is the product repository for `{sentinelsquad}` only.

Do not treat it as:

- `mvp-factory-control`
- a multi-product management repository
- a GitHub-project-board runtime

The SSOT for delivery planning may live on the shared board, but this repository is the product codebase and documentation surface for `{sentinelsquad}`.

## Architecture Baseline

Contributors must assume this stack and boundary model:

- Eclipse Theia Desktop is the desktop shell foundation
- `{sentinelsquad}` owns orchestration, memory, policy, tasks, and audit
- PostgreSQL is the primary source of truth
- Ollama is the default local runtime
- MLX is optional
- GitHub is optional for runtime and required only for source hosting / board workflows

Read first:

- [`/Users/moldovancsaba/Projects/sentinelsquad/docs/architecture/0001-theia-desktop-foundation.md`](/Users/moldovancsaba/Projects/sentinelsquad/docs/architecture/0001-theia-desktop-foundation.md)
- [`/Users/moldovancsaba/Projects/sentinelsquad/docs/architecture/0002-rock-solid-open-source-hardening.md`](/Users/moldovancsaba/Projects/sentinelsquad/docs/architecture/0002-rock-solid-open-source-hardening.md)

## Local Development

1. Use Node `20`.
2. Start Postgres:

```bash
cd /Users/moldovancsaba/Projects/sentinelsquad
npm run db:up
```

3. Prepare app dependencies and Prisma:

```bash
cd /Users/moldovancsaba/Projects/sentinelsquad
npm run install:app
npm run prisma:generate
cd apps/sentinelsquad && npx prisma migrate dev
```

4. Start development:

```bash
cd /Users/moldovancsaba/Projects/sentinelsquad
npm run dev
```

## What Good Changes Look Like

Good contributions move the product toward:

- deterministic local launch
- cleaner runtime/provider abstraction
- stronger multi-agent transcript quality
- durable project memory and annotation
- Theia-native productization
- better operator documentation

## Mandatory Conventions

- keep `{sentinelsquad}` naming consistent in code, docs, and UI
- keep GitHub runtime assumptions optional
- prefer local-first behavior over cloud-first design shortcuts
- keep role and execution policy fail-closed
- keep project-session identity explicit
- avoid introducing unnecessary infrastructure complexity

## Verification

Run before pushing when your change touches product code:

```bash
cd /Users/moldovancsaba/Projects/sentinelsquad
npm run verify
```

If your change touches startup/runtime flow, also verify:

- local DB reachability
- app launch
- worker health
- fresh `@Controller` task behavior

## Documentation Rule

If you change architecture, startup, runtime behavior, memory behavior, or operator flows, update the relevant docs in the same change.
