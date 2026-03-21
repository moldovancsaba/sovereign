# {sovereign} Project Board — Single Source of Truth (SSOT)

**Purpose:** This document is the **canonical reference** for what the project board contains, in what order work is done, and where the detailed definitions live. Use it when creating or updating issues in **mvp-factory-control** or any other project board. No other list overrides this without going through the [contract change process](SOVEREIGN_AGENT_TEAM_CONTRACT.md#43-change-process-for-this-contract).

---

## 1. Authority chain

| Question | Answer (SSOT) |
|----------|----------------|
| What is law (invariants, obligations)? | [SOVEREIGN_AGENT_TEAM_CONTRACT.md](SOVEREIGN_AGENT_TEAM_CONTRACT.md) |
| What do we do, in what order, and what are the deliverables? | [SOVEREIGN_MASTER_PLAN_AND_LLD.md](SOVEREIGN_MASTER_PLAN_AND_LLD.md) |
| How does the product board (backlog) work — pipeline, triage, time language? | [PRODUCT_BOARD_AND_TRIAGE.md](PRODUCT_BOARD_AND_TRIAGE.md) |
| What is on the project board (issues to build or update)? | **This document** (§2 and §3). |

When in doubt: **Contract → Master Plan → Product Board doc → this SSOT.** Scope and acceptance for each deliverable are defined in the Master Plan (Part C); this doc only summarises and orders them.

---

## 2. Canonical deliverable set (LLD issues)

The following are the **only** LLD deliverables in the current plan. Each row is one issue to create or update on the project board.

| Id | One-line objective | Depends on | Suggested phase |
|----|---------------------|------------|------------------|
| **LLD-001** | Product rename sentinelsquad → {sovereign} (brand, code, docs, app) | — | 1 |
| **LLD-002** | Kanban UI (read-only) for local backlog | 001 optional | 1 |
| **LLD-003** | Worker/MCP backlog tools and scrum-master flow | Backlog API (done) | 1 |
| **LLD-004** | Final-judgement / JUDGE semantics + optional confidence | — | 2 |
| **LLD-005** | MCP server for backlog (agents call via MCP) | Backlog API (done) | 2 |
| **LLD-006** | Memory extension (PO/product types, pgvector) | Existing memory (done) | 2 |
| **LLD-007** | Wiki/docs + MCP resources (BookStack/Outline + ingestion) | 006 optional | 3 |
| **LLD-008** | Self-improvement policy (scope, approval, rollback, audit) | — | 2 |
| **LLD-009** | Theia panels (chat, backlog, runtime, memory) | — | 2 |
| **LLD-010** | Provider abstraction (Ollama + MLX, OpenClaw adapter) | — | 2 |

**Implementation order (first slice):** 001 → 002 → 003. Then 004, 005, 006 in parallel where possible; 007 after 006; 008, 009, 010 as capacity allows. Full dependency graph: [Master Plan Part D](SOVEREIGN_MASTER_PLAN_AND_LLD.md#part-d-dependency-graph-for-ordering).

---

## 3. Mapping to the project board (mvp-factory-control)

- **One LLD row = one or more issues** on the board. Prefer one issue per LLD-00x; split only if one issue would be too large.
- **Issue body:** Use the ready-to-paste bodies in **[SOVEREIGN_ISSUE_TEMPLATE_MVP_FACTORY_CONTROL.md](SOVEREIGN_ISSUE_TEMPLATE_MVP_FACTORY_CONTROL.md)** (copy title + body per LLD). Or copy the **Objective** and full **table** from [Master Plan Part C](SOVEREIGN_MASTER_PLAN_AND_LLD.md#part-c-deliverable-issues-lld) for that LLD-00x. Optionally link to this SSOT and the Master Plan.
- **Labels:** Use e.g. `{sovereign}` (or your brand label), `P0`/`P1`/`P2` as you use today.
- **Dependencies:** In the issue description, list "Depends: LLD-00x" (or issue links if the board supports it). Order work using §2 above.
- **Status / pipeline:** Use your board columns as you prefer; align item semantics (IDEABANK, READY, IN_PROGRESS, DONE, CRITICAL) with [PRODUCT_BOARD_AND_TRIAGE.md](PRODUCT_BOARD_AND_TRIAGE.md). Use time language "now / sooner / later" in titles or goals, not Q4/H2/Y27.
- **Delivery rhythm:** See **[SOVEREIGN_DELIVERY_PLAYBOOK.md](SOVEREIGN_DELIVERY_PLAYBOOK.md)** for sprint/cycle steps and when to update this SSOT.

### 3.1 MVP Factory Board (GitHub Projects)

- **Live project:** [MVP Factory Board](https://github.com/users/moldovancsaba/projects/1) — GitHub Projects **#1** on account **moldovancsaba** (portfolio board; many items are other products).
- **Filter for `{sovereign}`:** Use the board **Product** field (or search titles) so control-plane work is not mixed with Amanoba, `{reply}`, `{hatori}`, MessMass, etc.
- **LLD issue numbers (#437–#446):** Opened in **[moldovancsaba/mvp-factory-control](https://github.com/moldovancsaba/mvp-factory-control)** (planning repo), not in [moldovancsaba/sovereign](https://github.com/moldovancsaba/sovereign) (implementation repo).
- **Board vs SSOT:** This document’s §4 checklist is the **contractual** done/not-done view for LLDs. **GitHub issue state** for LLD-001…006 ([#437](https://github.com/moldovancsaba/mvp-factory-control/issues/437)–[#442](https://github.com/moldovancsaba/mvp-factory-control/issues/442)) was aligned with §4 (issues closed **2026-03-21**; **#437** closed with engineering sign-off—see issue comment for intentional legacy grep hits).
- **Copy hygiene:** Issue bodies that used the `{sentinelsquad}` placeholder were batch-updated to `{sovereign}` on **mvp-factory-control** (2026-03-21), except where the text intentionally documents legacy strings.

---

## 4. Delivery checklist (PO use)

Use this to track that the plan is reflected on the board and to tick off completion. Updates to the plan (new LLD, reorder) require contract consensus and must be reflected here and in the Master Plan.

| LLD | Issue(s) on board | Done |
|-----|-------------------|------|
| LLD-001 | [#437](https://github.com/moldovancsaba/mvp-factory-control/issues/437) | ☑ |
| LLD-002 | [#438](https://github.com/moldovancsaba/mvp-factory-control/issues/438) | ☑ |
| LLD-003 | [#439](https://github.com/moldovancsaba/mvp-factory-control/issues/439) | ☑ |
| LLD-004 | [#440](https://github.com/moldovancsaba/mvp-factory-control/issues/440) | ☑ |
| LLD-005 | [#441](https://github.com/moldovancsaba/mvp-factory-control/issues/441) | ☑ |
| LLD-006 | [#442](https://github.com/moldovancsaba/mvp-factory-control/issues/442) | ☑ |
| LLD-007 | [#443](https://github.com/moldovancsaba/mvp-factory-control/issues/443) | ☐ |
| LLD-008 | [#444](https://github.com/moldovancsaba/mvp-factory-control/issues/444) | ☐ |
| LLD-009 | [#445](https://github.com/moldovancsaba/mvp-factory-control/issues/445) | ☐ |
| LLD-010 | [#446](https://github.com/moldovancsaba/mvp-factory-control/issues/446) | ☐ |

---

## 5. Change rule

- **Adding or removing a deliverable** (new LLD or dropping one): Change the [Master Plan](SOVEREIGN_MASTER_PLAN_AND_LLD.md) and this SSOT via the [contract change process](SOVEREIGN_AGENT_TEAM_CONTRACT.md#43-change-process-for-this-contract); then update the project board.
- **Reordering or reprioritising:** Update §2 and Part D of the Master Plan; no contract change needed unless invariants or obligations change.
- **Clarifying acceptance or tests:** Update the Master Plan Part C for that LLD; optionally note in this doc if the checklist or mapping changes.

---

*Document owner: Product Owner. This SSOT is aligned with SOVEREIGN_AGENT_TEAM_CONTRACT.md and SOVEREIGN_MASTER_PLAN_AND_LLD.md.*
