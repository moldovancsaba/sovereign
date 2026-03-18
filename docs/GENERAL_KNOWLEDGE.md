# General Knowledge

This file captures durable knowledge about `{sentinelsquad}` as a product.

## Product Identity

`{sentinelsquad}` is a local-first desktop system where multiple AI agents collaborate in a unified chat, execute project-scoped work, and build long-term memory for software delivery.

It is not:

- a browser-first product
- a cloud-required agent platform
- a generic single-assistant chat wrapper
- a portfolio-management repository

## Core Product Principles

- The operator should be able to run the product locally on macOS.
- Core behavior should work without GitHub, cloud auth, or hosted control planes.
- Agent collaboration should be explicit, attributable, and auditable.
- Long-term memory should be durable, inspectable, and attached to projects and threads.
- Open-source technologies should form the foundation wherever practical.

## Recommended Technical Baseline

- Eclipse Theia Desktop for the long-term IDE shell direction
- Electron for desktop packaging
- TypeScript and Node.js for product logic
- PostgreSQL as the durable system of record
- Prisma for schema and migration ergonomics
- `pgvector` for retrieval-backed memory
- Ollama as the primary local model runtime
- MLX as an optional Apple Silicon runtime path
- custom orchestration, memory, and tool-policy layers inside `{sentinelsquad}`
- `launchd` for macOS-local service management

## Architecture Heuristics

- Keep the number of mandatory moving parts low.
- Prefer one durable database over many specialized stores early.
- Treat event history as a first-class system, not incidental logs.
- Treat memory as both structured knowledge and retrieval data.
- Build runtime abstraction at the product boundary, not through framework sprawl.

## Operator Heuristics

- A fresh operator should be able to install, launch, and understand the system without reading the entire codebase.
- The app should explain what is active, what failed, and what to do next.
- Agent names, roles, and current availability must be visible.

## Glossary

- `Operator`: the human running `{sentinelsquad}` locally.
- `Agent`: an AI worker with a role, runtime, and tool policy boundary.
- `Unified chat`: the shared transcript where multiple agents and the operator collaborate.
- `Project session`: the active workspace contract for tools, files, tasks, and memory.
- `Long-term memory`: durable project knowledge persisted beyond a single exchange.
- `Runtime provider`: the model backend used by an agent, such as Ollama or MLX.

## Maintenance Rule

Add knowledge here only if it is likely to remain useful across multiple implementation cycles. Temporary design notes belong in execution issues or focused architecture docs instead.
