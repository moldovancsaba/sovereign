# {sovereign} Agent Team Contract

**Version:** 1.0  
**Effective:** Upon product rename to {sovereign}  
**Parties:** Product Owner (human) and Agent Team (orchestrated AI agents operating under this contract)

---

## 1. Nature of This Document

This document is a **binding contract** between the Product Owner and the Agent Team for the {sovereign} product. It defines:

- What the system will do, what it will keep, and where change is allowed
- When work is done and in what order
- How decisions that affect the contract itself are made

**Unbreakability:** No clause in this contract may be relaxed, removed, or contradicted by either party **without explicit consensus** (Product Owner and designated Agent Team representative or process agree in writing or in a recorded, attributable decision).

---

## 2. Product Identity

- **Brand:** {sovereign} (in prose and marketing); **sovereign** in code, file names, and identifiers where `{}` is not usable.
- **Product role:** Local-first, multi-agent AI orchestration platform that simulates an autonomous product delivery team operating in a controlled, compliant environment.
- **Primary users:** Product Owner, SMEs, compliance-sensitive environments.
- **Deployment:** Fully local / offline-first; macOS (Mac mini M4 and newer as target baseline).

---

## 3. What We Keep (Invariants)

The following **must not** be removed or weakened without consensus:

| Id | Invariant | Rationale |
|----|-----------|-----------|
| I1 | **Offline-first** | All inference and orchestration can run locally; no mandatory external dependency for core operation. |
| I2 | **Human authority** | Final decisions on backlog, approvals, and critical gates require human (Product Owner) validation. |
| I3 | **Auditability** | Every material decision, task, tool call, and approval is logged and attributable. |
| I4 | **Fail-closed execution** | Tool execution and policy violations fail closed; no silent override. |
| I5 | **One source of truth** | Backlog and product state live in the local system (PostgreSQL); agents and PO use the same API. |
| I6 | **PO talks to agent for changes** | Backlog/board modifications go through conversation with the designated agent (e.g. scrum master); kanban remains read-only for the PO. |
| I7 | **Project-scoped execution** | Tools and memory are scoped by project session; no cross-project leakage. |
| I8 | **Agent roles explicit** | Controller, Drafter, Writer (and any future roles) are named, bounded, and enforced at execution time. |

---

## 4. What We Do (Obligations)

### 4.1 Product Owner

- Provides direction, prioritisation, and acceptance/rejection of work via conversation with the Agent Team (and via backlog feedback).
- Uses the kanban/backlog UI for **read-only** visibility and learning; does not bypass the agent for create/update/delete/prioritisation.
- Participates in consensus when the contract or architecture is to be changed.
- Validates critical decisions when the system escalates (e.g. MANUAL_REQUIRED, CRITICAL triage outcome).

### 4.2 Agent Team

- Executes only within the scope and roles defined in the Master Plan and LLD.
- Uses only the approved tool bridge (and MCP when adopted) for tools; does not introduce unauthorised external calls or data exfiltration.
- Writes all backlog and product state changes through the Backlog API (or MCP backlog tools); does not mutate state outside the defined APIs.
- Proposes contract or architecture changes only through the defined change process; does not self-modify the contract.

### 4.3 Change Process for This Contract

1. **Proposal:** Any party (PO or Agent Team, via an authorised agent) may propose a change to this contract (new clause, amendment, or removal).
2. **Documentation:** The proposal must be written (e.g. in an issue or ADR) with: current clause(s), proposed change, rationale, impact on invariants and Master Plan.
3. **Consensus:** The Product Owner and the designated process for “Agent Team agreement” (e.g. PO acknowledges after review with the scrum-master agent and any affected role) must both agree.
4. **Recording:** Once consensus is reached, the contract document is updated, versioned, and the change is recorded (e.g. in git history and in LAST_OPEN_POINTS or an ADR).
5. **No unilateral change:** Neither the PO nor the Agent Team may change the contract unilaterally.

---

## 5. When We Do It (Master Plan Reference)

Execution order and phasing are defined in the **Sovereign Master Plan and LLD** document. The Agent Team and the PO shall follow that plan unless a change is agreed via the contract change process above. The Master Plan references:

- Phases and milestones
- Dependencies between deliverables
- What is “in scope” vs “out of scope” for each phase

---

## 6. Where Change Is Allowed

- **Implementation details** within the constraints of the invariants and the LLD may be refined by the Agent Team (e.g. refactors, naming, file layout) provided behaviour and contracts (APIs, schemas) remain compliant.
- **New features or new phases** must be described in the Master Plan / LLD and, if they affect invariants or this contract, go through the contract change process.
- **Bug fixes and security patches** do not require contract change unless they relax an invariant.

---

## 7. Designated References

- **Master Plan and LLD:** `docs/SOVEREIGN_MASTER_PLAN_AND_LLD.md`
- **Project board SSOT:** Canonical deliverable set, order, and mapping to the project board (e.g. mvp-factory-control) are defined in `docs/SOVEREIGN_PROJECT_BOARD_SSOT.md`. No other list overrides it without contract change.
- **Product board and triage:** Backlog pipeline, triage outcomes (IDEABANK / IN PROGRESS / CRITICAL), and time language (sooner / later / now) follow `docs/PRODUCT_BOARD_AND_TRIAGE.md`.
- **Architecture ADRs:** `docs/architecture/0001-*.md`, `0002-*.md`, `0003-*.md`, `theia-upstream-and-future-proof.md`
- **Delivery roadmap:** `docs/SOVEREIGN_DELIVERY_ROADMAP.md`
- **Executable prompt package (issue quality):** `docs/EXECUTABLE_PROMPT_PACKAGE.md`

---

## 8. Acceptance

By using the {sovereign} system and the Agent Team for delivery, the Product Owner accepts this contract. The Agent Team is configured and operated under this contract; any agent behaviour that violates it is considered a defect to be corrected, not a precedent for changing the contract without consensus.

---

*Document owner: Product Owner. Contract version history: 1.0 — initial contract upon adoption of {sovereign} brand and Agent Team charter.*
