# Coding Standards

These are the engineering standards for `{sentinelsquad}`.

## Product Baseline

- Build for a local-first desktop product.
- Prefer open-source, inspectable dependencies.
- Keep the system understandable by one strong engineer reading the codebase directly.
- Favor durable architecture over fashionable abstraction.

## Core Rules

- No hidden runtime dependencies for core product behavior.
- No cloud-only assumptions in the default path.
- No hardcoded product state when configuration or schema is the right solution.
- No duplicate orchestration logic across UI, worker, and runtime layers.
- No stale product naming, legacy internal brands, or misleading operator copy.

## Architecture Rules

- Keep a clear boundary between product shell, orchestration, tool execution, memory, and persistence.
- Keep PostgreSQL as the durable source of truth for threads, tasks, events, memory metadata, and audit.
- Keep agent availability derived from one shared model.
- Keep tool execution project-scoped and policy-gated.
- Keep long-term memory explicit: what is stored, when it is updated, and how it is recalled.

## Runtime Rules

- Local model runtimes must be swappable.
- Ollama is the primary local runtime; MLX is an optional accelerator path.
- Runtime fallback behavior must be explicit and observable.
- Startup, health, and recovery flows must be deterministic.

## Code Design Rules

- Prefer small modules with explicit inputs and outputs.
- Prefer typed contracts over stringly-typed ad hoc payloads.
- Prefer composition over hidden singleton coupling.
- Prefer one implementation path over parallel legacy paths.
- Prefer boring code that operators can trust.

## Data and Migration Rules

- All durable state changes must be backed by schema and migration changes where appropriate.
- Event and memory records must be append-friendly and auditable.
- Destructive data changes require an explicit migration plan.

## UI Rules

- The operator must be able to tell what the system is doing.
- Loading, failure, and degraded states must be visible and actionable.
- Agent identity, role, readiness, and model should not be ambiguous in the UI.

## Validation Rules

Before calling work complete:

- build passes
- typecheck passes
- relevant tests pass
- startup path is still coherent
- documentation stays aligned with behavior

## Dependency Rule

Add a new dependency only if it materially improves delivery, reliability, or maintainability. If the system can be simpler without it, keep it simpler.
