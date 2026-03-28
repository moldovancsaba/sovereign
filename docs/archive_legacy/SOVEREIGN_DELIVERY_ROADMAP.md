# {sovereign} Delivery Roadmap

## Stage Labels

Use these labels consistently in all delivery artifacts:

- `Implemented now`
- `Partially implemented`
- `Target architecture`

## Product Direction

`{sovereign}` is a desktop-first AI agentic IDE and unified chat product.

The product is not a browser-first IDE. The intended foundation is:

- target desktop shell built on Eclipse Theia Desktop
- Electron as the desktop packaging path
- TypeScript and Node.js as the primary implementation language/runtime
- PostgreSQL as the primary source of truth
- Prisma for schema and migrations
- `pgvector` for long-term project memory retrieval
- `{sovereign}` as the source of truth for agents, threads, tasks, approvals, and memory
- local-first model execution with Ollama as the default provider
- MLX as an optional Apple Silicon provider
- OpenClaw as an optional tool/runtime adapter, not the product core

## Primary Product Goals

- one unified chat where multiple agents can collaborate in the same thread
- explicit roles and delegation between agents
- workspace-aware execution with auditability and approval gates
- lightweight local-first operation
- developer-grade IDE foundation with terminals, files, extensions, and project sessions

## Non-Goals For Phase 1

- browser-hosted IDE experience
- distributed multi-orchestrator control plane
- external messenger connectors
- fully autonomous external tool adoption without human approval
- cloud-only model routing as a dependency for local delivery

## Architectural Principles

1. `{sovereign}` owns orchestration.
2. Model runtimes are replaceable providers, not the product core.
3. Desktop IDE substrate and agent orchestration must be loosely coupled.
4. Every agent action that changes files, configuration, or routing must be auditable.
5. Product phases should move from execution foundations to optimization layers, not the reverse.

## Target Architecture

### Layer 1: Desktop Shell

- Eclipse Theia Desktop application
- workspace windows and session lifecycle
- panels for:
  - unified multi-agent chat
  - agents registry and readiness
  - task/activity timeline
  - approvals and policy events
  - runtime health

### Layer 2: `{sovereign}` Core

- thread/message/event model
- agent registry
- role and readiness model
- task graph and delegation graph
- approval and policy engine
- workspace/session registry
- audit log and evidence model
- implemented as a coherent TypeScript and Node.js product layer

### Layer 3: Runtime Manager

- provider abstraction for:
  - Ollama
  - MLX
  - OpenClaw adapter
- health checks, capability detection, routing metadata
- model/provider selection by agent role and policy
- provider contracts instead of provider-specific orchestration logic

### Layer 4: Tool and Workspace Execution

- workspace-bounded tool execution
- ephemeral workspace policy
- filesystem, git, terminal, and IDE actions
- tool-approval boundaries and policy enforcement
- project-scoped long-term memory annotation inputs

### Layer 5: Optimization and Growth

- benchmarking
- canary rollout
- cost-aware routing
- discovery and fit analysis
- auto-onboarding pipeline

## Delivery Phases

## Current Implementation Snapshot

Implemented now:

- local macOS wrapper and launch flow
- local app and managed worker
- unified multi-agent chat
- role-chain baseline and strict role gate
- project sessions
- thread/task/event timeline
- project-scoped tool execution
- runtime doctor and local service health
- durable project-memory capture foundation
- API v1 LLM-compatible runtime surface (`chat/completions`, `models`, `health`)
- API v1 provider matrix includes MLX adapter scaffold (`provider=mlx`) with stable timeout/error contract
- Trinity runtime with staged roles, confidence policy, and bounded retries
- persisted Trinity run artifacts + query endpoints
- workforce foundations: group registry, nested-member cycle guard, manual/auto staffing
- role ranking persistence + ranking-informed auto staffing baseline
- deterministic API workforce e2e gate for CI/local validation

Partially implemented:

- command-center transcript final-judgement semantics
- desktop-shell transition to Theia
- deeper provider abstraction beyond Ollama/OpenAI-compatible/mock/MLX-scaffold
- memory retrieval, annotation, and review
- advanced ranking calibration and adaptive staffing policy tuning

Target architecture:

- Theia-primary operator shell
- `pgvector` retrieval
- MLX first-class integration
- OpenClaw adapter integration

## Phase 0: Foundation Decisions And Desktop Skeleton

Goal:
- establish the product foundation so implementation can start without architectural drift

Must deliver:
- desktop foundation ADR based on Eclipse Theia Desktop
- local runtime strategy for Ollama, MLX, and OpenClaw adapter
- desktop shell bootstrap and packaging baseline
- workspace/session host model
- unified thread/task/event schema

Exit criteria:
- foundation ADR approved
- first desktop shell launches locally
- `{sovereign}` can create/open a local workspace session
- thread/event schema is defined and usable by later execution work

Status:

- partially implemented

## Phase 1: Usable Multi-Agent Core

Goal:
- achieve a working local `{sovereign}` that can run a controlled multi-agent workflow inside one command center

Must deliver:
- unified multi-agent transcript/chat surface
- role chain baseline for `@Controller`, `@Drafter`, `@Writer`
- strict role-violation gate
- tool bridge/execution gateway
- runtime bootstrap and provider health model
- capability registry
- compliance/safety gate
- ephemeral workspace lifecycle

Exit criteria:
- user can start desktop app locally
- user can open a workspace
- user can run a multi-agent task in one transcript
- transcript shows role-attributed steps and final decision
- execution is blocked correctly on policy violations

Status:

- implemented now for baseline launchability
- still missing final-judgement polish and broader operator review flow

## Phase 2: Controlled Agent Expansion

Goal:
- expand safely from the baseline squad to a broader local agent ecosystem

Must deliver:
- auto-onboarding pipeline for approved agents
- benchmark dataset governance
- benchmark harness and routing evidence
- canary rollout controls
- cost-aware routing policy

Exit criteria:
- new agents can be evaluated and onboarded through a controlled path
- routing changes are measurable and reversible
- operators can understand why an agent/model is selected

## Phase 3: Discovery And Intelligence Loop

Goal:
- make `{sovereign}` capable of discovering and evaluating new tools/models without losing governance

Must deliver:
- continuous tech-intelligence ingestion
- fit-analysis scoring queue
- operator review flow for adoption decisions

Exit criteria:
- discovery feed is structured and auditable
- prioritization queue is actionable
- nothing moves to pilot without explicit safety/compliance review

## Phase 4: Deferred And Advanced Capabilities

Goal:
- explore advanced topologies after the single-machine product is stable

Deferred items:
- external messenger connectors
- dynamic teaming/signaling beyond the current role model
- multi-orchestrator scoped control

## Prioritization Rules

- foundations before optimization
- execution before discovery
- local stability before autonomy
- desktop product integrity before marketplace/plugin breadth
- explicit LLD issues only; no vague roadmap placeholders in execution lanes

## Required Issue Quality Standard

Every `{sovereign}` delivery issue must include:

- objective
- context
- execution prompt
- scope / non-goals
- constraints
- dependencies
- acceptance checks
- delivery artifact
- validation commands where applicable
- target repo and expected implementation surfaces

Issues that do not meet this bar should remain roadmap items, not execution-ready cards.
