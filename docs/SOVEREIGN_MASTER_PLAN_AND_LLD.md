# {sovereign} Master Plan and Low-Level Design (LLD)

**Version:** 1.0  
**Companion:** [SOVEREIGN_AGENT_TEAM_CONTRACT.md](SOVEREIGN_AGENT_TEAM_CONTRACT.md) (unbreakable without consensus)

This document is the **single plan** for what to do, when, what to keep, and where to change. It is broken into **deliverable issues** with test cases, edge cases, and dependencies so you can create or update issues in **mvp-factory-control**.

---

## Part A: Master Plan Overview

### What we keep (no change without contract consensus)

- Offline-first; human authority; auditability; fail-closed; one source of truth (PostgreSQL); PO talks to agent for backlog changes; project-scoped execution; explicit agent roles.  
- See [SOVEREIGN_AGENT_TEAM_CONTRACT.md](SOVEREIGN_AGENT_TEAM_CONTRACT.md) §3.

### What we do (high-level order)

1. **Rename** product to {sovereign} (brand + code/files/repo).
2. **Stabilise** local backlog + PO experience (Kanban UI, scrum-master agent wiring).
3. **Harden** transcript (final-judgement / JUDGE semantics, optional confidence).
4. **Extend** memory (PO/product types, pgvector, wiki ingestion).
5. **Standardise** tools (MCP server for backlog + docs/memory).
6. **Self-improvement** policy (scope, approval, rollback, audit).
7. **Theia** productisation (panels, shell).
8. **Provider** abstraction (Ollama + MLX, OpenClaw adapter).
9. **Later:** agent expansion, discovery, compliance labelling.

### Where change is allowed

- Implementation details inside invariants and this LLD; new features/phases go through contract change and get added here.

---

## Part B: Issue Quality Standard (for mvp-factory-control)

Every deliverable issue must include:

- **Objective** (1–2 lines)
- **Product surface** (which layer: desktop, chat, orchestration, runtime, tool bridge, backlog, memory, docs, packaging)
- **Current behaviour** vs **target behaviour**
- **Dependencies** (other issue IDs or “none”)
- **Constraints** (local-first, macOS, no breaking contract invariants)
- **Non-goals**
- **Acceptance criteria** (verifiable)
- **Test cases** (happy path + listed below)
- **Edge cases** (failure, offline, invalid input)
- **Validation commands** (e.g. `npm run verify`, manual steps)
- **Target repo** (this repo unless stated) and **implementation surfaces** (paths, APIs)

---

## Part C: Deliverable Issues (LLD)

Each block below is a **single deliverable issue**. Copy to mvp-factory-control and fill the issue body from the sections. **Depends:** lists issue IDs (or “—”) that must be done first.

---

### Issue LLD-001: Product rename sentinelsquad → {sovereign}

| Field | Content |
|-------|--------|
| **Objective** | Adopt {sovereign} as the product brand and “sovereign” in code, file names, and repo where `{}` is not usable; update all references and docs without changing behaviour. |
| **Product surface** | All: docs, app name, env vars, code strings, folder names, workflow/labels, launcher, macOS app bundle. |
| **Current behaviour** | Product and repo use “sentinelsquad” / “SentinelSquad” / “SENTINELSQUAD” and `{sentinelsquad}`. |
| **Target behaviour** | Brand is {sovereign}; identifiers use `sovereign`; docs and UI say {sovereign}; app bundle and launcher names updated; no remaining sentinelsquad in user-facing or repo-critical paths. |
| **Dependencies** | — |
| **Constraints** | No behaviour change; local-first and contract invariants unchanged; GitHub repo rename is a separate step (owner action). |
| **Non-goals** | Changing architecture; renaming external boards (mvp-factory-control) label text is optional/follow-up. |
| **Acceptance criteria** | (1) Grep for sentinelsquad/SentinelSquad/SENTINELSQUAD yields only historical/optional references or is documented as deferred. (2) README, READMEDEV, HANDOVER, CONTRIBUTING, and ADRs use {sovereign} / sovereign. (3) App title and launcher show sovereign. (4) Env vars and config keys documented; default app name is sovereign. |
| **Test cases** | TC1: Build and start app; UI and window title show new name. TC2: `npm run verify` passes. TC3: Docs render and internal links work. |
| **Edge cases** | EC1: Scripts that reference “sentinelsquad” in paths (e.g. .sentinelsquad dir) — decide rename or keep for compatibility; document. EC2: Existing DB and migrations — no schema rename required; app name only. EC3: Third-party references (e.g. OpenClaw docs) — leave as-is. |
| **Validation** | `npm run verify`; manual: open app, check title; grep -ri sentinelsquad apps docs tools scripts (exclude node_modules, .git). |
| **Target repo** | This repo. **Implementation surfaces:** See [RENAME_TO_SOVEREIGN.md](RENAME_TO_SOVEREIGN.md). |

---

### Issue LLD-002: Kanban UI (read-only) for local backlog

| Field | Content |
|-------|--------|
| **Objective** | Add a Kanban board UI that displays BacklogBoard/BacklogItem/BacklogGoal from the local Backlog API; PO can view, filter, open item detail; no create/update/delete from UI (conversation with agent only). |
| **Product surface** | App UI (Next.js page or panel); backlog. |
| **Current behaviour** | Backlog API exists; no board UI. |
| **Target behaviour** | New route (e.g. /backlog or /board) shows boards; default board shows columns by BacklogItemStatus; items clickable for detail (title, description, acceptance criteria, feedback history); filter by goal or status; read-only. |
| **Dependencies** | LLD-001 (optional; can be done before rename). Backlog API and schema already exist. |
| **Constraints** | Local-first; no GitHub dependency; same auth as rest of app. |
| **Non-goals** | Drag-and-drop reorder; creating/editing items from UI. |
| **Acceptance criteria** | (1) PO can open /backlog and see at least one board. (2) Columns reflect BacklogItemStatus. (3) Item detail shows acceptance criteria and PO feedback list. (4) No buttons/forms for create/edit/delete of items or goals. |
| **Test cases** | TC1: Load /backlog with empty board — empty columns. TC2: Add item via API, refresh — item appears in correct column. TC3: Add feedback via API, open item — feedback visible. |
| **Edge cases** | EC1: No default board — UI shows “Create board” or redirect to create default (reuse getOrCreateDefaultBoard). EC2: Very long list — pagination or virtualisation for items. EC3: Session expired — redirect to sign-in like rest of app. |
| **Validation** | Manual: open /backlog; add item via curl/API; verify display. |
| **Target repo** | This repo. **Implementation surfaces:** `apps/sovereign/src/app/backlog/` (or `board/`), components for board/column/card/detail. |

---

### Issue LLD-003: Worker/MCP backlog tools and scrum-master flow

| Field | Content |
|-------|--------|
| **Objective** | Worker (or MCP client) can call Backlog API so that the scrum-master (or Controller) agent can create, update, delete, and prioritise backlog items from chat; PO instructions in natural language are interpreted and applied via API. |
| **Product surface** | Orchestration, tool bridge, backlog, chat. |
| **Current behaviour** | Backlog API exists; worker has no backlog tools. |
| **Target behaviour** | Agent receives PO requests (e.g. “add story: …”, “move X to In Progress”); agent calls internal Backlog API or MCP backlog tools; transcript shows confirmation; no direct DB access from worker. |
| **Dependencies** | Backlog API (done). LLD-002 optional (UI can follow). |
| **Constraints** | All mutations via Backlog API; fail-closed on auth/validation errors. |
| **Non-goals** | Full NLU for every possible phrase; only a defined set of intents (add item, update status, add feedback, list items, delete item). |
| **Acceptance criteria** | (1) In chat, PO says “Add a backlog item: Implement login”; agent creates item and replies with id/title. (2) “Move item X to In Progress” updates status. (3) “Reject item X because …” adds PO feedback REJECTED. (4) All actions visible in transcript and in backlog API state. |
| **Test cases** | TC1: Send “add backlog item: Test” in chat; verify item in GET /api/backlog/items. TC2: “Move item <id> to IN_PROGRESS”; verify PATCH. TC3: Invalid id — agent reports error, no 500. |
| **Edge cases** | EC1: Ambiguous reference (“move the login story”) — agent may ask for clarification or use latest match. EC2: API down — agent reports failure. EC3: Unauthorised — 401 handled, agent says “not authorised”. |
| **Validation** | Manual chat with agent; curl to Backlog API to verify state. |
| **Target repo** | This repo. **Implementation surfaces:** Worker tool registration (backlog_create_item, backlog_update_item, backlog_list_items, backlog_add_feedback); or MCP server for backlog (see LLD-005). |

**Implementation note (as built):** The worker uses **dot-prefix** tool names: `backlog.list_boards`, `backlog.list_items`, `backlog.get_item`, `backlog.create_item`, `backlog.update_item`, `backlog.add_feedback`. The MCP server (LLD-005) may use underscore names for MCP spec compliance; document the chosen convention when implemented.

---

### Issue LLD-004: Final-judgement / JUDGE semantics in transcript

| Field | Content |
|-------|--------|
| **Objective** | Introduce explicit “final judgement” step in the transcript: a designated step (JUDGE or Controller) that produces Approve / Reject / Escalate with optional confidence score before work is considered done or escalated to PO. |
| **Product surface** | Orchestration, chat/transcript, task lifecycle. |
| **Current behaviour** | Tasks run to DONE/FAILED; final-judgement semantics are partially implemented or informal. |
| **Target behaviour** | After execution, a judgement step runs: vote (Approve | Reject | Escalate), optional confidence (0–1), and reason; stored on task or event; if Escalate or low confidence, PO is prompted; transcript shows judgement. |
| **Dependencies** | Existing task/event model. |
| **Constraints** | Human authority: Escalate and Reject paths require PO visibility; no auto-approve of critical actions without policy. |
| **Non-goals** | Full triage pipeline (DRAFTER → WRITER → JUDGE) as separate agents in this issue; single “judgement” gate is enough for now. |
| **Acceptance criteria** | (1) Task completion can be followed by a judgement record (vote, confidence, reason). (2) Escalate sets task or thread state so PO sees it. (3) Transcript shows “Judgement: Approved” or “Escalated: …”. |
| **Test cases** | TC1: Complete task; trigger judgement Approve; verify event and transcript. TC2: Judgement Escalate; verify PO-visible state. TC3: No judgement (legacy path) — task still completes without breaking. |
| **Edge cases** | EC1: Judgement step fails — task remains in recoverable state. EC2: Multiple judgements — last or first wins; document policy. |
| **Validation** | Run a task to completion with judgement enabled; inspect DB and transcript. |
| **Target repo** | This repo. **Implementation surfaces:** Task schema or ChatEvent kind (e.g. JUDGEMENT); worker judgement gate; transcript rendering. |

---

### Issue LLD-005: MCP server for backlog

| Field | Content |
|-------|--------|
| **Objective** | Expose backlog operations as an MCP server so any MCP client (worker, future tools) can list/create/update backlog items and add feedback via the standard MCP protocol. |
| **Product surface** | Tool bridge, backlog, MCP. |
| **Current behaviour** | Backlog API is REST only. |
| **Target behaviour** | MCP server (stdio or SSE) with tools e.g. backlog_list_boards, backlog_list_items, backlog_create_item, backlog_update_item, backlog_add_feedback; server calls Backlog API or same Prisma layer. |
| **Dependencies** | Backlog API. LLD-003 can use this server or call API directly; either way this issue delivers MCP contract. |
| **Constraints** | Local-only; same auth/authorisation as Backlog API. |
| **Non-goals** | MCP for memory or docs in this issue (separate). |
| **Acceptance criteria** | (1) MCP client can list items and create item via MCP tools. (2) Tool schemas follow MCP spec. (3) Errors returned as MCP errors. |
| **Test cases** | TC1: Connect MCP client; call backlog_list_items; receive list. TC2: backlog_create_item with title; item appears in API. TC3: Invalid params — MCP error, no crash. |
| **Edge cases** | EC1: Backlog API unreachable — MCP server returns error. EC2: Auth — MCP server runs in app context or passes token; document. |
| **Validation** | Use MCP inspector or custom client to call tools. |
| **Target repo** | This repo. **Implementation surfaces:** New package or script (e.g. `apps/sovereign/scripts/mcp-backlog-server` or lib); MCP tool definitions. |

---

### Issue LLD-006: Memory model extension (PO/product types, provenance, pgvector)

| Field | Content |
|-------|--------|
| **Objective** | Extend project memory with explicit types (thread, project, agent, evidence, PO/product), provenance (source, agent_id, user_id), and pgvector-based retrieval; support PO/product memory for goals, decisions, and feedback. |
| **Product surface** | Memory, persistence, retrieval. |
| **Current behaviour** | ProjectMemory exists; status and tags; no vector retrieval; no PO/product type. |
| **Target behaviour** | Memory records have type (enum) and provenance fields; pgvector column and index for similarity search; retrieval API or MCP resource filtered by type/project; PO/product memories ingestible and retrievable. |
| **Dependencies** | Existing ProjectMemory schema; pgvector extension. |
| **Constraints** | Append-friendly; audit trail; local-only. |
| **Non-goals** | Full wiki ingestion in this issue (LLD-007). |
| **Acceptance criteria** | (1) New enum MemoryType (or extend existing); provenance on records. (2) pgvector migration; embed and store; similarity search returns ranked results. (3) PO feedback or goal summaries can be written as memory with type PO/product. |
| **Test cases** | TC1: Write memory with type and provenance; read back. TC2: Similarity search returns relevant records. TC3: Filter by type and project. |
| **Edge cases** | EC1: Embedding provider down — write without embedding or queue; document. EC2: Large corpus — limit retrieval size. |
| **Validation** | Unit tests for storage and retrieval; manual embedding run. |
| **Target repo** | This repo. **Implementation surfaces:** Prisma schema (memory type, provenance, embedding column); migration; memory service; retrieval API or MCP. |

---

### Issue LLD-007: Wiki/docs integration (BookStack or Outline + MCP resources)

| Field | Content |
|-------|--------|
| **Objective** | Deploy a self-hosted wiki (BookStack or Outline); expose key pages as MCP resources (e.g. doc://runbooks/…); optionally ingest selected pages into project memory with source link. |
| **Product surface** | Docs, memory, MCP. |
| **Current behaviour** | Only repo `/docs` and app docs; no wiki engine; no MCP doc resources. |
| **Target behaviour** | Wiki available at configured URL; MCP server exposes resources from wiki API; agents can read docs via MCP; optional job to ingest wiki → project memory. |
| **Dependencies** | LLD-006 (memory extension) for ingestion. MCP contract. |
| **Constraints** | Self-hosted; no cloud wiki dependency. |
| **Non-goals** | Editing wiki from agent in this issue; only read. |
| **Acceptance criteria** | (1) Wiki is deployable (Docker or doc). (2) MCP client can read at least one resource (e.g. doc://runbooks/getting-started). (3) Optional: ingestion job writes to memory with source URL. |
| **Test cases** | TC1: Fetch MCP resource; content matches wiki page. TC2: Ingestion (if implemented) creates memory record with link. |
| **Edge cases** | EC1: Wiki down — MCP returns error. EC2: Large page — truncate or chunk. |
| **Validation** | Manual MCP read; optional ingestion run. |
| **Target repo** | This repo (or separate ops repo). **Implementation surfaces:** MCP server for docs; wiki deploy doc; optional ingest script. |

**Implementation note (2026-03):** `npm run mcp:docs` — repo URIs plus **BookStack** or **Outline** (`SOVEREIGN_WIKI_TYPE`, see `.env.example`). BookStack: `doc://wiki/bookstack/page/{id}`; Outline: `doc://wiki/outline/doc/{uuid}` (`documents.list` / `documents.info`). **Ingest:** `wiki:ingest-page`, **`wiki:ingest-batch`** (dedupe by `sourceUrl`). `docker-compose.wiki.yml` + `docs/setup/WIKI_SELF_HOSTED.md`. PO sign-off: [#443](https://github.com/moldovancsaba/mvp-factory-control/issues/443).

---

### Issue LLD-008: Self-improvement policy (scope, approval, rollback, audit)

| Field | Content |
|-------|--------|
| **Objective** | Document and enforce the self-improvement policy: what agents may change (paths, file types), that changes go through proposed branch/PR or change request, PO approval required, rollback procedure, and audit log. |
| **Product surface** | Orchestration, tool policy, docs. |
| **Current behaviour** | No formal policy; agents may have broad tool access. |
| **Target behaviour** | Policy doc (e.g. SELF_IMPROVEMENT_POLICY.md) defines scope, approval flow, rollback; tool layer or agent instructions enforce “propose only” for listed paths; audit log for proposals and approvals. |
| **Dependencies** | Existing tool bridge and task/event model. |
| **Constraints** | Fail-closed; no silent self-modification of policy or critical paths. |
| **Non-goals** | Full automated rollback in this issue; document Git revert steps. |
| **Acceptance criteria** | (1) Policy doc exists and is linked from contract/ADR. (2) Agents cannot directly write to listed “approval-required” paths without going through proposal. (3) Proposals and outcomes logged. |
| **Test cases** | TC1: Agent attempts write to protected path — blocked or proposed. TC2: Proposal created and visible to PO. TC3: Audit log contains proposal and decision. |
| **Edge cases** | EC1: Partial apply — rollback doc covers it. EC2: Policy change — requires contract change process. |
| **Validation** | Read policy doc; run test that triggers proposal path. |
| **Target repo** | This repo. **Implementation surfaces:** `docs/SELF_IMPROVEMENT_POLICY.md`; tool policy or approval gate; audit table or events. |

---

### Issue LLD-009: Theia panels (chat, backlog, runtime, memory)

| Field | Content |
|-------|--------|
| **Objective** | Implement Theia-native panels for unified chat, backlog (read-only), runtime health, and memory/decisions so the Theia shell feels like {sovereign} and operators can use the desktop shell without the web app for core flows. |
| **Product surface** | Desktop shell, Theia. |
| **Current behaviour** | Next.js app is primary UI; Theia bootstrap exists but not primary. |
| **Target behaviour** | Theia extension(s) provide panels that consume the same APIs (chat, backlog, runtime, memory); same data as web app. |
| **Dependencies** | Theia shell bootstrap; Backlog API, chat, runtime and memory APIs. |
| **Constraints** | Local-first; same auth model. |
| **Non-goals** | Migrating all Next.js pages to Theia in this issue; only panels. |
| **Acceptance criteria** | (1) Open Theia; panels visible for chat, backlog, runtime. (2) Backlog panel shows same data as /backlog. (3) Chat panel can send/receive messages. |
| **Test cases** | TC1: Launch Theia; open each panel. TC2: Add item via API; backlog panel updates (or on refresh). |
| **Edge cases** | EC1: API unreachable — panel shows error. EC2: Session — same login/bypass as web. |
| **Validation** | Manual Theia run; compare with web app. |
| **Target repo** | This repo. **Implementation surfaces:** `tools/theia-desktop` or app-specific Theia extensions; panel widgets. |

---

### Issue LLD-010: Provider abstraction (Ollama + MLX, OpenClaw adapter)

| Field | Content |
|-------|--------|
| **Objective** | Centralise all model usage behind a single provider abstraction; support Ollama (primary), MLX (optional), and OpenClaw as optional adapter; health, model list, completion, embeddings from abstraction only. |
| **Product surface** | Runtime, worker, config. |
| **Current behaviour** | Ollama-first is real; some paths may still call Ollama directly; MLX and OpenClaw not first-class. |
| **Target behaviour** | One provider interface; agent code never calls Ollama/MLX/OpenClaw directly; config selects provider per agent or global; health and model discovery via abstraction. |
| **Dependencies** | Existing runtime and worker. |
| **Constraints** | Local-first; no cloud required. |
| **Non-goals** | Cloud providers in this issue. |
| **Acceptance criteria** | (1) Worker uses only provider abstraction for completion/embeddings. (2) MLX selectable and working on Apple Silicon. (3) OpenClaw optional adapter; when enabled, tools available via adapter. |
| **Test cases** | TC1: Ollama only — task runs. TC2: Switch to MLX (if available) — task runs. TC3: Provider down — clear error, no crash. |
| **Edge cases** | EC1: Both Ollama and MLX down — graceful degradation. EC2: Model not found — fallback or clear message. |
| **Validation** | `npm run worker`; run task with each provider config. |
| **Target repo** | This repo. **Implementation surfaces:** `apps/sovereign/src/lib/runtime/` or equivalent; provider interface; Ollama/MLX/OpenClaw implementations. |

---

## Part D: Dependency Graph (for ordering)

```
LLD-001 (rename)  — no deps
LLD-002 (Kanban UI) — 001 optional
LLD-003 (scrum-master backlog) — Backlog API (done)
LLD-004 (JUDGE) — task/event model (done)
LLD-005 (MCP backlog) — Backlog API (done)
LLD-006 (memory extension) — existing memory (done)
LLD-007 (wiki + MCP docs) — LLD-006 optional
LLD-008 (self-improvement policy) — tool bridge (done)
LLD-009 (Theia panels) — Backlog API, chat, runtime (done)
LLD-010 (provider abstraction) — runtime (done)
```

Suggested implementation order for first slice: **001 → 002 → 003** (rename, then Kanban, then scrum-master flow). Then 004, 005, 006 in parallel where possible; 007 after 006; 008, 009, 010 as capacity allows.

---

## Part E: Mapping to mvp-factory-control

- Create **new issues** in mvp-factory-control for each LLD-00x with the same **Objective** and paste the table (or link this doc) into the issue body.
- Use **labels** e.g. `{sovereign}` (or new brand label), `P0`/`P1`/`P2` as you do today.
- Set **Dependencies** in the issue description and, if your board supports it, as issue links.
- **Test cases** and **edge cases** can live in the issue body or in a linked checklist; reference this LLD for the full set.

---

## Part F: SSOT for the project board

The **single source of truth** for what is on the project board (canonical issue set, order, and mapping to mvp-factory-control) is:

- **[SOVEREIGN_PROJECT_BOARD_SSOT.md](SOVEREIGN_PROJECT_BOARD_SSOT.md)**

Use that document to:

- See the canonical list of deliverables (LLD-001 … LLD-010) and suggested phases.
- Create or update issues on the board with the correct objectives and dependencies.
- Track delivery via the checklist (issue(s) on board, done).

When the plan or contract changes, the SSOT and this Master Plan are updated together; the project board is then updated to match.

---

*Document owner: Product Owner. Aligned with SOVEREIGN_AGENT_TEAM_CONTRACT.md. Updates to this plan that affect scope or invariants require contract change process.*
