# ADR 0002: Rock-Solid Open-Source Hardening Blueprint

## Status

Accepted as execution blueprint. Mixed implementation state.

## Purpose

This document defines the hardening plan for `{sentinelsquad}` to become:

- a desktop-first, local-first open-source product
- easy to install and launch on macOS
- built on open-source foundations
- interoperable with multiple open-source LLM runtimes
- capable of persistent, project-scoped long-term memory
- maintainable as a serious public repository

This is not a feature wishlist. It is the execution contract for turning the current codebase into a durable product.

## Product Position

`{sentinelsquad}` is the future operating system for AI-native software teams.

The product model is:

- one company
- many projects
- many AI agents
- one sovereign decision layer
- one auditable memory and execution system

The long-term principle is:

`{sentinelsquad}` is not just an assistant shell.
`{sentinelsquad}` is the company runtime for AI employees.

## Required Product Properties

The hardened product must satisfy all of the following:

1. Local-first
- Must function without GitHub project-board integration.
- Must keep core runtime, chat, orchestration, memory, and project execution local.

2. Open-source foundation
- Core dependencies and runtime path must be based on open technologies.
- Eclipse Theia Desktop is the target desktop IDE substrate.
- Ollama is the default local model runtime.
- MLX is a planned Apple Silicon runtime option.
- OpenClaw is optional and must remain an adapter, not the core.

3. Deterministic installation
- A macOS operator must be able to clone, bootstrap, and launch the product with predictable steps.
- The installed app bundle must be able to start the local stack or clearly explain the blocking dependency.

4. Multi-agent orchestration
- A single transcript must support multiple agents with explicit roles and handoffs.
- Agent role boundaries must be enforced at execution time.

5. Persistent project memory
- Memory must be scoped by project and thread lineage.
- Memory must support human annotation, retrieval, and bounded prompt packaging.

6. Auditability and safety
- Every task, handoff, tool execution, approval, and failure must be attributable.
- Dangerous execution must fail closed.

7. Public-repo quality
- Repository structure, docs, scripts, and naming must be coherent for outside contributors.

## Recommended Delivery Stack

The recommended delivery stack for `{sentinelsquad}` is:

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
- custom `{sentinelsquad}` orchestration, memory, approval, and tool-execution layers

This stack is the architectural recommendation regardless of the current implementation state.

## Current Reality

The current codebase has working foundations, but still mixes prototype traits with product traits.

Strengths already present:

- local app and worker flow exist
- macOS app bundle exists
- unified chat exists
- controller execution path works
- project sessions and thread events exist
- strict execution roles exist
- local auth bypass exists for desktop mode
- local runtime doctor exists
- dashboard shows local service and runtime status
- memory capture foundation exists

Current weaknesses:

- repo structure still reflects iterative migration
- dashboard and some surfaces still expose control-plane/prototype assumptions
- local-only mode is not yet the default mental model across the app
- model/runtime resolution is now functional but not yet centralized enough
- long-term memory is only a capture foundation, not a full product subsystem
- onboarding, validation, docs, and packaging still need stronger product boundaries
- Theia is not yet the primary shipped shell
- MLX and OpenClaw are not product-grade integrations yet

## System Boundaries

### What `{sentinelsquad}` owns

- agent identity
- role/readiness state
- unified chat threads
- task graph
- handoff routing
- approvals
- tool policy
- audit trail
- project sessions
- long-term memory
- runtime selection policy

### What external runtimes own

- token generation
- embedding generation
- optional tool/plugin execution adapters

### What GitHub owns

- source hosting
- pull requests
- code review collaboration

GitHub board integration is optional. It must never be a required dependency for local product operation.

## Repository Target State

The repository should converge to this shape:

```text
.
├── apps/
│   └── sentinelsquad/
│       ├── src/
│       │   ├── app/
│       │   ├── components/
│       │   ├── lib/
│       │   │   ├── agents/
│       │   │   ├── memory/
│       │   │   ├── orchestration/
│       │   │   ├── runtime/
│       │   │   ├── sessions/
│       │   │   ├── tools/
│       │   │   └── telemetry/
│       ├── prisma/
│       └── scripts/
├── docs/
│   ├── architecture/
│   ├── operators/
│   ├── contributors/
│   └── product/
├── tools/
│   ├── macos/
│   └── theia-desktop/
├── scripts/
└── README.md
```

Refactor principle:

- move from mixed generic `lib/` sprawl to domain-owned modules
- separate runtime concerns from UI concerns
- separate product docs from contributor docs from operator docs

## Core Architecture

### 1. Desktop Shell

Foundation:

- Eclipse Theia Desktop
- native macOS app bundle
- local launcher/bootstrap scripts

Responsibility:

- workspace shell
- file tree/editor/terminal substrate
- native packaging
- lifecycle bridge to `{sentinelsquad}` local services

Must not own:

- orchestration truth
- thread history truth
- agent registry truth

### 2. Sentinel Core

Responsibility:

- threads
- messages
- events
- agent registry
- role policy
- task execution state
- handoff policy
- approvals
- audit

This layer is the product brain.

Implementation recommendation:

- TypeScript on Node.js
- one coherent product service boundary rather than premature microservices

### 3. Runtime Abstraction

Target providers:

- `ollama`
- `mlx`
- `openclaw` adapter
- optional future remote provider

Required interface:

- provider health
- available models
- model capability metadata
- chat completion
- embeddings
- request timeout
- provider-level error normalization

No agent code should talk directly to a provider-specific API without passing through this abstraction.

Current implementation note:

- Ollama-first execution is real
- shared local runtime resolution exists
- provider abstraction is not yet complete across all paths

### 4. Memory System

Memory must be split into four classes:

1. thread memory
- short-horizon recent context

2. project memory
- durable facts, architecture decisions, operating notes

3. agent memory
- role-specific instructions, preferences, and capability notes

4. evidence memory
- execution artifacts, summaries, outcomes, and linked files

Current implementation note:

- durable project memory capture exists
- annotation, review, promotion, and vector retrieval do not yet exist as shipped product workflows

Required capabilities:

- annotation by humans
- provenance on every memory record
- bounded retrieval
- explicit memory invalidation/archive
- memory summaries per project

Recommended storage:

- PostgreSQL for structured memory metadata
- `pgvector` for retrieval
- explicit human annotations as first-class records, not just generated summaries

### 5. Tool and Execution Layer

Tools must remain:

- project-session aware
- workspace-bounded
- policy-gated
- auditable

Required tool families:

- filesystem
- shell
- git
- IDE/editor operations

### 6. Telemetry Layer

The product must expose:

- local runtime health
- queue depth
- task outcomes
- dead-letter counts
- provider latency
- memory retrieval metrics
- approval latency
- tool call outcomes

## Hardening Phases

## Phase A: Repository And Product Boundary Hardening

Goal:
- make the repo understandable, consistent, and public-ready

Must deliver:

- final naming cleanup across docs, UI, scripts, and comments
- repo information architecture cleanup
- root README for operators and contributors
- operator docs for macOS installation and runtime troubleshooting
- contributor docs for local development and architecture
- environment variable reference with required/optional/default fields

Acceptance criteria:

- a new contributor can identify the product entrypoint in under 2 minutes
- no essential startup knowledge remains hidden in launcher scripts alone
- docs do not depend on legacy naming or internal history

## Phase B: Local Runtime Stability

Goal:
- make the app reliably launchable on macOS with no hidden manual fixes

Must deliver:

- deterministic local bootstrap
- DB readiness check and recovery path
- Ollama readiness check and model resolution
- managed app/worker lifecycle
- stable health probes for app, worker, DB, and provider
- local-only dashboard mode by default

Acceptance criteria:

- app bundle launch succeeds or shows an actionable blocking reason
- no page should fail because GitHub integration is absent
- controller task path works from a fresh local bootstrap

## Phase C: Unified Multi-Agent Execution

Goal:
- make the unified transcript the real operational center

Must deliver:

- controller/drafter/writer execution chain
- role-gated tool access
- reliable task enqueue/ack/done/failure states
- clean transcript presentation
- operator commands for status and diagnostics
- handoff visibility in transcript

Acceptance criteria:

- a user can request multi-agent work from one thread
- the transcript shows clear actor-attributed progress
- stale system noise does not dominate the operational view

## Phase D: Runtime Provider Interoperability

Goal:
- make multiple open-source LLM runtimes first-class

Must deliver:

- runtime provider abstraction module
- per-provider model discovery
- per-provider capability metadata
- routing policies by agent role
- provider fallback rules
- provider diagnostics UI

Acceptance criteria:

- operators can switch an agent between Ollama and MLX
- runtime failures surface as normalized product errors
- provider choice is visible and auditable

## Phase E: Long-Term Memory

Goal:
- move from partial retrieval to a real memory product

Must deliver:

- project memory schema
- memory annotation UI
- decision log / architecture note capture
- task outcome summarization into memory
- memory retrieval policy by task type
- archive and invalidation model

Acceptance criteria:

- each project has durable knowledge that survives chat history growth
- memory retrieval is bounded, attributable, and reviewable
- humans can annotate and correct memory

## Phase F: Theia Productization

Goal:
- make the desktop IDE shell feel like `{sentinelsquad}`, not a generic shell

Must deliver:

- first `{sentinelsquad}`-native Theia extension
- project-session bridge
- transcript/task/activity panel integration
- runtime health and agent registry panels
- branded command surfaces

Acceptance criteria:

- desktop shell reflects `{sentinelsquad}` concepts directly
- operator does not need to rely on the web app alone to understand runtime state

## Phase G: Open-Source Readiness

Goal:
- make the project sustainable as a serious open-source repository

Must deliver:

- installation guide tested on clean macOS machine
- issue templates
- PR template
- architecture ADR index
- release checklist
- versioning policy
- smoke test and CI baseline

Acceptance criteria:

- a new external contributor can install and run locally
- documentation and CI reflect the real product shape

## Required Refactors

The following refactors are mandatory, not optional:

1. `src/lib` domain split
- introduce subdomains for agents, runtime, memory, orchestration, tools, sessions, telemetry

2. provider abstraction extraction
- pull Ollama-specific logic out of worker implementation details

3. dashboard decoupling from GitHub board assumptions
- dashboard must remain useful in fully local operation

4. memory subsystem formalization
- convert ad hoc retrieval into a dedicated memory domain

5. launcher/bootstrap simplification
- one predictable bootstrap path
- one predictable app-launch path

6. documentation segmentation
- operator docs
- contributor docs
- architecture docs
- product docs

## Installation Standard

macOS install must support two successful flows:

### Developer flow

- clone repo
- install dependencies
- start DB
- bootstrap env
- run app and worker

### Operator flow

- install app bundle
- bootstrap local stack automatically
- launch app

Required operator guarantees:

- no hidden auth dependency
- no GitHub dependency for core function
- no silent failure when a required service is down
- no required cloud runtime for first delivery

## Documentation Standard

Every critical subsystem must have:

- purpose
- inputs/outputs
- failure modes
- operator remediation
- developer entrypoints

Minimum required docs:

- installation on macOS
- runtime providers
- memory model
- agent roles
- transcript/task lifecycle
- troubleshooting guide
- release process

## Definition Of Done For “Rock-Solid”

`{sentinelsquad}` is considered rock-solid only when all of the following are true:

- local install works from documented steps
- desktop app launches predictably on macOS
- unified chat can run a controller-led multi-agent task end to end
- GitHub is optional for operation
- providers are abstracted and replaceable
- project memory is durable and annotatable
- docs match actual code and actual launch behavior
- CI covers startup, build, and critical policy paths
- repo structure is understandable without tribal knowledge

## Execution Order

The dependency order is:

1. repository and docs hardening
2. local runtime stability
3. unified multi-agent execution polish
4. provider abstraction
5. memory subsystem
6. Theia productization
7. open-source readiness and release discipline

## Immediate Next Slice

The next concrete implementation slice is:

1. finish local-only dashboard and operator-shell cleanup
2. extract runtime provider resolution into a dedicated runtime domain
3. formalize project memory schema and annotation flow

These three slices are the shortest path to converting the current system from “working prototype” into “credible foundation”.
