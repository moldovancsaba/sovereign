# {sovereign}

`{sovereign}` is a **Governed Routing Brain** for deterministic, high-availability software delivery, evolved under the **Gemini Initiative**.

This is the absolute **Single Source of Truth (SSOT)** for the Sovereign platform v1.2.0-brain. It is a local-first, deterministic operating system where AI agents execute bounded work through a strictly governed Python Directed Acyclic Graph (DAG) and build durable project memory.

## {sovereign} v1.2.0-brain (Gemini Initiative)

The current architecture represents a finalized transition into a unified, deterministic engine. Legacy JS workers and the experimental "Trinity" API have been surgically purged to eliminate architectural ambiguity.

### Key Pillars

- **The External Vanguard (Discord)**: Asynchronous intent ingestion from external channels.
- **The Nexus Bridge**: A persistent Python watcher (managed by macOS `launchd`) that routes tasks from the database into the execution engine.
- **The Governed DAG Engine**: A 5-node deterministic pipeline:
  1. **Intent Router**: Identifies and classifies incoming intents.
  2. **Context Builder**: Constructs hyper-local context using `pgvector`.
  3. **Generator**: Produces raw artifacts using MLX/Ollama or high-performance global LLMs.
  4. **Evaluator**: Enforces a "Catastrophic Floor" and performs weighted scoring.
  5. **Dispatcher**: Handles the final egress to Discord or the local filesystem.

## Persistence: The Immortality Protocol

`{sovereign}` is designed for 24/7 availability on macOS via native `launchd` agents:

- **Nexus Bridge Sentinel**: `com.sovereign.nexus-bridge`
- **Discord Vanguard Sentinel**: `com.sovereign.vanguard`
- **Menubar Guardian**: `com.sovereign.menubar` (High-visibility status icon)

These services are self-healing: they stay alive across system reboots and automatically restart if frozen or crashed.

## Deployment Status

**LIVE Features:**
- **Control Room Console**: Radical, high-density dashboard for real-time task monitoring.
- **Human-in-the-Loop**: Strict governance boundaries (R3/R4) require explicit approval via the Control Room or `/api/sovereign/approve`.
- **Surgical Purity**: The codebase has been purged of all legacy "Trinity" and "Hybrid Orchestrator" fragments.

## Quick Start (Operator Console)

1. **Start the Infrastructure**:
   ```bash
   npm run db:up
   ```

2. **Launch the Control Room**:
   ```bash
   npm run dev
   ```

3. **Verify Persistent Sentinels**:
   Check the macOS Menubar for the Sovereign Guardian (`bolt.shield.fill`). If missing, start manually:
   ```bash
   # Nexus Bridge
   npm run nexus:bridge
   # Discord Vanguard
   npm run vanguard:run
   ```

## Repository Structure

```text
.
├── apps/
│   └── sovereign/
│       ├── src/               # Control Room & Ingestion API (Next.js)
│       ├── prisma/            # Sovereign Schema (v1.2.0-brain)
│       └── scripts/
│           ├── sovereign_dag/ # Core Python DAG Engine
│           └── discord_vanguard.py # External I/O Sentinel
├── docs/                      # Joint Initiative Documentation
│   └── archive_legacy/        # Decommissioned Trinity/Orchestrate fragments
└── docker-compose.yml         # Optimized Postgres + pgvector
```

## Principles

- **Local-First, Governed-Always**: Compute is local; governance is absolute.
- **Deterministic over Stochastic**: LLMs are bounded by mathematical DAG nodes.
- **Persistent Sentinels**: 24/7 availability via the Immortality Protocol.
- **Durable Memory**: Exponential time-decayed retrieval via `pgvector`.

---
*Developed under the {sovereign} + Gemini Strategic Initiative.*
