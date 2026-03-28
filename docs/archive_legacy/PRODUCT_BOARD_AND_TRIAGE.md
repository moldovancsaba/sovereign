# Product Board Pipeline and Triage

**Source of truth** for the {sovereign} product board: pipeline stages, triage outcomes, and time language. The Agent Team and UI MUST follow this doc. Updates that change semantics require contract consensus (see [SOVEREIGN_AGENT_TEAM_CONTRACT.md](SOVEREIGN_AGENT_TEAM_CONTRACT.md)).

---

## 1. Pipeline stages (canonical order)

Items flow along the board in this order:

```
IDEABANK  →  BACKLOG  →  READY  →  IN_PROGRESS  →  IN_REVIEW  →  DONE
     ↑           │
     └───────────┴── CANCELLED (exit from any stage)

CRITICAL  =  immediate human intervention (can apply at any stage; see §3)
```

- **IDEABANK** — Exploratory or low-priority ideas; not yet committed to the execution pipeline. Mapped to backlog with “later” or triage outcome IDEABANK.
- **BACKLOG** — Committed to the board but not yet ready for execution.
- **READY** — Ready for execution; can be pulled by the agent team.
- **IN_PROGRESS** — Currently being worked on.
- **IN_REVIEW** — Work done; awaiting PO or agent review.
- **DONE** — Accepted and closed.
- **CANCELLED** — Removed from the pipeline without completion.

The **CRITICAL** path is not a column: it is a flag or triage outcome meaning “requires immediate human intervention.” Items marked CRITICAL are highlighted and escalated regardless of their status.

---

## 2. Mapping: HLD triage ↔ current schema

The old HLD used triage outcomes **IDEABANK**, **IN PROGRESS**, and **CRITICAL**. The current schema uses `BacklogItemStatus` (BACKLOG, READY, IN_PROGRESS, IN_REVIEW, DONE, CANCELLED). This section defines the mapping.

| HLD triage outcome | Schema / product meaning |
|--------------------|--------------------------|
| **IDEABANK** | Exploratory / low-priority. Map to: `BacklogItemStatus = BACKLOG` and optional goal or tag indicating “later” (or a dedicated `triageOutcome` field if added). Items the PO or JUDGE explicitly classifies as “ideabank” stay in BACKLOG with this semantic. |
| **IN PROGRESS** (triage) | Approved for execution. Map to: `BacklogItemStatus` in { READY, IN_PROGRESS, IN_REVIEW }. These are the “in the pipeline” states. |
| **CRITICAL** | Needs immediate human intervention. Map to: a **flag** on the item (e.g. `critical: boolean` on BacklogItem) or a separate triage outcome. JUDGE (or Controller) sets it; the PO dashboard and agent prompts highlight CRITICAL items. |

If a **triage outcome** field is added later (e.g. `triageOutcome: IDEABANK | IN_PROGRESS | CRITICAL`), it can sit alongside `BacklogItemStatus` to record JUDGE’s classification; workflow and display can use both.

**Current schema:** `BacklogItem` does not yet have a `critical` or `triageOutcome` field. CRITICAL and triage semantics are **product rules** (prompts, UI copy, and this doc) until a future LLD adds the schema extension.

---

## 3. Time language (philosophy)

{sovereign} uses **fuzzy temporal language** for goals and prioritisation, not economic or fiscal jargon.

### Use

- **now** — This cycle; immediate; current focus.
- **sooner** — Next; near-term; soon.
- **later** — Someday; backlog; not now.

Equivalents (allowed in product, UI, and agent prompts): “this cycle”, “next”, “near-term”, “someday”, “backlog”.

### Avoid

Do **not** use in product copy, UI labels, or agent prompts:

- **Q1, Q2, Q3, Q4**
- **H1, H2**
- **FY26, FY27**
- **Y26, Y27**
- Any other fiscal or calendar-quarter phrasing

Rationale: the product serves SMEs and product teams; “sooner / later / now” is clearer and avoids implying commitment to specific quarters or years.

### Implementation

- **Today:** This is a **product rule**. Enforce in PO/agent prompts and UI copy. The scrum-master agent and any backlog UI MUST use “now / sooner / later” (or equivalents) when discussing timing.
- **Optional later:** Add a `timeHorizon` to **BacklogGoal** (e.g. enum `NOW | SOONER | LATER`) so the board and API can filter and phrase in fuzzy terms. Until then, time language is enforced in prose and prompts only.

---

## 4. References

- **Contract:** [SOVEREIGN_AGENT_TEAM_CONTRACT.md](SOVEREIGN_AGENT_TEAM_CONTRACT.md) — backlog and triage follow this product board doc.
- **ADR (local backlog):** [architecture/0003-local-backlog-and-po-experience.md](architecture/0003-local-backlog-and-po-experience.md).
- **HLD gap analysis:** [HLD_FEEDBACK_AND_GAP_ANALYSIS.md](HLD_FEEDBACK_AND_GAP_ANALYSIS.md) §2.2 points here for pipeline and mapping.
