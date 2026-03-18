# {sentinelsquad} Product

## Product Role

`{sentinelsquad}` is the local-first desktop product for multi-agent software delivery and long-term project memory.

The product ambition is:

- AI agents as the software team
- one unified transcript
- sovereign decision intelligence
- durable project knowledge
- real workspace execution under explicit policy

## Greenfield Target Stack

If the product were designed from zero with no legacy influence, the recommended stack would be:

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
- custom `{sentinelsquad}` orchestration, memory, and tool-execution layers

## Product Boundaries

`{sentinelsquad}` owns:

- agent identity and readiness
- thread, task, and event truth
- role chain and handoffs
- approvals and policy
- project sessions
- project memory
- runtime selection policy

External systems own:

- token generation
- optional embedding generation
- optional tool/runtime adapters

GitHub owns:

- source hosting
- pull requests
- collaboration workflows

GitHub does not own local runtime truth.

## Repository Boundary

The local repository is:

- `/Users/moldovancsaba/Projects/sentinelsquad`

This repository is the product codebase for `{sentinelsquad}`.

## Delivery Boundary

The SSOT for delivery planning may live on the shared `mvp-factory-control` project board, but the engineering truth for product implementation lives in this repository’s code and architecture docs.

That means:

- board issues define delivery sequencing
- this repo defines implementation truth
- the two must stay synchronized
