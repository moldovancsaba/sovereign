# {sovereign} Delivery Playbook (one page)

**Purpose:** How to run delivery against the plan with a clear SSOT and fine-tuned rhythm. Use with [SOVEREIGN_PROJECT_BOARD_SSOT.md](SOVEREIGN_PROJECT_BOARD_SSOT.md) and [SOVEREIGN_MASTER_PLAN_AND_LLD.md](SOVEREIGN_MASTER_PLAN_AND_LLD.md).

**End-to-end steps (repo + board + docs):** [SOVEREIGN_PROJECT_BOARD_SSOT.md](SOVEREIGN_PROJECT_BOARD_SSOT.md) §3.2. **When SSOT and GitHub disagree:** SSOT §3.3.

---

## 1. Phases and order

| Phase | LLDs | Goal |
|-------|------|------|
| **Phase 1** | 001, 002, 003 | Rename done; Kanban visible; scrum-master can change backlog from chat. |
| **Phase 2** | 004, 005, 006, 008, 009, 010 | JUDGE, MCP backlog, memory extension, self-improvement policy, Theia panels, provider abstraction. |
| **Phase 3** | 007 | Wiki/docs + MCP resources (after 006). |

**Order within Phase 1:** 001 → 002 → 003.  
**Phase 2:** 004, 005, 006, 008, 009, 010 can run in parallel where capacity allows; 007 after 006.

---

## 2. Sprint / cycle rhythm

1. **Start of cycle:** From [SOVEREIGN_PROJECT_BOARD_SSOT.md](SOVEREIGN_PROJECT_BOARD_SSOT.md) §2 (LLDs) and §2.1 (extended issues), pick the next item by phase and dependency (e.g. Phase 1 done → pick from Phase 2 or an open extended issue).
2. **Ensure issue exists on board:** If the LLD is not yet on mvp-factory-control, create it from [SOVEREIGN_ISSUE_TEMPLATE_MVP_FACTORY_CONTROL.md](SOVEREIGN_ISSUE_TEMPLATE_MVP_FACTORY_CONTROL.md) (copy title + body for that LLD). Add labels (`{sovereign}`, P0/P1/P2) and set "Depends on" per SSOT.
3. **Update SSOT checklist:** In SSOT §4, fill "Issue(s) on board" (e.g. link or issue number) for that LLD.
4. **Execute:** Work the issue; validate per the LLD table (test cases, edge cases, validation commands).
5. **Done:** When the issue is accepted/done, tick "Done" in SSOT §4. Then pick the next LLD for the next cycle.

**When in doubt:** Contract → Master Plan → Product Board doc → SSOT. Do not add or remove deliverables without the contract change process.

---

## 3. Creating an issue from the template

1. Open [SOVEREIGN_ISSUE_TEMPLATE_MVP_FACTORY_CONTROL.md](SOVEREIGN_ISSUE_TEMPLATE_MVP_FACTORY_CONTROL.md).
2. Find the LLD block (e.g. LLD-002).
3. Copy **Issue title** and **Issue body** (the markdown under it) into a new issue in mvp-factory-control.
4. Add labels and "Depends on" (issue links or "Depends: LLD-00x" in description).
5. In [SOVEREIGN_PROJECT_BOARD_SSOT.md](SOVEREIGN_PROJECT_BOARD_SSOT.md) §4, write the new issue id/link in "Issue(s) on board" for that LLD.

---

## 4. When to update which doc

| Change | Update |
|--------|--------|
| New or removed deliverable (new LLD, drop one) | Contract change process → Master Plan Part C + Part D → SSOT §2 and §4. Then board. |
| Reorder or reprioritise (same set, different order) | Master Plan Part D + SSOT §2. No contract change. |
| Clarify acceptance criteria or tests for one LLD | Master Plan Part C for that LLD. Optionally template doc if you want pasted issues to match. |
| Issue created or done on board | SSOT §4 (Issue(s) on board, Done). |
| Product board semantics (pipeline, triage, time language) | [PRODUCT_BOARD_AND_TRIAGE.md](PRODUCT_BOARD_AND_TRIAGE.md); contract consensus if it affects invariants. |

---

## 5. Quick reference

- **SSOT (what’s on the board):** [SOVEREIGN_PROJECT_BOARD_SSOT.md](SOVEREIGN_PROJECT_BOARD_SSOT.md)
- **Full LLD (scope, tests, edges):** [SOVEREIGN_MASTER_PLAN_AND_LLD.md](SOVEREIGN_MASTER_PLAN_AND_LLD.md) Part C
- **Ready-to-paste issue bodies:** [SOVEREIGN_ISSUE_TEMPLATE_MVP_FACTORY_CONTROL.md](SOVEREIGN_ISSUE_TEMPLATE_MVP_FACTORY_CONTROL.md)
- **Contract (invariants, change process):** [SOVEREIGN_AGENT_TEAM_CONTRACT.md](SOVEREIGN_AGENT_TEAM_CONTRACT.md)
- **Product board (backlog pipeline, sooner/later/now):** [PRODUCT_BOARD_AND_TRIAGE.md](PRODUCT_BOARD_AND_TRIAGE.md)

---

*Document owner: Product Owner. One-page companion to SOVEREIGN_PROJECT_BOARD_SSOT.md.*
