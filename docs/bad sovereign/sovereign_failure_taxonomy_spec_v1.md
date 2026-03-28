# {sovereign} - Failure Taxonomy Specification

**Status:** Foundational Normative Specification  
**Version:** v1.0  
**Date:** 2026-03-27  
**Scope:** Canonical failure classes, diagnostic rules, attribution logic, severity interpretation, and routing implications across `{sovereign}`

---

## 1. Purpose

This document defines the failure taxonomy of `{sovereign}`.

It answers the system question:

> **When something goes wrong, how does `{sovereign}` classify it, reason about it, route it, and learn from it without collapsing into vague error language?**

Without a formal failure taxonomy:

- retries become noisy
- diagnostics become anecdotal
- root-cause tracking becomes inconsistent
- calibration cannot compare failure patterns across runs
- memory learns the wrong lessons
- assurance cannot distinguish weak output from weak governance
- metabolic waste cannot be measured properly

This document therefore defines the shared failure language of the system.

---

## 2. Reader Orientation

A failure taxonomy is not just an error list.

In `{sovereign}`, failure classification is used to:
- decide whether a retry is sensible
- decide whether a reroute is needed
- decide whether escalation is required
- decide whether a `RootCauseTicket` should be opened
- distinguish local quality weakness from policy, memory, or execution failure
- measure waste and recurrence

This document is normative because inconsistent failure naming would degrade the entire foundation set.

---

## 3. Core Thesis

The core thesis is:

> **A system cannot learn from failure unless it names failure precisely enough to act on it.**

That means:
- every meaningful failure SHALL be assigned a primary failure class
- secondary failure attribution MAY be added when needed
- failure classes SHALL reflect both *what failed* and *where remediation should begin*
- failure language SHALL remain stable enough to support analytics, recurrence tracking, and calibration

---

## 4. Normative Language

- **SHALL / SHALL NOT** → mandatory requirement
- **SHOULD / SHOULD NOT** → strong default
- **MAY** → permitted option

---

## 5. Canonical Terminology Reference

This document defers to:
- `sovereign_canonical_vocabulary_v1.md`
- `sovereign_constitutional_invariants_v1.md`

Where shared terms appear here, the canonical vocabulary and invariants remain authoritative.

---

## 6. Design Principles

| Principle | Meaning |
| --- | --- |
| **One primary failure** | Every failed or partial governed outcome SHALL have exactly one primary failure class. |
| **Optional secondary attribution** | A secondary class MAY be used when the failure crosses domains. |
| **Actionability** | Classes SHALL be meaningful for routing, retrying, escalating, or repairing. |
| **Stability** | Failure names SHOULD remain stable across experiments so comparisons remain valid. |
| **Layer awareness** | The taxonomy SHOULD distinguish production, assurance, memory, policy, communication, and execution failures. |
| **Separation of symptom and cause** | The immediate failure class SHALL NOT be confused with the ultimate root cause. |
| **Constitutional fit** | Failure classification SHALL remain consistent with risk policy, workflow states, and interface objects. |

---

## 7. Failure Model Overview

### 7.1 Human explanation

Not all failures are the same.

Some failures are about the content itself.  
Some are about runtime or formatting.  
Some are about governance, permissions, or policy.  
Some are about wrong context, wrong memory, or missing evidence.  
Some are local and retryable. Others are systemic and should trigger tickets, reroutes, or escalation.

The taxonomy therefore separates failures into major families first, then into canonical classes.

### 7.2 Major failure families

| Family | Meaning |
| --- | --- |
| **Content failures** | The produced artifact or recommendation is weak or unacceptable in substance. |
| **Context failures** | The system lacked, misread, or misapplied context or memory. |
| **Governance failures** | Policy, assurance, approval, or authority boundaries were violated or insufficient. |
| **Interaction failures** | Communication, channel, or audience handling was wrong. |
| **Execution failures** | Execution path, environment, or operational action failed. |
| **Infrastructure failures** | Formatting, dependency, timeout, or runtime substrate failed. |

---

## 8. Canonical Failure Classes

### 8.1 Content failures

| Failure class | Meaning |
| --- | --- |
| `grounding_failure` | Output lacks support relative to available evidence or context. |
| `structure_failure` | Output is poorly organized, incoherent, or structurally unfit for purpose. |
| `completeness_failure` | Required parts, constraints, or coverage elements are missing. |
| `language_failure` | Output is unclear, imprecise, malformed, or linguistically unfit for use. |
| `usefulness_failure` | Output is technically present but not practically useful for the requested goal. |

### 8.2 Context failures

| Failure class | Meaning |
| --- | --- |
| `context_retrieval_failure` | Relevant context was not retrieved when needed. |
| `context_application_failure` | Retrieved context existed but was applied incorrectly. |
| `memory_scope_failure` | Wrong memory scope was used, or memory was applied beyond its allowed scope. |
| `memory_quality_failure` | Stored memory was stale, misleading, contradictory, or low-confidence in a consequential way. |
| `evidence_sufficiency_failure` | The system proceeded with insufficient supporting evidence for the intended consequence level. |

### 8.3 Governance failures

| Failure class | Meaning |
| --- | --- |
| `policy_failure` | Output or action violates policy, safety, or rule constraints. |
| `risk_assignment_failure` | Risk was assigned incorrectly or too weakly relative to consequence. |
| `assurance_failure` | Required assurance did not pass or was materially inadequate. |
| `approval_failure` | Required review or approval boundary was missing, invalid, or not satisfied. |
| `authority_failure` | A component acted beyond its constitutional authority. |

### 8.4 Interaction failures

| Failure class | Meaning |
| --- | --- |
| `channel_failure` | The wrong channel, format, or delivery mode was selected. |
| `audience_failure` | The output was inappropriate for the recipient class or audience. |
| `dispatch_failure` | Approved communication consequence failed to dispatch or was misrouted. |

### 8.5 Execution failures

| Failure class | Meaning |
| --- | --- |
| `execution_planning_failure` | The proposed execution path was invalid, unsafe, or unfit. |
| `execution_runtime_failure` | An approved execution failed during runtime. |
| `environment_failure` | The environment, tool, or runtime boundary could not support the requested operation. |
| `reversibility_failure` | The action path assumed reversibility that did not exist or was weaker than expected. |

### 8.6 Infrastructure failures

| Failure class | Meaning |
| --- | --- |
| `runtime_failure` | Underlying process or component failed unexpectedly. |
| `timeout_failure` | Time budget expired before useful completion. |
| `format_failure` | Object shape, schema, or serialization was invalid. |
| `dependency_failure` | Required external or internal dependency was unavailable or incompatible. |

---

## 9. Primary and Secondary Classification Rules

### 9.1 Primary failure rule

Every failed or materially partial governed outcome SHALL receive exactly one **primary failure class**.

### 9.2 Secondary failure rule

A secondary failure class MAY be added when:
- two failure modes are materially entangled
- the visible failure differs from the probable upstream cause
- routing and remediation both benefit from dual labeling

### 9.3 Example

An external email draft that is beautifully written but based on stale customer memory MAY be classified as:

- primary: `memory_quality_failure`
- secondary: `usefulness_failure`

The primary class identifies where remediation should begin.  
The secondary class records the visible symptom or additional damage.

---

## 10. Failure Severity

### 10.1 Human explanation

Failure class and failure severity are not the same.

A `format_failure` MAY be trivial in one context and serious in another.  
A `policy_failure` is usually more severe constitutionally, but severity still depends on risk class and consequence proximity.

### 10.2 Severity levels

| Severity | Meaning |
| --- | --- |
| `minor` | cheap, local, easily reversible, little systemic impact |
| `moderate` | meaningful defect, but bounded and recoverable |
| `major` | strong impact on outcome quality, governance, or trust |
| `critical` | unacceptable at constitutional level; immediate escalation or block likely |

### 10.3 Severity factors

Severity SHOULD be influenced by:
- risk class
- consequence proximity
- reversibility
- audience exposure
- recurrence
- evidence insufficiency
- blast radius

---

## 11. Retry, Reroute, Escalate, or Block

### 11.1 Human explanation

Failure classification exists to inform action.  
The point is not naming failure for its own sake. The point is deciding the next move.

### 11.2 Typical response map

| Failure class family | Default response posture |
| --- | --- |
| content failure | retry or revise locally first |
| context failure | reroute to `{hatori}` / `{meimei}` / `{messmass}` depending on cause |
| governance failure | escalate or block |
| interaction failure | reroute through `{reply}` or revise audience/channel assumptions |
| execution failure | block, reroute, or retry only if safe |
| infrastructure failure | retry or reroute to runtime repair path |

### 11.3 Constitutional rule

The same failure SHALL NOT be retried blindly when:
- the same primary class repeats without meaningful improvement
- risk class is high and the failure affects governance, policy, or approval boundaries
- retry return is collapsing
- a stronger trust boundary is required

---

## 12. Failure Attribution by Plane

### 12.1 Human explanation

Failure class and plane ownership are related but distinct.

A `usefulness_failure` MAY emerge in `{trinity}` but originate from weak task framing in `{meimei}`.  
A `policy_failure` MAY be detected by `{tribeca}` but caused by production or routing choices earlier in the chain.

### 12.2 Attribution model

Every failure record SHOULD capture:

- `primaryFailureClass`
- `secondaryFailureClass` if present
- `detectedBy`
- `suspectedOriginPlane`
- `currentPlane`
- `confidence`

### 12.3 Typical origin hints

| Failure class | Common origin plane(s) |
| --- | --- |
| `grounding_failure` | `{hatori}`, `{messmass}`, `{trinity}` |
| `structure_failure` | `{trinity}` |
| `completeness_failure` | `{meimei}`, `{zeno}`, `{trinity}` |
| `policy_failure` | `{trinity}`, `{reply}`, `{playground}`, `{zeno}` |
| `risk_assignment_failure` | `{zeno}` |
| `assurance_failure` | `{tribeca}` or the provisional output entering assurance |
| `memory_quality_failure` | `{hatori}` |
| `channel_failure` | `{reply}`, `{zeno}` |
| `execution_runtime_failure` | `{playground}` |
| `format_failure` | interface/runtime layer |

This table is diagnostic guidance, not absolute truth.

---

## 13. Relationship to Workflow State

Different failures tend to surface at different states.

| Workflow state | Common failure surfaces |
| --- | --- |
| `CLASSIFIED` | `risk_assignment_failure`, `policy_failure` |
| `CONTEXTUALIZED` | `context_retrieval_failure`, `memory_scope_failure`, `evidence_sufficiency_failure` |
| `PLANNED` | `execution_planning_failure`, `authority_failure` |
| `IN_PRODUCTION` | `structure_failure`, `completeness_failure`, `language_failure` |
| `UNDER_LOCAL_REVIEW` | content failures, `usefulness_failure` |
| `UNDER_ASSURANCE` | `policy_failure`, `assurance_failure`, `approval_failure` |
| `APPROVED_FOR_DISPATCH` / `DISPATCHED` | `channel_failure`, `dispatch_failure` |
| `EXECUTING` | `execution_runtime_failure`, `environment_failure`, `reversibility_failure` |

This mapping SHOULD guide debugging and event interpretation.

---

## 14. Relationship to Risk Policy

Failure classification SHALL remain subordinate to risk policy.

### 14.1 Rule hierarchy

1. policy constraints
2. risk class requirements
3. assurance boundary requirements
4. workflow guards
5. failure classification
6. retry optimization preferences

### 14.2 Consequence

A `minor` content failure in R0 MAY be locally retried.  
A governance failure in R4 SHALL trigger stronger escalation regardless of how “small” it appears locally.

---

## 15. Relationship to RootCauseTicket

The failure taxonomy and `RootCauseTicket` are distinct but coupled.

- the taxonomy names the failure
- the ticket records the durable remediation object

### 15.1 Ticketing rule

A `RootCauseTicket` SHOULD be opened when:
- the same primary failure class recurs
- the failure likely originates upstream
- the issue cannot be solved locally without changing memory, policy, routing, or task framing
- the failure has systemic diagnostic value

---

## 16. Relationship to Scoring and Calibration

Failure language and score language are not the same.

- scores summarize quality dimensions
- failure classes describe breakdown modes

### 16.1 Mapping examples

| Failure class | Common score signature |
| --- | --- |
| `grounding_failure` | low grounding |
| `structure_failure` | low structure |
| `completeness_failure` | low completeness |
| `language_failure` | low language |
| `usefulness_failure` | low usefulness |
| `policy_failure` | low policy |

### 16.2 Important limit

A score pattern MAY suggest a failure class, but it SHALL NOT be treated as perfect proof.  
Failure classification SHOULD remain explicit, not inferred silently.

---

## 17. Relationship to Metabolism

Failure classes are one of the main sources of measurable waste.

### 17.1 Rule

The system SHOULD use failure classes to attribute waste into at least:

- rejected content waste
- repeated retry waste
- assurance waste
- dispatch/execution waste
- unresolved root-cause waste

### 17.2 Why

Without failure attribution, the metabolism layer would know cost but not know where to intervene.

---

## 18. Worked Examples

### 18.1 R1 internal summary missing key decisions
- likely class: `completeness_failure`
- response: local revise / retry
- escalation: not required by class alone

### 18.2 R2 external email draft built on stale memory
- primary: `memory_quality_failure`
- secondary: `usefulness_failure`
- response: reroute to context/memory repair, then regenerate
- assurance: still required before dispatch consequence

### 18.3 R3 deployment candidate blocked by policy
- primary: `policy_failure`
- response: block or escalate
- retry: local rewrite alone is insufficient if policy conflict remains

### 18.4 R4 healthcare-sensitive recommendation lacking adequate evidence
- primary: `evidence_sufficiency_failure`
- response: escalation and likely block pending stronger evidence
- consequence: no autonomous finalization

---

## 19. Invariants

1. every failed or materially partial governed outcome SHALL have exactly one primary failure class
2. secondary failure class MAY be used, but SHALL NOT replace the primary class
3. failure class SHALL remain distinct from root cause, even when related
4. failure classification SHALL remain consistent with workflow state and risk policy
5. failure naming SHALL be stable enough for analytics and recurrence tracking
6. governance and approval failures SHALL NOT be downgraded into mere content failures

---

## 20. Integration With Other Specs

- **Foundation** provides the ideology and constitutional fit of failure-as-learning.
- **Risk policy** determines how failure severity interacts with consequence boundaries.
- **Workflow state machine** determines where specific failures tend to surface.
- **Interface contract** will serialize failure-related objects and references.
- **Score/calibration** provides evaluative signals that MAY inform but not replace failure classification.
- **RootCauseTicket spec** will define the durable remediation object linked to classified failures.

---

## 21. Conclusion

The purpose of the failure taxonomy is not to produce more labels.  
It is to make failure operationally legible.

`{sovereign}` SHALL:
- classify failure precisely
- route failure intelligently
- distinguish symptom from source
- and preserve enough structure to learn from repeated breakdowns
