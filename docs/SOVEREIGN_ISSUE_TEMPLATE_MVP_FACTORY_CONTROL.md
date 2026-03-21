# {sovereign} — Ready-to-paste issue template for mvp-factory-control

**Use with:** [SOVEREIGN_PROJECT_BOARD_SSOT.md](SOVEREIGN_PROJECT_BOARD_SSOT.md) (canonical list) and [SOVEREIGN_MASTER_PLAN_AND_LLD.md](SOVEREIGN_MASTER_PLAN_AND_LLD.md) (full LLD).

Copy the **Issue title** and **Issue body** below for each LLD into a new issue in mvp-factory-control. Add labels (e.g. `{sovereign}`, `P0`/`P1`/`P2`) and set "Depends on" / issue links per SSOT §2.

---

## Generic template (if you need a new LLD later)

**Issue title:** `[LLD-XXX] One-line objective`

**Issue body:**

```markdown
## Objective
(1–2 lines.)

**SSOT:** [SOVEREIGN_PROJECT_BOARD_SSOT.md](link) | **Full LLD:** [SOVEREIGN_MASTER_PLAN_AND_LLD.md](link) Part C.

## Summary table

| Field | Content |
|-------|--------|
| **Product surface** | … |
| **Current behaviour** | … |
| **Target behaviour** | … |
| **Dependencies** | … |
| **Constraints** | … |
| **Non-goals** | … |
| **Acceptance criteria** | … |
| **Test cases** | … |
| **Edge cases** | … |
| **Validation** | … |
| **Target repo** | … **Implementation surfaces:** … |

## Depends on
- LLD-00x (optional/required)
```

---

## LLD-001: Product rename sentinelsquad → {sovereign}

**Issue title:** `[LLD-001] Product rename sentinelsquad → {sovereign}`

**Issue body:**

```markdown
## Objective
Adopt {sovereign} as the product brand and "sovereign" in code, file names, and repo where `{}` is not usable; update all references and docs without changing behaviour.

**SSOT:** [SOVEREIGN_PROJECT_BOARD_SSOT.md](SOVEREIGN_PROJECT_BOARD_SSOT.md) | **Full LLD:** [SOVEREIGN_MASTER_PLAN_AND_LLD.md](SOVEREIGN_MASTER_PLAN_AND_LLD.md) Part C.

## Summary table

| Field | Content |
|-------|--------|
| **Product surface** | All: docs, app name, env vars, code strings, folder names, workflow/labels, launcher, macOS app bundle. |
| **Current behaviour** | Product and repo use "sentinelsquad" / "SentinelSquad" / "SENTINELSQUAD" and `{sentinelsquad}`. |
| **Target behaviour** | Brand is {sovereign}; identifiers use `sovereign`; docs and UI say {sovereign}; app bundle and launcher names updated; no remaining sentinelsquad in user-facing or repo-critical paths. |
| **Dependencies** | — |
| **Constraints** | No behaviour change; local-first and contract invariants unchanged; GitHub repo rename is a separate step (owner action). |
| **Non-goals** | Changing architecture; renaming external boards (mvp-factory-control) label text is optional/follow-up. |
| **Acceptance criteria** | (1) Grep for sentinelsquad/SentinelSquad/SENTINELSQUAD yields only historical/optional references or is documented as deferred. (2) README, READMEDEV, HANDOVER, CONTRIBUTING, and ADRs use {sovereign} / sovereign. (3) App title and launcher show sovereign. (4) Env vars and config keys documented; default app name is sovereign. |
| **Test cases** | TC1: Build and start app; UI and window title show new name. TC2: `npm run verify` passes. TC3: Docs render and internal links work. |
| **Edge cases** | EC1: Scripts that reference "sentinelsquad" in paths (e.g. .sentinelsquad dir) — decide rename or keep for compatibility; document. EC2: Existing DB and migrations — no schema rename required; app name only. EC3: Third-party references (e.g. OpenClaw docs) — leave as-is. |
| **Validation** | `npm run verify`; manual: open app, check title; grep -ri sentinelsquad apps docs tools scripts (exclude node_modules, .git). |
| **Target repo** | sovereign repo. **Implementation surfaces:** See [RENAME_TO_SOVEREIGN.md](RENAME_TO_SOVEREIGN.md). |

## Depends on
- None
```

---

## LLD-002: Kanban UI (read-only) for local backlog

**Issue title:** `[LLD-002] Kanban UI (read-only) for local backlog`

**Issue body:**

```markdown
## Objective
Add a Kanban board UI that displays BacklogBoard/BacklogItem/BacklogGoal from the local Backlog API; PO can view, filter, open item detail; no create/update/delete from UI (conversation with agent only).

**SSOT:** [SOVEREIGN_PROJECT_BOARD_SSOT.md](SOVEREIGN_PROJECT_BOARD_SSOT.md) | **Full LLD:** [SOVEREIGN_MASTER_PLAN_AND_LLD.md](SOVEREIGN_MASTER_PLAN_AND_LLD.md) Part C.

## Summary table

| Field | Content |
|-------|--------|
| **Product surface** | App UI (Next.js page or panel); backlog. |
| **Current behaviour** | Backlog API exists; no board UI. |
| **Target behaviour** | New route (e.g. /backlog or /board) shows boards; default board shows columns by BacklogItemStatus; items clickable for detail (title, description, acceptance criteria, feedback history); filter by goal or status; read-only. |
| **Dependencies** | LLD-001 (optional). Backlog API and schema already exist. |
| **Constraints** | Local-first; no GitHub dependency; same auth as rest of app. |
| **Non-goals** | Drag-and-drop reorder; creating/editing items from UI. |
| **Acceptance criteria** | (1) PO can open /backlog and see at least one board. (2) Columns reflect BacklogItemStatus. (3) Item detail shows acceptance criteria and PO feedback list. (4) No buttons/forms for create/edit/delete of items or goals. |
| **Test cases** | TC1: Load /backlog with empty board — empty columns. TC2: Add item via API, refresh — item appears in correct column. TC3: Add feedback via API, open item — feedback visible. |
| **Edge cases** | EC1: No default board — UI shows "Create board" or redirect to create default (reuse getOrCreateDefaultBoard). EC2: Very long list — pagination or virtualisation for items. EC3: Session expired — redirect to sign-in like rest of app. |
| **Validation** | Manual: open /backlog; add item via curl/API; verify display. |
| **Target repo** | sovereign repo. **Implementation surfaces:** `apps/sovereign/src/app/backlog/` (or `board/`), components for board/column/card/detail. |

## Depends on
- LLD-001 (optional)
```

---

## LLD-003: Worker/MCP backlog tools and scrum-master flow

**Issue title:** `[LLD-003] Worker/MCP backlog tools and scrum-master flow`

**Issue body:**

```markdown
## Objective
Worker (or MCP client) can call Backlog API so that the scrum-master (or Controller) agent can create, update, delete, and prioritise backlog items from chat; PO instructions in natural language are interpreted and applied via API.

**SSOT:** [SOVEREIGN_PROJECT_BOARD_SSOT.md](SOVEREIGN_PROJECT_BOARD_SSOT.md) | **Full LLD:** [SOVEREIGN_MASTER_PLAN_AND_LLD.md](SOVEREIGN_MASTER_PLAN_AND_LLD.md) Part C.

## Summary table

| Field | Content |
|-------|--------|
| **Product surface** | Orchestration, tool bridge, backlog, chat. |
| **Current behaviour** | Backlog API exists; worker has no backlog tools. |
| **Target behaviour** | Agent receives PO requests (e.g. "add story: …", "move X to In Progress"); agent calls internal Backlog API or MCP backlog tools; transcript shows confirmation; no direct DB access from worker. |
| **Dependencies** | Backlog API (done). LLD-002 optional (UI can follow). |
| **Constraints** | All mutations via Backlog API; fail-closed on auth/validation errors. |
| **Non-goals** | Full NLU for every possible phrase; only a defined set of intents (add item, update status, add feedback, list items, delete item). |
| **Acceptance criteria** | (1) In chat, PO says "Add a backlog item: Implement login"; agent creates item and replies with id/title. (2) "Move item X to In Progress" updates status. (3) "Reject item X because …" adds PO feedback REJECTED. (4) All actions visible in transcript and in backlog API state. |
| **Test cases** | TC1: Send "add backlog item: Test" in chat; verify item in GET /api/backlog/items. TC2: "Move item <id> to IN_PROGRESS"; verify PATCH. TC3: Invalid id — agent reports error, no 500. |
| **Edge cases** | EC1: Ambiguous reference ("move the login story") — agent may ask for clarification or use latest match. EC2: API down — agent reports failure. EC3: Unauthorised — 401 handled, agent says "not authorised". |
| **Validation** | Manual chat with agent; curl to Backlog API to verify state. |
| **Target repo** | sovereign repo. **Implementation surfaces:** Worker tool registration — as built, worker uses dot-prefix tools: `backlog.list_boards`, `backlog.list_items`, `backlog.get_item`, `backlog.create_item`, `backlog.update_item`, `backlog.add_feedback`; or MCP server for backlog (see LLD-005). |

## Depends on
- Backlog API (done)
```

---

## LLD-004: Final-judgement / JUDGE semantics in transcript

**Issue title:** `[LLD-004] Final-judgement / JUDGE semantics in transcript`

**Issue body:**

```markdown
## Objective
Introduce explicit "final judgement" step in the transcript: a designated step (JUDGE or Controller) that produces Approve / Reject / Escalate with optional confidence score before work is considered done or escalated to PO.

**SSOT:** [SOVEREIGN_PROJECT_BOARD_SSOT.md](SOVEREIGN_PROJECT_BOARD_SSOT.md) | **Full LLD:** [SOVEREIGN_MASTER_PLAN_AND_LLD.md](SOVEREIGN_MASTER_PLAN_AND_LLD.md) Part C.

## Summary table

| Field | Content |
|-------|--------|
| **Product surface** | Orchestration, chat/transcript, task lifecycle. |
| **Current behaviour** | Tasks run to DONE/FAILED; final-judgement semantics are partially implemented or informal. |
| **Target behaviour** | After execution, a judgement step runs: vote (Approve | Reject | Escalate), optional confidence (0–1), and reason; stored on task or event; if Escalate or low confidence, PO is prompted; transcript shows judgement. |
| **Dependencies** | Existing task/event model. |
| **Constraints** | Human authority: Escalate and Reject paths require PO visibility; no auto-approve of critical actions without policy. |
| **Non-goals** | Full triage pipeline (DRAFTER → WRITER → JUDGE) as separate agents in this issue; single "judgement" gate is enough for now. |
| **Acceptance criteria** | (1) Task completion can be followed by a judgement record (vote, confidence, reason). (2) Escalate sets task or thread state so PO sees it. (3) Transcript shows "Judgement: Approved" or "Escalated: …". |
| **Test cases** | TC1: Complete task; trigger judgement Approve; verify event and transcript. TC2: Judgement Escalate; verify PO-visible state. TC3: No judgement (legacy path) — task still completes without breaking. |
| **Edge cases** | EC1: Judgement step fails — task remains in recoverable state. EC2: Multiple judgements — last or first wins; document policy. |
| **Validation** | Run a task to completion with judgement enabled; inspect DB and transcript. |
| **Target repo** | sovereign repo. **Implementation surfaces:** Task schema or ChatEvent kind (e.g. JUDGEMENT); worker judgement gate; transcript rendering. |

## Depends on
- None (existing task/event model)
```

---

## LLD-005: MCP server for backlog

**Issue title:** `[LLD-005] MCP server for backlog`

**Issue body:**

```markdown
## Objective
Expose backlog operations as an MCP server so any MCP client (worker, future tools) can list/create/update backlog items and add feedback via the standard MCP protocol.

**SSOT:** [SOVEREIGN_PROJECT_BOARD_SSOT.md](SOVEREIGN_PROJECT_BOARD_SSOT.md) | **Full LLD:** [SOVEREIGN_MASTER_PLAN_AND_LLD.md](SOVEREIGN_MASTER_PLAN_AND_LLD.md) Part C.

## Summary table

| Field | Content |
|-------|--------|
| **Product surface** | Tool bridge, backlog, MCP. |
| **Current behaviour** | Backlog API is REST only. |
| **Target behaviour** | MCP server (stdio or SSE) with tools e.g. backlog_list_boards, backlog_list_items, backlog_create_item, backlog_update_item, backlog_add_feedback; server calls Backlog API or same Prisma layer. |
| **Dependencies** | Backlog API. LLD-003 can use this server or call API directly. |
| **Constraints** | Local-only; same auth/authorisation as Backlog API. |
| **Non-goals** | MCP for memory or docs in this issue (separate). |
| **Acceptance criteria** | (1) MCP client can list items and create item via MCP tools. (2) Tool schemas follow MCP spec. (3) Errors returned as MCP errors. |
| **Test cases** | TC1: Connect MCP client; call backlog_list_items; receive list. TC2: backlog_create_item with title; item appears in API. TC3: Invalid params — MCP error, no crash. |
| **Edge cases** | EC1: Backlog API unreachable — MCP server returns error. EC2: Auth — MCP server runs in app context or passes token; document. |
| **Validation** | Use MCP inspector or custom client to call tools. |
| **Target repo** | sovereign repo. **Implementation surfaces:** e.g. `apps/sovereign/scripts/mcp-backlog-server` or lib; MCP tool definitions. |

## Depends on
- Backlog API (done)
```

---

## LLD-006: Memory model extension (PO/product types, provenance, pgvector)

**Issue title:** `[LLD-006] Memory model extension (PO/product types, provenance, pgvector)`

**Issue body:**

```markdown
## Objective
Extend project memory with explicit types (thread, project, agent, evidence, PO/product), provenance (source, agent_id, user_id), and pgvector-based retrieval; support PO/product memory for goals, decisions, and feedback.

**SSOT:** [SOVEREIGN_PROJECT_BOARD_SSOT.md](SOVEREIGN_PROJECT_BOARD_SSOT.md) | **Full LLD:** [SOVEREIGN_MASTER_PLAN_AND_LLD.md](SOVEREIGN_MASTER_PLAN_AND_LLD.md) Part C.

## Summary table

| Field | Content |
|-------|--------|
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
| **Target repo** | sovereign repo. **Implementation surfaces:** Prisma schema (memory type, provenance, embedding column); migration; memory service; retrieval API or MCP. |

## Depends on
- Existing memory (done)
```

---

## LLD-007: Wiki/docs integration (BookStack or Outline + MCP resources)

**Issue title:** `[LLD-007] Wiki/docs integration (BookStack or Outline + MCP resources)`

**Issue body:**

```markdown
## Objective
Deploy a self-hosted wiki (BookStack or Outline); expose key pages as MCP resources (e.g. doc://runbooks/…); optionally ingest selected pages into project memory with source link.

**SSOT:** [SOVEREIGN_PROJECT_BOARD_SSOT.md](SOVEREIGN_PROJECT_BOARD_SSOT.md) | **Full LLD:** [SOVEREIGN_MASTER_PLAN_AND_LLD.md](SOVEREIGN_MASTER_PLAN_AND_LLD.md) Part C.

## Summary table

| Field | Content |
|-------|--------|
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
| **Target repo** | sovereign repo (or separate ops repo). **Implementation surfaces:** MCP server for docs; wiki deploy doc; optional ingest script. |

## Depends on
- LLD-006 (optional, for ingestion)
```

---

## LLD-008: Self-improvement policy (scope, approval, rollback, audit)

**Issue title:** `[LLD-008] Self-improvement policy (scope, approval, rollback, audit)`

**Issue body:**

```markdown
## Objective
Document and enforce the self-improvement policy: what agents may change (paths, file types), that changes go through proposed branch/PR or change request, PO approval required, rollback procedure, and audit log.

**SSOT:** [SOVEREIGN_PROJECT_BOARD_SSOT.md](SOVEREIGN_PROJECT_BOARD_SSOT.md) | **Full LLD:** [SOVEREIGN_MASTER_PLAN_AND_LLD.md](SOVEREIGN_MASTER_PLAN_AND_LLD.md) Part C.

## Summary table

| Field | Content |
|-------|--------|
| **Product surface** | Orchestration, tool policy, docs. |
| **Current behaviour** | No formal policy; agents may have broad tool access. |
| **Target behaviour** | Policy doc (e.g. SELF_IMPROVEMENT_POLICY.md) defines scope, approval flow, rollback; tool layer or agent instructions enforce "propose only" for listed paths; audit log for proposals and approvals. |
| **Dependencies** | Existing tool bridge and task/event model. |
| **Constraints** | Fail-closed; no silent self-modification of policy or critical paths. |
| **Non-goals** | Full automated rollback in this issue; document Git revert steps. |
| **Acceptance criteria** | (1) Policy doc exists and is linked from contract/ADR. (2) Agents cannot directly write to listed "approval-required" paths without going through proposal. (3) Proposals and outcomes logged. |
| **Test cases** | TC1: Agent attempts write to protected path — blocked or proposed. TC2: Proposal created and visible to PO. TC3: Audit log contains proposal and decision. |
| **Edge cases** | EC1: Partial apply — rollback doc covers it. EC2: Policy change — requires contract change process. |
| **Validation** | Read policy doc; run test that triggers proposal path. |
| **Target repo** | sovereign repo. **Implementation surfaces:** `docs/SELF_IMPROVEMENT_POLICY.md`; tool policy or approval gate; audit table or events. |

## Depends on
- None (tool bridge done)
```

---

## LLD-009: Theia panels (chat, backlog, runtime, memory)

**Issue title:** `[LLD-009] Theia panels (chat, backlog, runtime, memory)`

**Issue body:**

```markdown
## Objective
Implement Theia-native panels for unified chat, backlog (read-only), runtime health, and memory/decisions so the Theia shell feels like {sovereign} and operators can use the desktop shell without the web app for core flows.

**SSOT:** [SOVEREIGN_PROJECT_BOARD_SSOT.md](SOVEREIGN_PROJECT_BOARD_SSOT.md) | **Full LLD:** [SOVEREIGN_MASTER_PLAN_AND_LLD.md](SOVEREIGN_MASTER_PLAN_AND_LLD.md) Part C.

## Summary table

| Field | Content |
|-------|--------|
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
| **Target repo** | sovereign repo. **Implementation surfaces:** `tools/theia-desktop` or app-specific Theia extensions; panel widgets. |

## Depends on
- Backlog API, chat, runtime (done)
```

---

## LLD-010: Provider abstraction (Ollama + MLX, OpenClaw adapter)

**Issue title:** `[LLD-010] Provider abstraction (Ollama + MLX, OpenClaw adapter)`

**Issue body:**

```markdown
## Objective
Centralise all model usage behind a single provider abstraction; support Ollama (primary), MLX (optional), and OpenClaw as optional adapter; health, model list, completion, embeddings from abstraction only.

**SSOT:** [SOVEREIGN_PROJECT_BOARD_SSOT.md](SOVEREIGN_PROJECT_BOARD_SSOT.md) | **Full LLD:** [SOVEREIGN_MASTER_PLAN_AND_LLD.md](SOVEREIGN_MASTER_PLAN_AND_LLD.md) Part C.

## Summary table

| Field | Content |
|-------|--------|
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
| **Target repo** | sovereign repo. **Implementation surfaces:** `apps/sovereign/src/lib/runtime/` or equivalent; provider interface; Ollama/MLX/OpenClaw implementations. |

## Depends on
- Existing runtime (done)
```

---

*After creating each issue in mvp-factory-control, update the "Issue(s) on board" column in [SOVEREIGN_PROJECT_BOARD_SSOT.md](SOVEREIGN_PROJECT_BOARD_SSOT.md) §4.*
