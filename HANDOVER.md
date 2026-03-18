# {sentinelsquad} Handover

## Current Release

- Version: `1.0.1`
- Date: `2026-03-18`
- Stage: `first-client-delivery hardening`

## Implemented Now

- local-first macOS product launch through [`/Users/moldovancsaba/Applications/SentinelSquad.app`](/Users/moldovancsaba/Applications/SentinelSquad.app)
- local app on `http://127.0.0.1:3007`
- Postgres on `127.0.0.1:34765`
- unified multi-agent chat
- active-agent visibility and runtime/status commands
- managed worker running `@Controller`
- execution-time role enforcement
- project-session-aware tool execution
- thread and task event timeline
- local runtime doctor, local system-service status, and dashboard health
- durable project-memory capture foundation

## Partially Implemented

- Theia desktop shell transition
- memory retrieval, annotation, and review
- complete provider abstraction beyond the current Ollama-first path
- final-judgement and operator review semantics
- first-public OSS packaging polish

## Target Architecture

- Theia as the primary shell
- `pgvector` retrieval for long-term memory
- MLX as a first-class provider
- OpenClaw adapter support
- richer project-memory curation workflows

## Operator Truth

- GitHub is optional for runtime
- the `mvp-factory-control` project board is the SSOT for delivery planning
- this repository is the implementation and documentation source for the product itself

## Verification Commands

```bash
cd /Users/moldovancsaba/Projects/sentinelsquad
npm run typecheck
npm run build
```

## Next Priority

1. finish `#322` transcript final-judgement hardening
2. continue `#431` memory retrieval and annotation foundation
3. keep docs and board in sync with implemented state
