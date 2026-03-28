# Last Open Points (closed 2026-03-19)

This file records the final clarifications and decisions that closed the architecture and product-owner experience design.

## 1. OpenClaw

- **Decision:** Optional adapter only. Do not deep-integrate (no adoption of OpenClaw’s agent loop or memory). Use as an optional tool/skill gateway when `OPENCLAW_AUTOSTART=1`.
- **Status:** Closed.

## 2.1 Theia upstream and future-proof

- **Question:** When we fork/build on Theia, can we get upstream benefits (security, new features)?
- **Answer:** Yes. Best approach: **compose your app** with Theia npm packages (do not fork the repo); add your features as Theia extensions; upgrade by bumping `@theia/*` versions. For hotfixes before a release, use cherry-pick + local package resolutions (see [theia-upstream-and-future-proof.md](architecture/theia-upstream-and-future-proof.md)).
- **Status:** Closed.

## 2.2 / 2.3 Desktop and PO surface

- **Decision:** Both extra miles: Theia-native panels (chat, backlog, runtime, memory) and first-class PO surface in Next.js and later in Theia.
- **Status:** Closed.

## 2.4 Local backlog (no GitHub)

- **Decision:** Fully local backlog in PostgreSQL; no GitHub dependency; works offline. Fill-the-gap steps implemented: Prisma schema (`BacklogBoard`, `BacklogGoal`, `BacklogItem`, `POFeedback`), migration, Backlog API (`/api/backlog/boards`, `/api/backlog/items`, `/api/backlog/goals`, `/api/backlog/feedback`), default board on first use.
- **Remaining:** Kanban UI (read-only), worker/MCP tools so agents can call the API.
- **Status:** Closed (design and API done; UI and agent wiring in backlog).

## 2.5 MCP

- **Decision:** Standardize tool bridge on MCP; add MCP servers (backlog, memory, workspace, etc.); worker uses MCP client. Extra mile agreed.
- **Status:** Closed.

## 2.6 Documentation and memory

- **Decision:** Wiki (BookStack or Outline) + structured .md + OpenAPI; expose as MCP resources; extend memory model (types, provenance, PO); ingest key docs into memory; retrieval via pgvector. Concrete steps in ADR 0003 and prior architecture summary.
- **Status:** Closed.

## 3. Self-improvement (agents improve the system)

- **Decision:** Extra mile: scope policy, proposed-change pipeline, PO approval, rollback, tests, audit, one policy doc.
- **Status:** Closed.

## 4. Talk as PO / scrum master agent

- **Decision:** Best-in-class: PO **talks to an agent** (e.g. scrum master) who **manages everything** from conversation (add/change/delete/prioritize backlog). PO uses the **kanban board to read, learn, and see status**; all **modifications** go through chat with the agent so it stays professional and consistent.
- **Status:** Closed.

## 5. Summary subpoints

- All prior summary subpoints (local-first, PostgreSQL, Theia, PO layer, memory, self-improvement boundary, MCP) agreed.
- **Status:** Closed.

---

No open architecture or product-owner experience points remain from this round. Implementation backlog: Kanban UI, MCP backlog server, scrum-master agent wiring to Backlog API, wiki + memory extension, self-improvement policy doc.
