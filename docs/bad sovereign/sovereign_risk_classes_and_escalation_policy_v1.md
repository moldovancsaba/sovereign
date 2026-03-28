# {sovereign} - Risk Classes and Escalation Policy (Normalized)

**Status:** Foundational Normative Specification  
**Version:** v1.0  
**Date:** 2026-03-27  
**Scope:** Constitutional risk classification, automation ceilings, escalation logic, and assurance requirements for `{sovereign}`

---

## 1. Purpose

This document defines the risk model of `{sovereign}`.

It answers the system question:

> **What is allowed to happen autonomously, under what conditions, with which validators, and when must the system escalate?**

---

## 2. Reader Orientation

This document is primarily normative.  
It defines the decision boundary between intelligence and consequence.

---

## 3. Core Thesis

Automation in `{sovereign}` SHALL scale with:
- reversibility
- consequence
- sensitivity
- evidence sufficiency
- blast radius

Confidence alone SHALL NOT determine permission.

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

Shared terms such as assurance, approval, consequence, dispatch, deployment, review, and archival SHALL use those definitions.

---

## 6. Design Principles

| Principle | Meaning |
| --- | --- |
| Risk precedes automation | class first, autonomy second |
| Escalation is proportional | more consequence requires stronger review |
| Risk is sticky upward | automatic elevation MAY occur; silent demotion SHALL NOT |
| Local confidence is insufficient | score does not equal permission |
| Reversibility matters | reversible work tolerates more automation |
| Context matters | same operation MAY change class depending on audience, scope, or downstream effect |

---

## 7. Risk Dimensions

Tasks SHOULD be classified along these dimensions:

- consequence
- reversibility
- sensitivity
- exposure
- authority effect
- evidence sufficiency
- blast radius

`{zeno}` SHALL assign an initial risk class.  
`{tribeca}` MAY raise it.  
Production components SHALL NOT lower it automatically.

---

## 8. Risk Classes

### 8.1 R0 — Trivial / Reversible
Low-value, local, easily reversible work.

Examples:
- formatting cleanup
- internal paraphrase
- sandbox-only experiment with no side effects

### 8.2 R1 — Low-Risk Operational
Routine work that matters but remains operationally contained.

Examples:
- internal summaries
- internal notes
- low-sensitivity memory candidates
- internal drafts not yet sent

### 8.3 R2 — Medium-Risk Business
Business-relevant work with moderate impact or external-facing relevance.

Examples:
- external communication drafts
- stakeholder-facing recommendations
- moderate-impact routing outputs
- durable personalization candidates

### 8.4 R3 — High-Risk Governed
High-impact work with substantial operational, trust, or compliance implications.

Examples:
- customer-impacting actions
- production deployment candidates
- sensitive durable memory writes
- permission-affecting decisions

### 8.5 R4 — Critical / Regulated / Irreversible
Highest-risk work with legal, medical, identity, financial, destructive, or irreversible consequence.

Examples:
- healthcare-related decisions
- identity / KYC / KCC consequence
- financial commitments
- irreversible production actions

---

## 9. Automation Ceilings

| Risk class | Maximum autonomy ceiling |
| --- | --- |
| R0 | full local automation within policy |
| R1 | bounded automation with logging |
| R2 | bounded automation with mandatory assurance before consequence |
| R3 | strong assurance + usually human review |
| R4 | no autonomous finalization; human approval mandatory |

---

## 10. Assurance Requirements

| Risk class | Local adjudication | `{tribeca}` assurance | Human review | Human approval |
| --- | --- | --- | --- | --- |
| R0 | sufficient | not required by default | no | no |
| R1 | sufficient by default | policy-dependent | no | no |
| R2 | preliminary only | mandatory before consequence | optional by policy | no |
| R3 | preliminary only | mandatory | usually yes | policy-dependent |
| R4 | preliminary only | mandatory | yes | yes |

A local “accept” SHALL NOT bypass a stronger required boundary.

---

## 11. Escalation Types

The following escalation types are canonical:

- `no_escalation`
- `assurance_escalation`
- `human_review_escalation`
- `human_approval_escalation`
- `policy_escalation`
- `execution_block`

Escalation is a transfer of authority, not an admission of defeat.

---

## 12. Escalation Triggers

Escalation SHOULD occur when:
- risk threshold is crossed
- evidence is insufficient for consequence level
- policy ambiguity exists
- retry return collapses while consequence remains non-trivial
- communication target becomes external or regulated
- execution target leaves sandbox boundary
- durable memory affects sensitive profile or compliance state

---

## 13. Dispatch, Deploy, and Consequence

`APPROVED_FOR_DISPATCH` in the workflow state machine SHALL mean **approved for external consequence routing**.

That routing MAY become:
- `DISPATCHED` → governed communication through `{reply}`
- `EXECUTING` → governed execution through `{playground}`

Risk policy SHALL govern both paths separately.

---

## 14. Retry Posture by Risk

| Risk class | Retry posture |
| --- | --- |
| R0 | retries MAY be cheap and frequent |
| R1 | moderate retries acceptable |
| R2 | retries monitored for diminishing return |
| R3 | fewer autonomous retries; earlier escalation |
| R4 | minimal autonomous retries; rapid escalation |

---

## 15. Communication Restrictions

| Risk class | Communication policy |
| --- | --- |
| R0 | internal-only or draft-only |
| R1 | internal operational communication permitted |
| R2 | external drafts permitted; sending requires appropriate gate |
| R3 | stronger assurance and usually review required |
| R4 | human approval required before regulated or high-sensitivity release |

A draft and a sent message are not the same risk event.

---

## 16. Execution Restrictions

| Risk class | Execution policy |
| --- | --- |
| R0 | sandbox execution allowed |
| R1 | sandbox or constrained internal execution allowed |
| R2 | stronger logging and assurance before consequential execution |
| R3 | production-adjacent execution requires approval path |
| R4 | irreversible or regulated execution blocked pending human approval |

---

## 17. Memory Restrictions

| Risk class | Memory policy |
| --- | --- |
| R0 | temporary working memory acceptable |
| R1 | episodic or scoped memory allowed with provenance |
| R2 | stronger review for durable profile effects |
| R3 | sensitive durable memory requires assurance |
| R4 | no durable sensitive memory finalization without explicit human/policy gate |

A wrong memory write MAY become a slow-burning high-consequence failure.

---

## 18. Audit Depth by Risk

| Risk class | Audit requirement |
| --- | --- |
| R0 | minimal event log |
| R1 | standard event and artifact log |
| R2 | expanded trace with assurance record |
| R3 | full trace, intervention history, reviewer record |
| R4 | maximal traceability and approval record |

---

## 19. Worked Examples

### 19.1 R0 internal formatting cleanup
- class: R0
- path: low-cost local path
- assurance: local adjudication sufficient

### 19.2 R2 external client email draft
- class: R2
- assurance: mandatory before send
- consequence path: communication, not execution

### 19.3 R3 deployment candidate
- class: R3
- consequence path: execution
- review: usually human review before execution

### 19.4 R4 healthcare-sensitive recommendation
- class: R4
- approval: human approval mandatory
- consequence: no autonomous finalization

---

## 20. Integration With Other Specs

- **Foundation** explains why risk exists constitutionally.
- **Workflow state machine** determines which states a class MUST cross.
- **Interface contract** determines how risk is serialized.
- **Score/calibration** determines how local judgment is represented, not how risk is waived.

If this document conflicts with a lower-level scoring or interface choice, risk policy SHALL prevail.

---

## 21. Conclusion

The purpose of this policy is not to slow the system down.  
It is to ensure that speed occurs only where speed is deserved.

Cheap, reversible work MAY flow quickly.  
Costly, sensitive, or irreversible work SHALL cross stronger trust boundaries.
