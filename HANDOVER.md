# {sovereign} Handover

**Purpose:** Current release state, operator truth, verification commands, and next priority. Append handover-log entries per **70 PROTOCOL** (READMEDEV rule 13); do not rewrite history unless correcting false info.

---

## Current Release

- **Version:** `1.0.1`
- **Date:** `2026-03-19`
- **Stage:** `first-client-delivery hardening`

---

## Implemented Now

- local-first macOS product launch (Sovereign.app / `{sovereign}` web app)
- local app on `http://127.0.0.1:3007`
- Postgres (local)
- unified multi-agent chat
- active-agent visibility and runtime/status commands
- managed worker running `@Controller`
- execution-time role enforcement
- project-session-aware tool execution
- thread and task event timeline
- local runtime doctor, local system-service status, and dashboard health
- durable project-memory capture foundation
- **LLD-006 (foundation + follow-through):** `ProjectMemory` kinds + provenance + `vector(768)` embedding; **HNSW** partial index on `embedding` (migration `20260321103000_project_memory_embedding_hnsw`); `POST /api/memory/search` (lexical + optional semantic). **MCP:** `npm run mcp:memory` — tools + **resources** (`sovereign-memory://docs/operator-guide`, `sovereign-memory://memory/{id}`). **Worker:** tool protocol `memory.*`; **prompt memory** default **THREAD**; opt-in **PROJECT_SESSION** via task `payload.memory.scope` (durable `ProjectMemory` lexical match for active project session). ADR: [docs/architecture/0004-memory-pgvector-embedding.md](docs/architecture/0004-memory-pgvector-embedding.md). Remaining (optional): semantic snippets in worker prompt, LLD-007 wiki ingestion.
- **Operator UI refresh:** Shell privileges Chat, `{sovereign}` / Sovereign copy, updated tokens (`globals.css`), page subtitles aligned to [docs/UI_UX_STANDARDS.md](docs/UI_UX_STANDARDS.md); Theia-native shell remains future (LLD-009)
- **Local backlog:** API, Kanban UI (read-only at `/backlog`), worker backlog tools (`backlog.list_boards`, `backlog.list_items`, `backlog.get_item`, `backlog.create_item`, `backlog.update_item`, `backlog.add_feedback`), MCP backlog server (stdio) — run: `npm run mcp:backlog` from `apps/sovereign`
- **Final-judgement (JUDGE):** JUDGEMENT ChatEvent, task fields (`judgementVote`, `judgementConfidence`, `judgementReason`, `escalatedAt`), transcript display and escalation in chat UI

---

## Partially Implemented

- Theia desktop shell transition
- memory retrieval, annotation, and review
- complete provider abstraction beyond the current Ollama-first path
- first-public OSS packaging polish
- LLD-001 rename: **done on board** — [mvp-factory-control#437](https://github.com/moldovancsaba/mvp-factory-control/issues/437) closed **2026-03-21** (engineering sign-off; intentional legacy strings documented in issue). Canonical env names **`SOVEREIGN_*`** across major server libs; NextAuth primary provider id **`sovereign-dev`** with legacy alias **`sentinelsquad-dev`**; tool-call protocol canonical **`sovereign.tool-call`** with legacy **`sentinelsquad.tool-call`** accepted.

---

## Target Architecture

- Theia as the primary shell
- `pgvector` retrieval for long-term memory
- MLX as a first-class provider
- OpenClaw adapter support
- richer project-memory curation workflows

---

## Operator Truth

- GitHub is optional for runtime.
- The **mvp-factory-control** project board is the SSOT for delivery planning; canonical LLD issues are **#437–#446** (see [docs/SOVEREIGN_PROJECT_BOARD_SSOT.md](docs/SOVEREIGN_PROJECT_BOARD_SSOT.md)).
- This repository is the implementation and documentation source for the product.

---

## Verification Commands

```bash
cd /Users/moldovancsaba/Projects/sovereign
npm run typecheck
npm run build
npm run memory:verify   # pgvector + Ollama nomic-embed-text (768-d); requires db:up + ollama pull nomic-embed-text
```

From app dir (e.g. `apps/sovereign`):

```bash
npx prisma migrate status
node scripts/mcp-backlog-server.js   # then send one JSON-RPC line to stdin, e.g. {"jsonrpc":"2.0","id":1,"method":"tools/list"}
```

**Other environments / rollout:** from repo root, `npm run prisma:migrate:deploy` with valid `DATABASE_URL` (pgvector Postgres). Docker: `./scripts/sovereign-docker-bootstrap.sh` applies migrations automatically.

---

## Next Priority

1. **LLD-007** (wiki/docs + MCP resources), **LLD-008** (self-improvement policy), **LLD-009** (Theia panels), **LLD-010** (provider abstraction) — per [docs/SOVEREIGN_PROJECT_BOARD_SSOT.md](docs/SOVEREIGN_PROJECT_BOARD_SSOT.md) §2. Optional: close **mvp-factory-control** [#437](https://github.com/moldovancsaba/mvp-factory-control/issues/437) after PO grep/sign-off on LLD-001.
2. ~~Implement and automate daily sub-tasks~~ Done: see **Run** (/run). Otherwise: in the application (e.g. “How to run the MCP server” and similar operator flows).
3. Keep docs and board in sync with implemented state.

---

## Handover log (append only; 70 PROTOCOL)

Each entry below is appended per READMEDEV rule 13. Format: timestamp + agent label, branch/commit, objective, what changed, files touched, validation, known issues/next actions.

- **2026-03-21 (local)** — **Rollout ergonomics:** Root \`npm run prisma:migrate:deploy\`; SETUP/BUILD_AND_RUN/README/HANDOVER document deploy vs dev; Docker portability workflow retriggers on root \`package.json\` changes.
- **2026-03-21 (local)** — **Prisma migrate deploy:** Applied \`20260321103000_project_memory_embedding_hnsw\` (HNSW on \`ProjectMemory.embedding\`) to local Postgres at \`localhost:34765\`.
- **2026-03-21 (local)** — **LLD-001 board:** Closed [mvp-factory-control#437](https://github.com/moldovancsaba/mvp-factory-control/issues/437) with engineering AC note; SSOT §4 LLD-001 ☑.
- **2026-03-21 (local)** — **LLD-006 follow-through + LLD-001 env sweep:** HNSW index migration; MCP memory **resources/list** + **resources/read**; worker **PROJECT_SESSION** memory scope (`task-memory.js` + `worker.js`); `SOVEREIGN_*` first across `github`, `rbac`, `runtime-config`, `runtime-settings-mutability`, `nexus-control`, `ide`, `email-ingress`, `tool-call-approval`, `orchestrator-introspection`, `orchestrator-lease`, `active-agents`, `tasks`, `local-system-status`, `chat/actions`, `strict-orchestration`, `products/actions`; `env-sovereign.ts` helper. Docs: ADR 0004, Run page, HANDOVER. Validation: `npm run verify`; `node apps/sovereign/scripts/e2e/sovereign-postmvp.e2e.js`; MCP resources/list smoke.
- **2026-03-21 (local)** — **mvp-factory-control GitHub pass:** Closed **[#438–#442](https://github.com/moldovancsaba/mvp-factory-control/issues)** (LLD-002…006) with comments linking **moldovancsaba/sovereign** and `docs/SOVEREIGN_PROJECT_BOARD_SSOT.md` §4. Commented **[#437](https://github.com/moldovancsaba/mvp-factory-control/issues/437)** (engineering largely done; PO/AC sign-off pending). Batch-updated **33** issue bodies: `{sentinelsquad}` → `{sovereign}` (from `sentinelsquad in:body` search); **#437** skipped for automated body replace (spec still documents legacy strings / current behaviour). **#443–#446** unchanged (open). Validation: `gh issue view` spot-checks.
- **2026-03-21 (local)** — **Project board SSOT:** [docs/SOVEREIGN_PROJECT_BOARD_SSOT.md](docs/SOVEREIGN_PROJECT_BOARD_SSOT.md) §3.1 links [MVP Factory Board](https://github.com/users/moldovancsaba/projects/1), clarifies mvp-factory-control vs sovereign repos, issue-state vs §4 checklist, and sentinelsquad-in-body cleanup on GitHub.
- **2026-03-21 (local)** — **Eliminate duplicate project dirs + path fixes:** Removed `~/Projects/sentinelsquad` and `~/Projects/sentinelsquad-orphaned-20260321` (obsolete checkouts). Repo: CI/workflows + `scripts/sovereign-docker-preflight.sh` use `apps/sovereign`; daemon/MCP launcher scripts default app root via script-relative path; `.command` launchers no longer fall back to old absolute path; `tools/launchd`, legacy macOS templates, Theia README, recovery bundle default GitHub repo, `package-lock` extraneous `apps/sentinelsquad` entry removed. Validation: `npm run verify`.
- **2026-03-19 (local)** — **Leftover audit:** [docs/OBSOLETE_AND_LEFTOVER_AUDIT.md](docs/OBSOLETE_AND_LEFTOVER_AUDIT.md) inventories legacy SentinelSquad paths, scripts, CI workflows, protocol IDs, and doc drift; [docs/WIKI.md](docs/WIKI.md) linked. Root `.gitignore` updated from obsolete `apps/sentinelsquad/` entries to `apps/sovereign/` (and blanket `apps/sentinelsquad/` ignore for stale checkouts). Validation: review `git check-ignore -v apps/sovereign/.env` if needed.
- **2026-03-19 (local)** — **Strict orchestration + backlog:** `backlog.list_boards`, `backlog.list_items`, `backlog.get_item` → `BACKLOG` / `READ_ONLY` (allowed for `@Controller` / `@Drafter`); `backlog.create_item`, `backlog.update_item`, `backlog.add_feedback` → `BACKLOG` / `MUTATION` (blocked for those roles; `@Writer` unchanged). E2E extended in `sovereign-strict-role-policy.e2e.js`.
- **2026-03-19 (local)** — **Strict orchestration + memory:** `classifyToolAccess` treats `memory.*` as `PROJECT_MEMORY` / `READ_ONLY`. `@Controller` and `@Drafter` may invoke memory tools under strict mode (alongside read-only filesystem/git as before). E2E: `node apps/sovereign/scripts/e2e/sovereign-strict-role-policy.e2e.js`.
- **2026-03-19 (local)** — **MCP + worker memory tools:** `scripts/lib/tool-memory.js`, `scripts/mcp-memory-server.js`, `npm run mcp:memory`; policy class `PROJECT_MEMORY`; worker executes `memory.*` with session-scoped default `projectSessionId`. Run page documents MCP memory. Validation: `npm run verify`; smoke: `printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | node apps/sovereign/scripts/mcp-memory-server.js`.
- **2026-03-19 (local)** — **Docs / operator:** `npm run memory:verify` at repo root and in `apps/sovereign`; HANDOVER verification block; Run page flow; SETUP semantic-memory step + fixed post-setup links to `sovereign` paths; project board SSOT marks LLD-006 foundation ☑. Validation: `npm run verify`, `npm run memory:verify`.
- **2026-03-19 (local)** — **LLD-006 slice:** Prisma `ProjectMemoryKind`, provenance fields, pgvector migration; `src/lib/embeddings.ts`, `searchProjectMemorySemantic` + `updateProjectMemoryEmbedding`; `POST /api/memory/search`; worker capture + optional embed; `docker-compose` Postgres → `pgvector/pgvector:pg16`; ADR 0004; SETUP/WIKI. Operators with an existing plain-Postgres volume should recreate the DB container/volume once, then `npx prisma migrate deploy`. Validation: `npm run verify`.
- **2026-03-19 (local)** — **UI/UX:** Sovereign-aligned chrome (Shell nav: Chat first, responsive nav, accent page title), refreshed palette, metadata + copy sweep (dashboard, settings, chat, nexus, issues, auth display names). Docs: `UI_UX_STANDARDS.md` brand. Validation: `npm run verify`.
- **2026-03-19 (local)** — macOS **Sovereign.app** installer: new `tools/macos/SovereignDesktop/` (Swift WebKit shell), `npm run desktop:install-app` installs to `/Applications` when writable else `~/Applications`, skips Theia Electron by default, boot uses `apps/sovereign` paths and `.sovereign/desktop-app-logs`. Legacy `SentinelSquadDesktop/install_*.sh` delegates here. **Menubar:** `tools/macos/SovereignMenubar/` + `npm run menubar:install` (`com.sovereign.menubar`); legacy `SentinelSquadMenubar/install_*.sh` delegates. Validation: install + `open` on dev Mac.
- **2026-03-19 (local)** — Daily operator flows in-app. Added **Run** page at `/run`: copyable commands for start DB, start app, start worker, run MCP backlog server, run migrations, verify build. Nav link "Run" in Shell. Files: `apps/sovereign/src/app/run/page.tsx`, `apps/sovereign/src/components/CopyCommandButton.tsx`, `apps/sovereign/src/components/Shell.tsx`. Validation: build/typecheck. Next: LLD-006 or continue SSOT priorities.
- **2026-03-19 (local)** — LLD-001 (partial): Worker reads `SOVEREIGN_*` env vars with `SENTINELSQUAD_*` fallback; settings file prefers `.sovereign/settings.json` then `.sentinelsquad/`; worker logs `[sovereign-worker]`; UI shell/error/run copy and CONTRIBUTING/BUILD_AND_RUN/README roadmap links aligned to `{sovereign}`. Files: `apps/sovereign/scripts/worker.js`, `settings-store.ts`, `worker-process.ts`, `Shell.tsx`, `error.tsx`, `run/page.tsx`, `products/actions.ts`, docs. Validation: `npm run verify`.
- **2026-03-19 (local)** — Run page: **live status** — `getLocalSystemStatus()` (app/worker/ollama/postgres), Prisma `SELECT 1` ping, `listRunningWorkers()` for dev worker PIDs; links to Dashboard and Agents. Files: `RunStatusSection.tsx`, `run/page.tsx`.

---

*End of HANDOVER.md. Append new entries above this line.*
