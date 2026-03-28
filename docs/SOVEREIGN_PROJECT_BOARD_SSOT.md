# {sovereign} Project Board — Single Source of Truth (SSOT)

**Purpose:** This document is the **canonical reference** for what belongs on the project board, how it maps to LLDs and extended work, and where detailed definitions live. **Implementation order and delivery status** are owned by the **[MVP Factory Board](https://github.com/users/moldovancsaba/projects/1)** (GitHub Projects): filter by Product `{sovereign}` — board columns and linked issue state are authoritative for what is queued, in progress, or done. Use this file when creating or updating issues in **mvp-factory-control** or adding cards to that board. Contract-level changes still go through the [contract change process](SOVEREIGN_AGENT_TEAM_CONTRACT.md#43-change-process-for-this-contract).

---

## 1. Authority chain

| Question | Answer (SSOT) |
|----------|----------------|
| What is law (invariants, obligations)? | [SOVEREIGN_AGENT_TEAM_CONTRACT.md](SOVEREIGN_AGENT_TEAM_CONTRACT.md) |
| **What is in progress / done next for implementation?** | **[MVP Factory Board](https://github.com/users/moldovancsaba/projects/1)** — portfolio board; filter Product `{sovereign}`. Board + linked issue state override ad-hoc lists. |
| What do we do, in what order, and what are the deliverables (planning / LLD scope)? | [SOVEREIGN_MASTER_PLAN_AND_LLD.md](SOVEREIGN_MASTER_PLAN_AND_LLD.md) |
| How does the product board (backlog) work — pipeline, triage, time language? | [PRODUCT_BOARD_AND_TRIAGE.md](PRODUCT_BOARD_AND_TRIAGE.md) |
| What is on the project board (issues to build or update), and how does this repo mirror it? | **This document** — LLDs in §2, extended `{sovereign}` issues in §2.1, repo-first shipments in §2.2, and how to deliver in §3.2–3.3. **Do not** treat [moldovancsaba/sovereign](https://github.com/moldovancsaba/sovereign) issues alone as implementation SSOT; they trace to board cards. |

When in doubt: **Contract → Master Plan → [MVP Factory Board](https://github.com/users/moldovancsaba/projects/1) (implementation truth) → this SSOT (mapping + checklist) → sovereign repo PRs.** Scope and acceptance for each **numbered LLD** are defined in the Master Plan (Part C). **Extended backlog** issues (§2.1) carry acceptance in their GitHub bodies until promoted to an LLD via the contract process.

---

## 2. Canonical deliverable set (LLD issues)

The following are the **only LLD-numbered** deliverables in the [Master Plan](SOVEREIGN_MASTER_PLAN_AND_LLD.md) (Part C). Each row maps to **one primary issue** on **mvp-factory-control** (see §4.1). **Other `{sovereign}` planning issues** live in §2.1; **code shipped before a board issue exists** is listed in §2.2.

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

### 2.1 Extended `{sovereign}` backlog (mvp-factory-control, not LLD-numbered)

These issues are **real portfolio work** for the same product but are **not** rows in §2. If they are missing here, the SSOT and the board have drifted — **add a row** when a new issue is opened, or promote the scope to a formal LLD (contract + Master Plan + §2).

| Issue | Objective | Relation to LLDs / notes |
|-------|-----------|---------------------------|
| [#432](https://github.com/moldovancsaba/mvp-factory-control/issues/432) | Open-source repository hardening and macOS installability baseline | Packaging, install UX, and repo hygiene beyond LLD-001 scope |
| [#433](https://github.com/moldovancsaba/mvp-factory-control/issues/433) | Memory annotation, review, and knowledge-curation workflow | Builds on LLD-006 foundation; see [HANDOVER.md](../HANDOVER.md) “Partially implemented” |
| [#436](https://github.com/moldovancsaba/mvp-factory-control/issues/436) | Optional: circuit breaker for model backends | Operational resilience; complements LLD-010 |
| [#448](https://github.com/moldovancsaba/mvp-factory-control/issues/448) | Mac mini / second Mac — greenfield deploy runbook (DB → app → worker → agents) | **Closed** — [MAC_MINI_DEPLOY.md](setup/MAC_MINI_DEPLOY.md); §8 engineering pass 2026-03-27 |
| [#449](https://github.com/moldovancsaba/mvp-factory-control/issues/449) | Operator-agnostic setup UX — no hardcoded dev paths in Run / SETUP | **Closed** — `/run` + docs + `os.homedir()` defaults |
| [#450](https://github.com/moldovancsaba/mvp-factory-control/issues/450) | macOS app + background services smoke test on clean install | **Closed** — [MACOS_APP_CLEAN_INSTALL_SMOKE.md](setup/MACOS_APP_CLEAN_INSTALL_SMOKE.md); recorded smoke 2026-03-27 |

### 2.2 Repo-first shipments (board mirror for PO sign-off)

Work **merged to [sovereign](https://github.com/moldovancsaba/sovereign) `main`** that uses a **dedicated mvp-factory-control issue** for Product Owner acceptance (and a card on [MVP Factory Board](https://github.com/users/moldovancsaba/projects/1)). **When adding a new repo-first shipment:** open an issue (see [generic template](SOVEREIGN_ISSUE_TEMPLATE_MVP_FACTORY_CONTROL.md#generic-template-if-you-need-a-new-lld-later)), add the project card, then add a row here and in §4.2.

| Shipment | Spec / entrypoints | Board issue |
|----------|-------------------|-------------|
| **Hybrid orchestrator v1** | [HYBRID_ORCHESTRATOR_SPEC_V1.md](architecture/HYBRID_ORCHESTRATOR_SPEC_V1.md); `apps/sovereign/src/lib/hybrid-orchestrator/`; `POST /api/orchestrator/hybrid` | [#447](https://github.com/moldovancsaba/mvp-factory-control/issues/447) |
| **v1.1.1 hardening** (staffing calibration, team policy, MLX scaffold, Trinity e2e reliability) | [docs/API_V1.md](API_V1.md); PRs [#17](https://github.com/moldovancsaba/sovereign/pull/17)–[#20](https://github.com/moldovancsaba/sovereign/pull/20) | [sovereign#12–#16](https://github.com/moldovancsaba/sovereign/issues?q=is%3Aissue+12+13+14+15+16) (closed); board drives priority vs extended mvp-factory-control issues |
| **Installability + CI** (one-command macOS install, Docker portability pulls) | `npm run install:macos`; `scripts/install-sovereign-macos.sh`; Docker bootstrap + workflow | [sovereign#22](https://github.com/moldovancsaba/sovereign/issues/22), [sovereign#23](https://github.com/moldovancsaba/sovereign/issues/23) (closed); supports [#432](https://github.com/moldovancsaba/mvp-factory-control/issues/432) / [#448](https://github.com/moldovancsaba/mvp-factory-control/issues/448)–[#450](https://github.com/moldovancsaba/mvp-factory-control/issues/450) |

---

## 3. Mapping to the project board (mvp-factory-control)

- **One LLD row = one or more issues** on the board. Prefer one issue per LLD-00x; split only if one issue would be too large.
- **Issue body:** Use the ready-to-paste bodies in **[SOVEREIGN_ISSUE_TEMPLATE_MVP_FACTORY_CONTROL.md](SOVEREIGN_ISSUE_TEMPLATE_MVP_FACTORY_CONTROL.md)** (copy title + body per LLD). Or copy the **Objective** and full **table** from [Master Plan Part C](SOVEREIGN_MASTER_PLAN_AND_LLD.md#part-c-deliverable-issues-lld) for that LLD-00x. Optionally link to this SSOT and the Master Plan.
- **Labels:** Use e.g. `{sovereign}` (or your brand label), `P0`/`P1`/`P2` as you use today.
- **Dependencies:** In the issue description, list "Depends: LLD-00x" (or issue links if the board supports it). Order work using §2 above.
- **Status / pipeline:** Use your board columns as you prefer; align item semantics (IDEABANK, READY, IN_PROGRESS, DONE, CRITICAL) with [PRODUCT_BOARD_AND_TRIAGE.md](PRODUCT_BOARD_AND_TRIAGE.md). Use time language "now / sooner / later" in titles or goals, not Q4/H2/Y27.
- **Delivery rhythm:** See **[SOVEREIGN_DELIVERY_PLAYBOOK.md](SOVEREIGN_DELIVERY_PLAYBOOK.md)** for sprint/cycle steps and when to update this SSOT.

### 3.2 End-to-end delivery (what to do, in order)

Use this when moving work from **idea → shipped code → board truth**.

1. **Pick the track:** Next **LLD** from §2 / §4.1 (open rows), **extended** item from §2.1 / §4.2, or **repo-first** item from §2.2 / §4.2 (PO sign-off on [#447](https://github.com/moldovancsaba/mvp-factory-control/issues/447) etc.).
2. **Plan on the board:** Ensure an issue exists on **mvp-factory-control** and (if you use it) a card on [MVP Factory Board](https://github.com/users/moldovancsaba/projects/1). Issue body should link **this SSOT** and, for LLDs, **[Master Plan Part C](SOVEREIGN_MASTER_PLAN_AND_LLD.md#part-c-deliverable-issues-lld)** or the [issue template](SOVEREIGN_ISSUE_TEMPLATE_MVP_FACTORY_CONTROL.md) paste.
3. **Implement** in **[moldovancsaba/sovereign](https://github.com/moldovancsaba/sovereign):** branch from `main`, merge via PR or direct push per your practice, run **`npm run verify`** (or validation named in the issue / Master Plan).
4. **Handover:** Append **[HANDOVER.md](../HANDOVER.md)** handover log (READMEDEV **70 PROTOCOL**); update **Implemented Now** / **Partially Implemented** if user-visible behaviour changed.
5. **Sync SSOT:** Tick **§4.1** for the LLD when PO accepts; update **§4.2** notes for extended and repo-first issues; for new §2.2 rows, add the issue link and project card when created.
6. **Close the loop on GitHub:** Close the **mvp-factory-control** issue (or comment engineering vs PO AC); align the **Projects** column with reality.

### 3.3 When the board, SSOT, and repo disagree

| Situation | What to treat as source of truth | Fix |
|-----------|-----------------------------------|-----|
| Issue closed but §4.1 still ☐ | SSOT should follow accepted work | Tick §4.1; ensure HANDOVER matches |
| §4.1 ☑ but issue still open | Usually issue should close | Close issue or reopen §4.1 with comment |
| Code on `main` not on board | §2.2 | Create issue + §2.2/§4.2 row + project card; then PO sign-off |
| Open board issue not listed in §2.1 | SSOT incomplete | Add §2.1 + §4.2 row |

### 3.1 MVP Factory Board (GitHub Projects)

- **Live project:** [MVP Factory Board](https://github.com/users/moldovancsaba/projects/1) — GitHub Projects **#1** on account **moldovancsaba** (portfolio board; many items are other products).
- **Filter for `{sovereign}`:** Use the board **Product** field (or search titles) so control-plane work is not mixed with Amanoba, `{reply}`, `{hatori}`, MessMass, etc.
- **LLD issue numbers (#437–#446):** Opened in **[moldovancsaba/mvp-factory-control](https://github.com/moldovancsaba/mvp-factory-control)** (planning repo), not in [moldovancsaba/sovereign](https://github.com/moldovancsaba/sovereign) (implementation repo). Extended `{sovereign}` issues **#432, #433, #436, #448–#450** — §2.1. **Repo-first PO acceptance:** **#447** (hybrid orchestrator v1) — §2.2.
- **Board vs SSOT:** §4.1 is the **planned** done/not-done view for **LLDs**. **GitHub issue state** should match §4.1 after each release (LLD-001…006 closed **2026-03-21** and match ☑; **#437** comment documents intentional legacy grep hits). **§4.2** tracks extended issues — use **Open/Closed** on GitHub as the live state and keep notes here in sync when priorities change.
- **Copy hygiene:** Issue bodies that used the `{sentinelsquad}` placeholder were batch-updated to `{sovereign}` on **mvp-factory-control** (2026-03-21), except where the text intentionally documents legacy strings.

---

## 4. Delivery checklist (PO use)

Use this to track that the plan is reflected on the board and to tick off completion. Updates to the plan (new LLD, reorder) require contract consensus and must be reflected here and in the Master Plan.

### 4.1 LLDs (Master Plan §2)

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

### 4.2 Extended backlog, repo-first shipments, and PO sign-off

| Item | Issue / link | GitHub state (2026-03) | PO / AC notes |
|------|----------------|-------------------------|---------------|
| OSS hardening | [#432](https://github.com/moldovancsaba/mvp-factory-control/issues/432) | Open | Align with [HANDOVER.md](../HANDOVER.md) “first-public OSS packaging polish” |
| Memory curation | [#433](https://github.com/moldovancsaba/mvp-factory-control/issues/433) | Open | Post–LLD-006 UX and workflows |
| Circuit breaker | [#436](https://github.com/moldovancsaba/mvp-factory-control/issues/436) | Open | Optional; tie acceptance to runtime metrics / failure modes |
| Hybrid orchestrator v1 | [#447](https://github.com/moldovancsaba/mvp-factory-control/issues/447) | Open | PO sign-off per issue AC; card on [MVP Factory Board](https://github.com/users/moldovancsaba/projects/1); `npm run verify` + API smoke |
| macOS install (sovereign repo trace) | [sovereign#22](https://github.com/moldovancsaba/sovereign/issues/22) | Closed | Delivered [PR #21](https://github.com/moldovancsaba/sovereign/pull/21); portfolio priority remains **[#432](https://github.com/moldovancsaba/mvp-factory-control/issues/432)** / **[#448](https://github.com/moldovancsaba/mvp-factory-control/issues/448)–[#450](https://github.com/moldovancsaba/mvp-factory-control/issues/450)** on the board |
| CI Docker Hub pull resilience (sovereign repo trace) | [sovereign#23](https://github.com/moldovancsaba/sovereign/issues/23) | Closed | Delivered on `main` ([`96a96f4`](https://github.com/moldovancsaba/sovereign/commit/96a96f4)); keeps portability gate aligned with board-driven releases |
| Mac mini greenfield runbook | [#448](https://github.com/moldovancsaba/mvp-factory-control/issues/448) | Closed | [MAC_MINI_DEPLOY.md](setup/MAC_MINI_DEPLOY.md); engineering validation 2026-03-27 (+ §8 note); reopen if field drill finds gaps |
| Operator-agnostic paths | [#449](https://github.com/moldovancsaba/mvp-factory-control/issues/449) | Closed | Run page, [BUILD_AND_RUN.md](BUILD_AND_RUN.md), CONTRIBUTING, API_V1, HANDOVER verify, IDE/settings homedir defaults |
| Sovereign.app clean install smoke | [#450](https://github.com/moldovancsaba/mvp-factory-control/issues/450) | Closed | [MACOS_APP_CLEAN_INSTALL_SMOKE.md](setup/MACOS_APP_CLEAN_INSTALL_SMOKE.md) — recorded smoke row 2026-03-27 |

### 4.3 Handover checkpoint (70 PROTOCOL)

*Updated **2026-03-27** — Mac mini track **[#448](https://github.com/moldovancsaba/mvp-factory-control/issues/448)** / **[#449](https://github.com/moldovancsaba/mvp-factory-control/issues/449)** / **[#450](https://github.com/moldovancsaba/mvp-factory-control/issues/450)** closed; implementation order remains the [MVP Factory Board](https://github.com/users/moldovancsaba/projects/1).*

| Area | Status | Next step |
|------|--------|-----------|
| LLD-007–010 | Open on board ([#443](https://github.com/moldovancsaba/mvp-factory-control/issues/443)–[#446](https://github.com/moldovancsaba/mvp-factory-control/issues/446)) | PO sign-off **#443** / **#447** when AC met |
| Mac mini deploy | **#448–#450** on [MVP Factory Board](https://github.com/users/moldovancsaba/projects/1) | **#448–#450** closed (2026-03-27); field follow-ups via **[#432](https://github.com/moldovancsaba/mvp-factory-control/issues/432)** if needed |
| Umbrella OSS / install | [#432](https://github.com/moldovancsaba/mvp-factory-control/issues/432) Open | Informed by **#448–#450** completion |
| Blockers | None recorded | — |

**Repo:** [moldovancsaba/sovereign](https://github.com/moldovancsaba/sovereign) branch `main` — confirm tip with `git log -1`. See [HANDOVER.md](../HANDOVER.md) log (2026-03-27 sync + 2026-03-26 **70 PROTOCOL**).

---

## 5. Change rule

- **Adding or removing a deliverable** (new LLD or dropping one): Change the [Master Plan](SOVEREIGN_MASTER_PLAN_AND_LLD.md) and this SSOT via the [contract change process](SOVEREIGN_AGENT_TEAM_CONTRACT.md#43-change-process-for-this-contract); then update the project board.
- **New `{sovereign}` issue on mvp-factory-control** that is **not** a new LLD: Add a row to **§2.1** and **§4.2** (and optionally the [MVP Factory Board](https://github.com/users/moldovancsaba/projects/1)). No Master Plan change unless you later promote it to an LLD.
- **Reordering or reprioritising:** Update §2 and Part D of the Master Plan; no contract change needed unless invariants or obligations change.
- **Clarifying acceptance or tests:** Update the Master Plan Part C for that LLD; optionally note in this doc if the checklist or mapping changes.

---

*Document owner: Product Owner. This SSOT is aligned with SOVEREIGN_AGENT_TEAM_CONTRACT.md and SOVEREIGN_MASTER_PLAN_AND_LLD.md.*
