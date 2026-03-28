# Architecture overview — `{sovereign}` repository

This document gives a **single map** of how the repository is structured and how layers relate. It follows the same **clarity and boundary** ideas as [agent.meimei `architecture.md`](https://github.com/moldovancsaba/agent.meimei/blob/main/architecture.md): behaviour should be explainable in docs and traceable in code.

Detailed decisions live in **ADRs** under [`docs/architecture/`](architecture/); this file is the orientation layer.

## System overview

`{sovereign}` is a **local-first** operator product for multi-agent software work:

- a **Next.js** operator UI (`apps/sovereign`)
- a **Nexus Bridge** and **Governed DAG Engine** (Python scripts in `scripts/sovereign_dag/`)
- **PostgreSQL** + **Prisma** as durable source of truth
- **Discord Vanguard** as the external I/O bridge
- optional **macOS** native shell and installers under `tools/macos/`

GitHub is for collaboration; it is **not** a runtime dependency for the default local path.

## Architectural boundaries

### Operator / product boundary

Humans use the web UI (and optional desktop wrapper) to steer agents, inspect runtime health, and manage sessions. Product copy and layout follow [UI_UX_STANDARDS.md](UI_UX_STANDARDS.md) and [DESIGN_SYSTEM_V1.md](DESIGN_SYSTEM_V1.md).

### Runtime execution boundary

The **worker**, **chat/API routes**, and **tool execution** run with explicit policy (roles, project session, strict orchestration). They must not duplicate business rules in undocumented parallel paths.

### Evidence boundary

Meaningful behaviour should be **verifiable**: migrations, e2e scripts, and docs ([HANDOVER.md](../HANDOVER.md), setup runbooks) should reflect what `main` actually does.

## Layer model

### 1) Governance and planning

Operating rules, sequencing, and issue mapping:

- [SOVEREIGN_AGENT_TEAM_CONTRACT.md](SOVEREIGN_AGENT_TEAM_CONTRACT.md)
- [SOVEREIGN_MASTER_PLAN_AND_LLD.md](SOVEREIGN_MASTER_PLAN_AND_LLD.md)
- [SOVEREIGN_PROJECT_BOARD_SSOT.md](SOVEREIGN_PROJECT_BOARD_SSOT.md)
- [SOVEREIGN_DELIVERY_PLAYBOOK.md](SOVEREIGN_DELIVERY_PLAYBOOK.md)

### 2) Product runtime (UI + app server)

- **App:** `apps/sovereign` — Next.js App Router, API routes, RSC where used
- **Design SSOT:** [DESIGN_SYSTEM_V1.md](DESIGN_SYSTEM_V1.md) + [`apps/sovereign/src/app/globals.css`](../apps/sovereign/src/app/globals.css) (`:root` tokens + **`ds-*`** `@layer components`)
- **Shell:** [`Shell.tsx`](../apps/sovereign/src/components/Shell.tsx)

### 3) Worker, scripts, and integrations

- **Governed DAG Engine:** `apps/sovereign/scripts/sovereign_dag/` (Python)
- **Nexus Bridge:** `apps/sovereign/scripts/sovereign_dag/bridge.py`
- **External Vanguard:** `apps/sovereign/scripts/discord_vanguard.py`
- **MCP Server:** `apps/sovereign/scripts/sovereign_dag/mcp_server_py.py`
- **Local tooling:** repo-root `package.json` scripts, `docker-compose.yml`, launcher/bootstrap scripts

### 4) Data and migrations

- **Schema:** `apps/sovereign/prisma/`
- **Migrations** are the contract for durable shape; app code must align

### 5) Validation and quality gates

- **`npm run verify`** (typecheck, selected e2e, production build) — primary merge gate
- Additional e2e scripts under `apps/sovereign/scripts/e2e/`

### 6) Documentation and operator truth

- **Run and setup:** [SETUP.md](SETUP.md), [BUILD_AND_RUN.md](BUILD_AND_RUN.md), [README.md](../README.md)
- **Handover / release notes:** [HANDOVER.md](../HANDOVER.md)
- **Doc ↔ code snapshots:** e.g. [DOC_CODE_SYNC_2026-03-27.md](DOC_CODE_SYNC_2026-03-27.md) when used

## Design principles (aligned with reference architecture)

- **Document first, enforce in code:** critical operator paths and UI contracts live in markdown; gates (`verify`, e2e) back important behaviour.
- **Single source per concern:** tokens in `globals.css`; shell in `Shell.tsx`; board mapping in SSOT — avoid shadow copies.
- **Deterministic local operations:** bootstrap, migrations, and documented ports reduce “works on my machine” drift.
- **Traceable change:** large batches get a dated doc sync or handover entry.

## Runtime topology (local dev)

- **App:** `http://localhost:3007` (align with `NEXTAUTH_URL` — see [README.md](../README.md))
- **Postgres:** typically `localhost:34765` via Docker Compose (see [SETUP.md](SETUP.md))
- **macOS:** Sovereign.app wraps the same dev server pattern; see `tools/macos/SovereignDesktop/`

## Related reading

- [architecture/0001-theia-desktop-foundation.md](architecture/0001-theia-desktop-foundation.md) — target IDE shell direction
- [architecture/0002-rock-solid-open-source-hardening.md](architecture/0002-rock-solid-open-source-hardening.md) — hardening themes
- [UI_UX_STANDARDS.md](UI_UX_STANDARDS.md) — operator UX law
- [CODING_STANDARDS.md](CODING_STANDARDS.md) — engineering conventions

---

*External reference (layering style): [agent.meimei architecture.md](https://github.com/moldovancsaba/agent.meimei/blob/main/architecture.md).*
