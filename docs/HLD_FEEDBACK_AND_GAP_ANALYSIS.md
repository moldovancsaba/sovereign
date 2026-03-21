# HLD Feedback and Gap Analysis

**Reference:** Your older document “SOVEREIGN — High-Level Design (HLD) Version 0.1 (Concept Definition)”.  
**Context:** You and I have since worked on the system in parallel (local backlog, PO experience, Theia, MCP, contract, LLD). This note compares the old HLD to the **current** design and calls out ideas we did not yet fully adopt, plus feedback.

---

## 1. What already aligns (HLD vs current)

| HLD concept | Current state |
|-------------|----------------|
| Offline-first, local-first | Implemented and in contract. |
| Multi-agent orchestration | Controller / Drafter / Writer; unified transcript; role enforcement. |
| Human authority, human-in-the-loop | In contract; PO approval; backlog feedback; MANUAL_REQUIRED. |
| Auditability, traceability | ChatEvent, task lifecycle, audit tables; fail-closed. |
| DRAFTER → WRITER (structured intake, decomposition) | Drafter and Writer roles exist; structured task and prompt package. |
| Sentinel Squad (Dev / QA / Refactor / Ops) | Execution core is the agent team; QA/Refactor/Ops as **expansion** (Phase 2+) in roadmap. |
| MLX, Ollama, OpenClaw | In stack; Ollama primary; MLX and OpenClaw optional; provider abstraction in progress. |
| MCP | Adopted; standardise tool bridge and backlog/docs via MCP. |
| Annotation & knowledge | Project memory; moving to types, provenance, pgvector; wiki ingestion planned. |
| macOS, Apple Silicon | Target platform; MLX for Apple Silicon. |
| Compliance (GDPR, NIS2, PII) | “Compliance by design” in HLD; we have local data, audit, no external transfer—explicit regulatory mapping not yet written. |

---

## 2. Ideas from the HLD we have not fully considered (gaps)

### 2.1 JUDGE and Confidence Engine (explicit)

- **HLD:** Triage pipeline is DRAFTER → WRITER → **JUDGE**; JUDGE outputs Vote (Approve / Reject / Escalate) and **Confidence Score (0–1)**.
- **Current:** We have “final-judgement” semantics and optional operator review; no **named JUDGE** role and no **first-class confidence score** in the data model.
- **Gap:** Add an explicit JUDGE step (or Controller sub-step) that produces a structured output: `vote`, `confidence` (0–1), `reason`; store on task or event; use for escalation and PO dashboard.
- **Suggestion:** Covered in LLD-004 (final-judgement / JUDGE). Add a `confidence` field to the judgement record and, optionally, a small “confidence engine” that aggregates or thresholds (e.g. escalate if confidence &lt; 0.7).

### 2.2 Output classification: IDEABANK / IN PROGRESS / CRITICAL

- **HLD:** After triage, items go to IDEABANK (low priority / exploratory), IN PROGRESS (approved for execution), or CRITICAL (immediate human intervention).
- **Current:** We have BacklogItemStatus (BACKLOG, READY, IN_PROGRESS, IN_REVIEW, DONE, CANCELLED) and task states (QUEUED, RUNNING, DONE, FAILED, MANUAL_REQUIRED).
- **Gap:** We do not have “IDEABANK” as a **triage outcome** (exploratory bucket) or “CRITICAL” as a **triage outcome** (requires immediate human intervention). MANUAL_REQUIRED is close to CRITICAL but not the same as a triage classification.
- **Suggestion:** Either (a) add a **triage outcome** (e.g. on BacklogItem or on a separate triage record): IDEABANK | IN_PROGRESS | CRITICAL, and drive workflow from that; or (b) map explicitly: BACKLOG + low priority = IDEABANK, READY/IN_PROGRESS = IN PROGRESS, and a new CRITICAL status or tag for “immediate human intervention”. **Pipeline and mapping are defined in [PRODUCT_BOARD_AND_TRIAGE.md](PRODUCT_BOARD_AND_TRIAGE.md).**

### 2.3 Structured Task Object (STO) and Execution Plan (EP)

- **HLD:** DRAFTER outputs a “Structured Task Object (STO)”; WRITER decomposes into “Execution Plan (EP)” (technical tasks, dependencies, required tools/agents).
- **Current:** We have task payloads, prompt packages, and task graph; we do not **name** these as STO and EP or define them as first-class schema.
- **Gap:** Formalising STO and EP would improve traceability and give JUDGE a clear artifact to evaluate.
- **Suggestion:** In LLD or ADR, define: (1) **STO** = the normalised output of the Drafter (e.g. JSON shape: intent, scope, constraints, acceptance); (2) **EP** = the Writer’s output (list of technical steps, dependencies, tool/agent assignments). Store STO/EP on task or in TaskPromptPackageInvariant; reference in JUDGE step. This can be a follow-on issue after LLD-004.

### 2.4 Compliance: explicit regulatory mapping

- **HLD:** Table for GDPR, NIS2, PII handling.
- **Current:** We are local-first, no external transfer, audit logs—implicitly aligned; we have not written a short “Compliance” section that maps controls to regulations.
- **Gap:** No single doc that says “GDPR: we do X; NIS2: we do Y; PII: we do Z.”
- **Suggestion:** Add a `docs/COMPLIANCE.md` (or section in ADR): one page mapping our controls (local processing, no transfer, encryption at rest if any, audit, access control) to GDPR/NIS2/PII. Helps compliance-sensitive customers and aligns with HLD.

### 2.5 VS Code ecosystem vs Theia

- **HLD:** “VS Code Ecosystem Integration”, extension compatibility, developer workflow.
- **Current:** We chose **Eclipse Theia** as the desktop shell; Theia supports VS Code extensions via Open VSX.
- **Gap:** None; this is a deliberate evolution. HLD’s “VS Code” is satisfied by “Theia + VS Code–compatible extensions” and our Theia panels.

### 2.6 Deterministic orchestration and “no emergent behaviour”

- **HLD:** “Deterministic orchestration; controlled workflows over emergent behaviour.”
- **Current:** We have role enforcement, fail-closed policy, and explicit handoffs; we have not stated “deterministic” as a non-functional requirement.
- **Suggestion:** Add to contract or NFRs: “Orchestration is deterministic where possible: same inputs and policy yield same routing and gate outcomes; non-determinism is limited to model inference and is bounded by approval gates.” This captures the HLD intent.

---

## 3. Feedback (summary)

- **Keep from HLD:** Triage pipeline (DRAFTER → WRITER → JUDGE), confidence score, IDEABANK/IN PROGRESS/CRITICAL, STO/EP as named artifacts, explicit compliance mapping, and “deterministic orchestration” as an NFR. All of these can be adopted incrementally without breaking the current contract.
- **Already better in current design:** (1) **PO experience:** HLD does not specify “talk to agent to modify backlog, board read-only”; we did. (2) **Local backlog:** HLD does not say “fully local board, no GitHub”; we have it. (3) **MCP:** We standardised on MCP; HLD only mentions it. (4) **Theia:** We have a clear desktop strategy and upstream plan.
- **Suggested next steps:** (1) Implement LLD-004 (JUDGE + confidence). (2) Optionally add triage outcome (IDEABANK / IN PROGRESS / CRITICAL) and STO/EP in a follow-on. (3) Add `docs/COMPLIANCE.md` with regulatory mapping. (4) Add “deterministic orchestration” to NFRs in contract or roadmap.

---

*This analysis treats the HLD as the older concept definition; the current source of truth for behaviour and scope is the SOVEREIGN_AGENT_TEAM_CONTRACT and SOVEREIGN_MASTER_PLAN_AND_LLD.*
