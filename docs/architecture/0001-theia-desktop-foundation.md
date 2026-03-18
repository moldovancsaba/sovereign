# ADR 0001: `{sentinelsquad}` Desktop Foundation And Product Boundaries

## Status

Accepted as target architecture. Partially implemented.

## Date

2026-03-17

## Decision

`{sentinelsquad}` is a desktop-first product with Eclipse Theia Desktop as the target primary shell.

Theia is the target desktop shell and IDE substrate. `{sentinelsquad}` remains the product core and source of truth for:

- agent registry and readiness
- threads, messages, tasks, and event history
- role-chain enforcement
- approvals, audit, and policy decisions
- workspace and project-session identity
- runtime/provider routing

Model runtimes are adapters, not the product foundation:

- Ollama is the primary local runtime
- MLX is an optional Apple Silicon runtime adapter
- OpenClaw is an optional controlled tool/runtime adapter

The broader recommended product stack is:

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
- custom `{sentinelsquad}` orchestration, memory, and policy layers

## Context

The current implementation is a local-first Next.js product with a native macOS wrapper, strong orchestration, task, policy, and transcript primitives. What it still lacks is the full transition to Theia as the primary end-user shell.

We evaluated three realistic directions:

1. Eclipse Theia Desktop
2. Code OSS / VSCodium-style fork
3. Continue evolving the current browser app as the primary shell

The product direction rejects the browser-first option. A VSCodium-style fork would give ecosystem familiarity, but it would create a heavier long-term maintenance burden around product-level customization, especially for multi-agent chat, approvals, runtime orchestration, and workspace identity.

Theia gives a cleaner foundation for a branded desktop IDE while still supporting IDE-grade capabilities and compatible extension strategies.

## Why Theia

- intended for building custom IDE products, not only editors
- desktop packaging is a first-class path
- supports custom panels and workflows better than trying to force everything through browser pages
- keeps the IDE shell decoupled from `{sentinelsquad}` orchestration logic
- supports future extension reuse without making marketplace plugins the core architecture

## Product Boundaries

### Theia Shell Owns

- desktop windowing and shell lifecycle
- workbench layout
- file explorer, editor, terminal, command palette, and panel docking
- workspace opening and project window presentation
- future `{sentinelsquad}` panels embedded into the desktop shell

### `{sentinelsquad}` Core Owns

- persistent agent metadata
- thread, task, and event persistence
- multi-agent unified transcript semantics
- role-chain contracts for `@Controller`, `@Drafter`, and `@Writer`
- approval and denial reasons
- policy enforcement and audit trail
- project-session registry and workspace identity
- task enqueueing and execution state

### Runtime Adapters Own

- model invocation and health checks
- provider capability metadata
- runtime-specific normalization
- transport details for Ollama, MLX, and optional OpenClaw integrations

### Data And Memory Foundation Owns

- PostgreSQL as the primary source of truth
- Prisma for schema and migration discipline
- `pgvector` for project memory retrieval

## Extension Strategy

Theia-native extensions should be the default strategy for any feature that is core to `{sentinelsquad}`:

- unified multi-agent chat
- command-center transcript
- approvals and audit panels
- runtime health and routing panels
- project-session aware actions

VS Code-compatible extensions may be reused selectively where they accelerate the shell, but they must not become the source of truth for core product workflows.

Marketplace reuse is optional and subordinate to product control.

## Packaging And Upgrade Policy

- macOS-first desktop packaging
- local-first startup path must remain possible without cloud dependencies
- shell upgrades must not change `{sentinelsquad}` database, policy, or runtime contracts implicitly
- product-specific shell integrations should be isolated enough that Theia upgrades are manageable

## Workspace And Session Rule

The desktop shell may open folders and workspaces, but `{sentinelsquad}` owns the durable identity of project sessions. That identity is what tasks, transcripts, and runtime actions must attach to.

This avoids a class of bugs where the UI and orchestrator disagree about which local project context is active.

## Consequences

### Positive

- clear separation between IDE shell and product core
- cleaner path from prototype to branded desktop IDE
- local-first architecture remains intact
- current orchestration code can survive the shell transition

### Negative

- we still need to build the Theia shell bootstrap ourselves
- some extension compatibility will require validation
- the current shipped Next.js product must gradually move behind a desktop shell boundary

## Implementation Status

Implemented now:

- in-repo Theia bootstrap exists
- native macOS wrapper exists
- product/session/runtime contracts exist on the `{sentinelsquad}` side

Not yet complete:

- Theia is not the primary shipped shell
- `{sentinelsquad}`-native Theia extensions are not yet the main operator surface

## Immediate Follow-Up Work

- bootstrap the Theia desktop shell
- formalize the project-session registry and workspace host flow
- connect unified transcript and runtime health surfaces to the future desktop shell
- move execution entry points onto project-session aware APIs

## Rejected Alternatives

### Browser-First Primary Shell

Rejected because the product requirement is explicitly desktop-first, not browser-first.

### VSCodium As Product Foundation

Rejected as the primary product base because it is better treated as a distribution/reference point than as the architectural center of a deeply customized multi-agent desktop product.
