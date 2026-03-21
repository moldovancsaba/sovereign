# ADR 0003: Local Backlog, Scrum Master Agent, and Product Owner Experience

## Status

Accepted. Implementation in progress.

## Date

2026-03-19

## Context

The product requires:

- A **fully local** product-owner backlog (no GitHub dependency; works offline).
- The PO **talks to an agent** (e.g. scrum master) to create, change, prioritize, and close work; the **kanban board is read-only** for the PO (view/learn).
- Agents use a **rock-solid API** to read and update backlog; the PO never edits the board directly for modifications—conversation with the agent is the single interface for changes.

## Decision

### 1. Fully local backlog

- **Data:** Backlog lives in PostgreSQL only (`BacklogBoard`, `BacklogGoal`, `BacklogItem`, `POFeedback`). No GitHub Projects dependency for core operation.
- **API:** REST or internal service API for CRUD on goals and items; agents and the scrum-master agent call this API. Kanban UI only reads and displays.
- **UI:** In-app kanban (Next.js today; Theia panel later) that renders board state. PO can view, filter, open items—but **create/update/delete/reorder/prioritize** only via chat with the agent.

### 2. Scrum master agent and “talk to modify”

- One primary agent role (e.g. **@ScrumMaster** or **@Controller** extended) is the **single interface** for backlog changes.
- PO says in chat: “Add a story for …”, “Move X to In Progress”, “Reject this because …”, “What’s the status of …”. The agent interprets intent and calls the **Backlog API** (or MCP backlog tools).
- Kanban is **read-only for the PO**: visibility, learning, status check. All modifications go through conversation so the system stays consistent and auditable.

### 3. Fill-the-gap steps (local backlog)

1. **Schema:** Implemented in Prisma: `BacklogBoard`, `BacklogGoal`, `BacklogItem`, `POFeedback`, enums `BacklogItemStatus`, `POFeedbackKind`.
2. **Seed default board:** On first run or migration, ensure one default `BacklogBoard` (e.g. `productScope: null` or `"default"`).
3. **Backlog API:** Add app routes (e.g. `GET/POST /api/backlog/boards`, `GET/POST/PATCH/DELETE /api/backlog/items`, `GET/POST /api/backlog/goals`, `POST /api/backlog/feedback`). Auth: same as rest of app (session or local bypass).
4. **Agent access:** Worker (and later MCP backlog server) calls these endpoints or an internal BacklogService. No direct DB access from agents; all via API.
5. **Kanban UI:** New page or panel: list boards, show columns by `BacklogItemStatus`, drag-disabled (or drag only for reorder within column if we allow “reorder” as a PO action via agent later). Item detail: title, description, acceptance criteria, feedback history (read-only).
6. **Scrum master flow:** In chat, when PO asks to add/change/delete/prioritize, controller (or dedicated scrum master agent) uses Backlog API and confirms in transcript.

### 4. Documentation and memory (2.6) – concrete steps

- **Wiki:** Deploy one engine (e.g. **BookStack** or **Outline**) self-hosted; expose pages as **MCP resources** (e.g. `doc://runbooks/…`, `doc://decisions/…`).
- **Structured .md:** Keep `/docs` (and app docs) as structured Markdown; MCP “docs” tool or resource can index by path/title for agents.
- **OpenAPI:** Store or generate specs; expose as MCP resource so agents can reason about APIs.
- **Memory model extension:** Add memory types (thread, project, agent, evidence, **PO/product**) and provenance; pgvector retrieval; ingestion of key wiki/docs into project memory with `source` and link to doc.

### 5. MCP (2.5)

- Backlog exposed as **MCP server** (tools: e.g. `backlog_list_items`, `backlog_create_item`, `backlog_update_status`, `backlog_add_feedback`). Agents use MCP client; single contract for all tools including backlog.

## Consequences

- **Offline:** Backlog and PO workflow work without GitHub or network.
- **Single source of truth:** PostgreSQL; API is the only writer for backlog state.
- **Best-in-class PO experience:** PO talks to agent; board is for reading and context. Changes are always intentional and recorded in transcript + feedback.

## API surface (implemented)

- `GET/POST /api/backlog/boards` — list boards, create board
- `GET/POST /api/backlog/items` — list items (query: `boardId`, `status`, `goalId`), create item
- `GET/PATCH/DELETE /api/backlog/items/[id]` — get, update, delete item
- `GET/POST /api/backlog/goals` — list goals (query: `boardId`), create goal
- `POST /api/backlog/feedback` — add PO feedback (body: `backlogItemId`, `kind`, `reason?`, `threadId?`)

All require app session (local auth bypass or NextAuth). Default board is created on first use (`productScope: "default"`).

## Remaining work

- Kanban UI page/panel (read-only for PO)
- Worker/MCP backlog tools that call this API so the scrum-master agent can perform changes from chat
- Optional: MCP server that exposes backlog as MCP tools

## Related

- ADR 0001 (Theia desktop foundation)
- ADR 0002 (Rock-solid hardening)
- [theia-upstream-and-future-proof.md](theia-upstream-and-future-proof.md)
- READMEDEV.md (documentation rule)
