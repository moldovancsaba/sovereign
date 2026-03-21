# Documentation and SSOT Audit vs Code

**Date:** 2025-03-19  
**Purpose:** Compare docs/SSOT to the codebase and list inconsistencies so they can be fixed or explicitly documented as deferred.

---

## 1. Summary

| Category | Finding | Severity |
|----------|---------|----------|
| Tool naming | Docs use `backlog_create_item` (underscore); code uses `backlog.create_item` (dot) | **Medium** |
| LLD delivery checklist | §4 shows all LLDs ☐; LLD-002, LLD-003, LLD-004 are implemented | **Medium** |
| Rename (LLD-001) | `SOVEREIGN_*` preferred everywhere; `SENTINELSQUAD_*` retained as documented fallbacks | **Low** (compat by design) |
| WIKI / doc links | Spot-check WIKI for stale `SENTINELSQUAD_*` / `sentinelsquad-product.md` links after renames | **Low** |
| Backlog tools list | Docs omit `backlog.list_boards`, `backlog.get_item`; mention `backlog_update_status` (ADR) vs `backlog.update_item` | **Low** |
| CRITICAL / triage | PRODUCT_BOARD_AND_TRIAGE §2/3 mention CRITICAL flag; schema has no `critical` / `triageOutcome` on BacklogItem | **Low** |

---

## 2. Tool naming (backlog)

**SSOT / Master Plan / Issue template:**  
- LLD-003 and LLD-005 say worker/MCP tools: `backlog_create_item`, `backlog_update_item`, `backlog_list_items`, `backlog_add_feedback` (underscore, no namespace).
- LLD-005: MCP tools `backlog_list_boards`, `backlog_list_items`, `backlog_create_item`, `backlog_update_item`, `backlog_add_feedback`.

**Code:**  
- Worker tools in `scripts/lib/tool-backlog.js` use **dot** prefix: `backlog.list_boards`, `backlog.list_items`, `backlog.get_item`, `backlog.create_item`, `backlog.update_item`, `backlog.add_feedback`.

**Inconsistency:**  
- **Naming style:** Docs = underscore (`backlog_create_item`); code = dot (`backlog.create_item`).  
- **Coverage:** Code adds `backlog.list_boards` and `backlog.get_item`; docs don’t list them in LLD-003 (they appear in LLD-005 for MCP).  
- **ADR 0003:** Says `backlog_update_status`; implementation is `backlog.update_item` (status is one field of the update).

**Recommendation:**  
- Either update docs to say worker tools use the `backlog.*` dot convention and list all six tools (including `list_boards`, `get_item`), **or** add a short “Naming” note: “Worker uses `backlog.<action>`; MCP server (LLD-005) may use underscore for MCP spec compliance.”  
- When implementing LLD-005 (MCP server), decide: same tool names as worker (dot) or MCP-style (underscore) and document the choice.

---

## 3. Delivery checklist (SSOT §4)

**SSOT:**  
[SOVEREIGN_PROJECT_BOARD_SSOT.md](SOVEREIGN_PROJECT_BOARD_SSOT.md) §4 lists all LLDs with “Done” = ☐.

**Code / implementation:**  
- LLD-002: Kanban at `/backlog` (read-only) — implemented.  
- LLD-003: Worker backlog tools (`tool-backlog.js`, policy, worker dispatch) — implemented.  
- LLD-004: Final judgement (JUDGEMENT event, task fields, transcript, escalation) — implemented.

**Inconsistency:**  
Checklist does not reflect completion of 002, 003, 004.

**Recommendation:**  
Update §4 so that the “Done” column marks LLD-002, LLD-003, LLD-004 as done (e.g. ☑ or “Done”) when the PO confirms delivery.

---

## 4. Rename (LLD-001) vs code

**Target (RENAME_TO_SOVEREIGN.md / LLD-001):**  
- Brand {sovereign}; identifiers `sovereign`; env vars e.g. `SOVEREIGN_*`; no remaining sentinelsquad in user-facing or repo-critical paths.

**Code today:**  
- **App directory:** `apps/sovereign` (renamed).  
- **Package:** `apps/sovereign/package.json` has `"name": "sovereign"`.  
- **Worker and env:**  
  - `scripts/worker.js` reads `SOVEREIGN_*` first, then `SENTINELSQUAD_*`; settings path prefers `.sovereign/settings.json`, then `.sentinelsquad/settings.json`. Default GitHub repo name in worker is `sovereign` (override via env). Orchestrator lease id is **`sovereign-primary-orchestrator`** (migration updates legacy `sentinelsquad-primary-orchestrator` rows).  
  - Log prefix: `[sovereign-worker]`.  
- **Scripts:**  
  - E2E and recovery: `sovereign-*.e2e.js`, `sovereign-incident-bundle.js`; `e2e:sentinelsquad` remains a **deprecated alias** for `e2e:sovereign`.  
- **Build output:**  
  - Rebuild after source changes; chunk names follow Turbopack layout.  
- **Error UI:**  
  - Global error page references `docs/SETUP.md` and `{sovereign}` branding.

**Inconsistency:**  
Intentional **compat** layers remain: legacy env `SENTINELSQUAD_*`, `.sentinelsquad/` data dirs, `sentinelsquad.tool-call` protocol name, and NextAuth provider alias `sentinelsquad-dev` alongside `sovereign-dev`.

**Recommendation:**  
- Keep documenting compat fallbacks in SETUP / HANDOVER until a planned cutover removes them.

---

## 5. WIKI and doc references

**WIKI.md:**  
- Links to `SENTINELSQUAD_DELIVERY_ROADMAP.md` (Architecture section).  
- Links to `projects/sentinelsquad-product.md` (Product Context).

**RENAME_TO_SOVEREIGN.md:**  
- Suggests renaming `SENTINELSQUAD_DELIVERY_ROADMAP.md` → `SOVEREIGN_DELIVERY_ROADMAP.md`, `sentinelsquad-product.md` → `sovereign-product.md`.

**Codebase:**  
- `docs/SENTINELSQUAD_DELIVERY_ROADMAP.md` and `docs/projects/sentinelsquad-product.md` still exist.  
- No `SOVEREIGN_DELIVERY_ROADMAP.md` found.

**Inconsistency:**  
WIKI still uses old filenames; rename checklist is not applied for these files.

**Recommendation:**  
- Rename the two files per RENAME_TO_SOVEREIGN.md and update WIKI links to the new names, **or**  
- Keep filenames but add a short note in WIKI that “Delivery roadmap / product context still use legacy filenames until LLD-001 completion.”

---

## 6. Backlog schema vs PRODUCT_BOARD_AND_TRIAGE

**PRODUCT_BOARD_AND_TRIAGE.md §2–3:**  
- CRITICAL = “immediate human intervention”; map to a **flag** on the item (e.g. `critical: boolean` on BacklogItem) or a separate triage outcome.  
- Optional: `triageOutcome: IDEABANK | IN_PROGRESS | CRITICAL` alongside `BacklogItemStatus`.

**Code:**  
- `prisma/schema.prisma`: `BacklogItem` has no `critical` and no `triageOutcome` field.

**Inconsistency:**  
Docs describe a CRITICAL flag / triage outcome; schema does not implement it.

**Recommendation:**  
- Either add a `critical` (or `triageOutcome`) field in a future LLD and note it in the Master Plan, **or**  
- In PRODUCT_BOARD_AND_TRIAGE state that “CRITICAL is not yet stored on the item; behaviour is product rule only until schema is extended.”

---

## 7. Implementation surfaces (paths) in docs

**Master Plan / Issue template:**  
- LLD-002: `apps/sovereign/src/app/backlog/` (or `board/`).  
- LLD-005: `apps/sovereign/scripts/mcp-backlog-server` or lib.

**Code:**  
- Backlog UI: `apps/sovereign/src/app/backlog/page.tsx` exists (route `/backlog`).  
- No `mcp-backlog-server` yet (LLD-005 not implemented).

**Consistency:**  
Paths in docs match current layout; no change needed for 002/005 surfaces.

---

## 8. References in PRODUCT_BOARD_AND_TRIAGE §4

- **Contract:** `SOVEREIGN_AGENT_TEAM_CONTRACT.md` — exists.  
- **ADR:** `architecture/0003-local-backlog-and-po-experience.md` — exists under `docs/architecture/`.  
- **HLD gap:** `HLD_FEEDBACK_AND_GAP_ANALYSIS.md` §2.2 — exists under `docs/`.

**Consistency:**  
All §4 references exist and are correct relative to `docs/`.

---

## 9. Recommended next actions (priority)

1. **SSOT §4:** Mark LLD-002, LLD-003, LLD-004 as done when PO confirms.  
2. **Tool naming:** Add one paragraph to Master Plan (or LLD-003/005) stating worker uses `backlog.*` (dot) and listing all six tools; clarify MCP (LLD-005) naming when implemented.  
3. **Rename:** Either finish env/worker/scripts per RENAME_TO_SOVEREIGN.md or document deferred env/worker rename and keep SSOT in sync.  
4. **WIKI:** Update links to roadmap and product doc to renamed files (or add “legacy filenames” note).  
5. **CRITICAL:** In PRODUCT_BOARD_AND_TRIAGE, add one sentence that CRITICAL/triageOutcome is not yet in schema (product rule only) or plan a small schema LLD.

---

## 10. Fixes applied (2025-03-19)

- **SSOT §4:** LLD-002, LLD-003, LLD-004 marked ☑ done.
- **Master Plan LLD-003:** Added "Implementation note (as built)" for worker dot-prefix tool names and the six tools.
- **Issue template LLD-003:** Implementation surfaces updated to list as-built tool names.
- **WIKI:** Roadmap link updated to SOVEREIGN_DELIVERY_ROADMAP.md; product context to projects/sovereign-product.md; "Delivery phases" table row updated.
- **Renamed files:** SENTINELSQUAD_DELIVERY_ROADMAP.md → SOVEREIGN_DELIVERY_ROADMAP.md (content updated to {sovereign}); projects/sentinelsquad-product.md → projects/sovereign-product.md (content updated). Old files removed.
- **PRODUCT_BOARD_AND_TRIAGE:** Added "Current schema" note that CRITICAL/triageOutcome are not yet on BacklogItem (product rules only until a future LLD).
- **LLD-005:** MCP server for backlog implemented: `scripts/mcp-backlog-server.js`; stdio JSON-RPC, tools backlog_list_boards, backlog_list_items, backlog_get_item, backlog_create_item, backlog_update_item, backlog_add_feedback; uses same Prisma + tool-backlog as worker. Run: `npm run mcp:backlog`. Fixed missing `}` in tool-backlog.js (runAddFeedback if-block).

---

*Audit produced to align docs/SSOT with code. Update this file when resolving items or after major deliveries.*
