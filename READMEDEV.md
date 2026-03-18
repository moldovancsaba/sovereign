# READMEDEV

This file is the developer operating guide for the `{sentinelsquad}` product repository.

## What This Repository Is

This repository is the product codebase for `{sentinelsquad}`.

It is not the `mvp-factory-control` repository.

Use this repository for:

- product implementation
- product architecture
- operator docs
- contributor docs
- local runtime and desktop-launch work

The GitHub project board in `mvp-factory-control` remains the delivery SSOT, but this repo is the engineering truth for `{sentinelsquad}` implementation details.

## Required Reading Order

1. [README.md](README.md)
2. [CONTRIBUTING.md](CONTRIBUTING.md)
3. [docs/WIKI.md](docs/WIKI.md)
4. [docs/architecture/0001-theia-desktop-foundation.md](docs/architecture/0001-theia-desktop-foundation.md)
5. [docs/architecture/0002-rock-solid-open-source-hardening.md](docs/architecture/0002-rock-solid-open-source-hardening.md)
6. [docs/SENTINELSQUAD_DELIVERY_ROADMAP.md](docs/SENTINELSQUAD_DELIVERY_ROADMAP.md)

## Architecture Truth

The recommended delivery stack is:

- Eclipse Theia Desktop
- Electron
- TypeScript
- Node.js
- PostgreSQL
- Prisma
- `pgvector`
- Ollama
- MLX
- launchd
- custom `{sentinelsquad}` orchestration, memory, and tool policy layers

GitHub is for source hosting and collaboration. It is not required for the local runtime path.

## Current Implementation Truth

Do not treat the target stack as fully shipped.

Implemented baseline:

- Next.js app is still the primary product UI
- native macOS wrapper is the primary packaged launch path
- Ollama-first runtime is real
- managed worker and launchd path are real
- unified multi-agent chat is real
- project sessions and thread events are real
- durable project memory is at foundation stage only

Target architecture not yet fully shipped:

- Theia as the primary shell
- MLX as a first-class runtime path
- OpenClaw adapter
- `pgvector` retrieval and curated memory workflows

## Developer Flow

1. Start DB.
2. Prepare `.env`.
3. Install dependencies and run Prisma.
4. Start the local app.
5. Verify a fresh `@Controller` task in chat if your change affects runtime behavior.

Canonical commands live in:

- [docs/BUILD_AND_RUN.md](docs/BUILD_AND_RUN.md)
- [docs/SETUP.md](docs/SETUP.md)

## Documentation Rule

If you change:

- architecture
- startup flow
- runtime provider behavior
- memory behavior
- desktop app launch behavior
- operator workflow

then update the relevant docs in the same change.

Use these labels in docs when needed:

- `Implemented now`
- `Partially implemented`
- `Target architecture`

## Boundaries

- Do not reintroduce GitHub board assumptions into local runtime surfaces.
- Do not treat browser-first design as the default path.
- Do not couple orchestration logic directly to a provider-specific API if a provider abstraction is expected.
- Do not hide startup truth inside scripts without matching docs.
