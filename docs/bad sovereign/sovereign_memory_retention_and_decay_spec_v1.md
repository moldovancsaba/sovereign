# {sovereign} - Memory Retention and Decay Specification

**Status:** Foundational Normative Specification  
**Version:** v1.0  
**Date:** 2026-03-27  
**Scope:** Memory classes, write policy, retention rules, decay rules, overwrite logic, review cycles, and sensitive-memory governance across `{sovereign}`

---

## 1. Purpose

This document defines the memory retention and decay model of `{sovereign}`.

It answers the system question:

> **What should `{sovereign}` remember, for how long, under what scope, with what confidence, and when should it weaken, expire, merge, or be removed?**

A memory-enabled system without retention and decay rules becomes contaminated.  
Without a formal memory policy:

- stale information persists as if it were current
- one-off accidents become false personalization
- sensitive memory is retained too loosely
- the system cannot distinguish durable knowledge from temporary context
- calibration and assurance may inherit obsolete assumptions
- system learning turns into uncontrolled accumulation

This document therefore defines the constitutional memory discipline of `{sovereign}`.

---

## 2. Reader Orientation

Memory in `{sovereign}` is not one blob and not one vector store pretending to be a mind.

It is a governed set of memory classes with:
- different write rules
- different retention windows
- different decay behavior
- different overwrite logic
- different risk and review posture

This document is normative because memory quality affects nearly every other foundation document.

---

## 3. Core Thesis

The core thesis is:

> **Memory SHALL be selective, scoped, attributable, and decaying.**

That means:
- the system SHALL distinguish temporary context from durable memory
- durable memory SHALL carry provenance and confidence
- retention SHALL be class-specific
- decay SHALL be deliberate, not accidental
- sensitive memory SHALL cross stronger boundaries
- more memory SHALL NOT be assumed to mean more learning

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
- `sovereign_risk_classes_and_escalation_policy_normalized_v1.md`

Where shared terms appear here, those documents remain authoritative.

---

## 6. Design Principles

| Principle | Meaning |
| --- | --- |
| **Layered memory** | Different memory classes SHALL remain distinct. |
| **Selective retention** | The system SHALL NOT promote everything into durable memory. |
| **Provenance preservation** | Durable memory SHALL retain source and evidence linkage. |
| **Confidence awareness** | Memory strength SHOULD reflect evidence quality and recurrence. |
| **Decay by design** | Memory SHOULD weaken, expire, or be reviewed over time. |
| **Scope discipline** | Memory SHALL remain bounded by user/team/system/sensitive scope. |
| **Governed overwrite** | New memory SHALL NOT silently erase durable knowledge without explicit policy. |
| **Sensitive-memory caution** | High-risk or sensitive memory writes SHALL cross stronger boundaries. |

---

## 7. Memory Class Model

### 7.1 Human explanation

`{sovereign}` uses multiple memory classes because different kinds of remembered material serve different functions.

The system must distinguish:
- what is needed only for the current task
- what should be remembered about prior interactions
- what counts as reusable knowledge
- what is a personal or team preference
- what is an immutable audit event
- what is a system-learning signal

### 7.2 Canonical memory classes

| Memory class | Purpose |
| --- | --- |
| **working memory** | short-lived task-local context |
| **episodic memory** | prior interactions, outcomes, and event-linked experiences |
| **semantic memory** | reusable knowledge, playbooks, abstractions |
| **profile memory** | durable user/team preferences and operating traits |
| **audit memory** | immutable historical trace for accountability |
| **system-learning memory** | validated reflections, recurrence, ranking, tickets, and governance-relevant learning |

---

## 8. Memory Record Core Fields

Every durable memory record SHOULD preserve at least:

- `memoryId`
- `memoryType`
- `scope`
- `confidence`
- `provenance`
- `createdAt`
- `updatedAt`
- `expiryDate` or `reviewDate`
- `overwritePolicy`
- `evidenceRef`

### 8.1 Canonical example

```json
{
  "memoryId": "uuid",
  "memoryType": "profile",
  "scope": "user",
  "confidence": 0.82,
  "provenance": {
    "createdBy": "{hatori}",
    "sourcePlane": "{hatori}",
    "sourceWorkflowId": "uuid"
  },
  "createdAt": "2026-03-27T22:00:00Z",
  "updatedAt": "2026-03-27T22:00:00Z",
  "reviewDate": "2026-06-27T00:00:00Z",
  "overwritePolicy": "merge",
  "evidenceRef": "workflow_uuid"
}
```

---

## 9. Write Policy

### 9.1 Human explanation

Not every interaction deserves memory.  
A system that stores everything becomes noisy, brittle, and misleading.

### 9.2 Retention candidates

The following MAY be promoted into memory when supported:

- repeated user preferences
- stable team preferences
- validated playbooks or reusable abstractions
- meaningful task outcomes
- recurring failure patterns
- resolved root-cause learnings
- assurance-relevant findings
- calibration-relevant signals

### 9.3 Non-promotable by default

The following SHOULD NOT be promoted directly into durable memory without stronger justification:

- one-off phrasing preferences
- accidental wording
- low-confidence guesses
- transient emotional state unless explicitly important
- provisional outputs that did not pass review
- unvalidated local judgments
- sensitive personal or operational facts without proper boundary

### 9.4 Promotion rule

A durable memory write SHOULD require at least one of:
- repetition
- validation
- explicit confirmation
- clear downstream reuse value
- strong evidence and provenance
- policy-based necessity

---

## 10. Retention Rules by Memory Class

### 10.1 Working memory

- purpose: active task context
- retention: task-bounded
- expiry: immediate or short-lifetime after workflow closure unless promoted
- overwrite: replace freely within task scope

### 10.2 Episodic memory

- purpose: prior interaction and outcome traces
- retention: medium-term by default
- review: periodic
- overwrite: append or merge, do not silently replace entire episode chains

### 10.3 Semantic memory

- purpose: reusable knowledge and abstractions
- retention: long-lived
- review: slower but mandatory
- overwrite: cautious merge or versioned replacement

### 10.4 Profile memory

- purpose: user/team preferences and durable operating traits
- retention: long-lived but reviewable
- review: periodic and event-triggered
- overwrite: merge or challenge-based update only
- caution: avoid overfitting to one-off events

### 10.5 Audit memory

- purpose: accountability and reconstruction
- retention: long-lived or immutable by policy
- overwrite: none in ordinary operation
- decay: not semantic decay; only access/retention policy may change

### 10.6 System-learning memory

- purpose: validated lessons, recurrence patterns, tickets, calibration signals
- retention: medium- to long-lived
- review: required
- overwrite: versioned merge preferred

---

## 11. Decay Model

### 11.1 Human explanation

Decay is not forgetting by accident.  
It is forgetting by design.

The system should weaken or retire memory when:
- evidence is aging
- preferences change
- recurrence disappears
- stronger contradictory evidence appears
- the cost of stale memory exceeds its value

### 11.2 Decay mechanisms

The system MAY apply:

- **time-based expiry**  
  memory becomes invalid after a set interval

- **confidence decay**  
  confidence score weakens over time without reinforcement

- **review-required hold**  
  memory remains but becomes cautionary until reviewed

- **supersession**  
  newer evidence outranks older memory

- **scope contraction**  
  memory remains but only in a narrower scope

### 11.3 Confidence decay example

A simple policy MAY follow:

`C_t = C_0 * d^t`

Where:
- `C_t` = confidence at time `t`
- `C_0` = initial confidence
- `d` = decay factor in `(0,1]`

This is not the only valid model, but all decay logic SHOULD be explicit.

---

## 12. Review Cycles

### 12.1 Human explanation

Some memory should not simply expire; it should be re-validated.

### 12.2 Review triggers

A review SHOULD occur when:
- the review date is reached
- a contradiction is detected
- repeated failures implicate the memory
- the memory affects higher-risk consequence
- the user or human reviewer explicitly challenges it
- calibration or assurance findings question it

### 12.3 Review outcomes

A reviewed memory MAY be:
- retained unchanged
- retained with lowered confidence
- merged with stronger evidence
- superseded
- narrowed in scope
- retired

---

## 13. Overwrite and Merge Policies

### 13.1 Canonical overwrite policies

| Policy | Meaning |
| --- | --- |
| `replace` | new memory fully replaces old record |
| `merge` | compatible memory is combined |
| `append` | new record added without replacing prior records |
| `versioned_replace` | new record replaces active one but old version is preserved |
| `no_overwrite` | record is immutable in ordinary operation |

### 13.2 Default guidance by class

| Memory class | Default policy |
| --- | --- |
| working | replace |
| episodic | append / merge |
| semantic | merge / versioned_replace |
| profile | merge / versioned_replace |
| audit | no_overwrite |
| system-learning | append / merge / versioned_replace |

### 13.3 Rule

Destructive overwrite SHOULD be rare outside working memory.

---

## 14. Scope Model

### 14.1 Canonical scopes

| Scope | Meaning |
| --- | --- |
| `task` | current workflow or subworkflow only |
| `user` | one user profile context |
| `team` | team-shared operational context |
| `system` | system-level reusable knowledge |
| `sensitive` | restricted memory requiring stronger access and retention controls |

### 14.2 Rule

Memory SHALL NOT silently cross scopes.

A `task`-scoped memory SHALL NOT become `user` or `team` memory without explicit promotion rules.  
A `user` preference SHALL NOT become `system` semantic memory merely because it recurs for one individual.

---

## 15. Sensitive-Memory Governance

### 15.1 Human explanation

Some memory is just more dangerous than others.

Durable memory about:
- health
- identity
- finances
- permissions
- operational vulnerabilities
- regulated processes

must be treated more cautiously than ordinary productivity preferences.

### 15.2 Rule

Sensitive durable memory SHALL be constrained by risk policy.

In practice:
- higher-risk writes SHOULD require stronger review
- R4-sensitive memory SHALL NOT finalize without the required human or policy boundary
- sensitive memory SHOULD carry narrower scope by default

---

## 16. Relationship to Workflow

### 16.1 Human explanation

Not every state should write durable memory.

### 16.2 Rules

- provisional workflow states SHOULD write only working or episodic memory by default
- completed or resolved workflows MAY produce durable memory candidates
- blocked or failed workflows SHOULD produce tickets or episodic traces before durable preference updates
- archived workflows preserve audit memory, not necessarily active profile memory

---

## 17. Relationship to RootCauseTicket

Tickets are part of system learning, but they are not ordinary user memory.

### 17.1 Rules

- unresolved tickets SHOULD remain in system-learning memory
- tickets SHALL NOT automatically become user-profile memory
- resolved recurring tickets MAY influence future routing or assurance posture
- retired tickets MAY remain as audit or historical system-learning records

---

## 18. Relationship to Risk and Assurance

Memory retention SHALL remain subordinate to risk policy and assurance boundaries.

### 18.1 Rule hierarchy

1. policy constraints
2. risk class requirements
3. assurance/human boundary requirements
4. memory class retention rules
5. overwrite/merge policy
6. optimization preferences

### 18.2 Consequence

A strong confidence score SHALL NOT justify sensitive durable memory if the required boundary has not been crossed.

---

## 19. Relationship to Calibration and Metabolism

### 19.1 Calibration

Stale memory can distort evaluation and assurance.

The system SHOULD use calibration and assurance findings to:
- downgrade memory confidence
- trigger review
- narrow scope
- open tickets when memory quality repeatedly degrades outcomes

### 19.2 Metabolism

Memory quality affects:
- energy spent on retries
- waste generated by stale assumptions
- yield lost through poor personalization or bad context retrieval

The metabolism layer SHOULD therefore track at least:
- stale-memory linked failures
- memory review rate
- supersession rate
- sensitive-memory escalation rate

---

## 20. Worked Examples

### 20.1 One-off user wording preference
- memory class candidate: profile
- action: do not promote immediately
- rationale: insufficient repetition

### 20.2 Repeated preference for concise executive summaries
- memory class candidate: profile
- action: promote with user scope, medium confidence, future review date

### 20.3 Internal playbook repeatedly reused successfully
- memory class candidate: semantic
- action: promote to reusable semantic memory with versioned review

### 20.4 Stale customer memory causing repeated draft failures
- memory class: profile or episodic source
- action: lower confidence, open ticket, review scope and overwrite policy

### 20.5 Sensitive healthcare-related scheduling preference
- memory class: sensitive/profile
- action: restricted scope, stronger review, no casual promotion

---

## 21. Invariants

1. memory classes SHALL remain distinct
2. durable memory SHALL preserve provenance and confidence
3. not all interactions SHALL become durable memory
4. sensitive memory SHALL remain bounded by stronger risk and assurance rules
5. completion of a workflow SHALL NOT imply automatic durable memory promotion
6. audit memory SHALL remain distinct from profile or semantic memory
7. destructive overwrite SHALL remain rare outside working memory

---

## 22. Integration With Other Specs

- **Foundation** defines the ideology of selective memory and deliberate forgetting.
- **Risk policy** governs sensitive and high-consequence memory writes.
- **Workflow state machine** governs when a memory write is provisional versus durable.
- **Failure taxonomy** identifies memory-related failure classes.
- **RootCauseTicket spec** preserves recurring memory defects as governed remediation objects.
- **Score/calibration** may trigger review, downgrade, or supersession.
- **Metabolism metrics** interprets memory quality as part of system efficiency and waste.

---

## 23. Conclusion

The purpose of the memory policy is not to help `{sovereign}` remember more.

It is to help `{sovereign}` remember **better**.

The system SHALL:
- retain selectively
- decay deliberately
- preserve provenance
- respect scope
- and treat sensitive durable memory as a governed act, not a casual side effect
