# Agent Prompts

This file defines reusable prompt baselines for agents operating inside `{sentinelsquad}`.

`{sentinelsquad}` is a local-first desktop product where multiple AI agents collaborate in a unified chat, execute workspace-scoped tools, and maintain long-term project memory.

## Prompt: Work In `{sentinelsquad}`

Use when the task belongs to this repository.

```text
You are working inside {sentinelsquad}, a local-first desktop product for multi-agent software delivery.
Treat this repository as product code, not as a portfolio-management repository.
Preserve the core product contract:
- unified multi-agent chat
- explicit agent roles and orchestration
- project-scoped tools and memory
- local-first operation on macOS
- open-source, understandable, auditable architecture

Before changing code, identify:
- the operator-visible behavior being changed
- the runtime boundary involved
- the persistence or memory impact
- the validation path needed before completion

Prefer simple durable systems over framework-heavy abstractions.
Do not introduce cloud-only assumptions, hidden services, or product language that operators cannot understand.
```

## Prompt: Build A Product Feature

Use for implementation work in the app, desktop shell, runtime, or memory systems.

```text
Implement the feature directly in {sentinelsquad}.
Keep the local-first contract intact:
- no required remote dependency for core product behavior
- PostgreSQL remains the durable system of record
- local model runtimes remain swappable
- tools remain policy-gated and project-scoped

When the feature touches orchestration, make the agent role boundaries explicit.
When the feature touches memory, define what is stored, why it is stored, and how it is retrieved.
When the feature touches UI, keep operator flows obvious and failure modes visible.
```

## Prompt: Harden The System

Use for reliability, security, packaging, or installability work.

```text
Harden {sentinelsquad} for real local use on macOS.
Assume the operator expects the app to install, launch, recover, and explain failures without hidden steps.

Favor:
- deterministic startup
- explicit health checks
- durable migrations
- clear logs
- fail-closed policy behavior
- documented recovery paths

Avoid:
- silent fallbacks
- magic background behavior
- unclear agent availability rules
- partial setup that only works in a dev shell
```

## Prompt: Improve Multi-Agent Collaboration

Use for unified chat, delegation, task routing, or role enforcement work.

```text
Treat {sentinelsquad} as a sovereign multi-agent work system, not a single-assistant chat wrapper.
Optimize for:
- many agents in one thread
- explicit role ownership
- auditable delegation
- transcript clarity
- workspace-aware execution
- memory continuity across long-running project work

Do not collapse the interaction model into a generic chatbot.
Each agent action should be attributable, explainable, and bounded by the product's orchestration rules.
```

## Prompt: Documentation Maintenance

Use for docs work in this repository.

```text
Write documentation for {sentinelsquad} as a standalone open-source product.
Keep docs concrete, local-first, and implementation-aware.
Document:
- what the system is
- how to install it on macOS
- how agents, memory, and runtimes work
- what is optional versus required
- how to recover from common failures

Remove stale portfolio-management language, generic filler, and references to products that are not part of this repository.
Prefer one clear source over duplicated or contradictory documents.
```
