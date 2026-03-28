# {sovereign} - RootCauseTicket Specification

**Status:** Foundational Normative Specification  
**Version:** v1.0  
**Date:** 2026-03-27  
**Scope:** Durable remediation objects, lifecycle, ownership, recurrence logic, and systemic learning linkage for failure handling in `{sovereign}`

---

## 1. Purpose

This document defines the `RootCauseTicket` model of `{sovereign}`.

It answers the system question:

> **How does `{sovereign}` preserve, route, and resolve failures that cannot be responsibly treated as one-off local defects?**

A failure taxonomy names what went wrong.  
A `RootCauseTicket` preserves what must be repaired beyond the local retry loop.

Without a formal root-cause object:

- repeated failures remain anecdotal
- systemic defects are hidden inside local retries
- upstream problems are not routed clearly
- memory learns partial lessons
- metabolism sees waste but not the repair substrate
- assurance cannot distinguish isolated weakness from recurring structural weakness

This document therefore defines the durable remediation object for the `{sovereign}` foundation set.

---

## 2. Reader Orientation

A `RootCauseTicket` is not the same thing as:
- a failure class
- an exception trace
- an incident report
- a retry event
- a workflow state

It is a **durable governed object** created when the system judges that a defect has diagnostic, recurrence, or upstream-remediation value beyond the local moment.

This document is normative because root-cause handling directly affects:
- learning quality
- recurrence control
- memory integrity
- assurance trust
- waste measurement
- system evolution

---

## 3. Core Thesis

The core thesis is:

> **A serious system does not merely notice repeated defects; it objectifies them so they can be owned, tracked, escalated, and resolved.**

This means:
- a root cause SHALL be represented as an explicit governed object
- tickets SHALL preserve linkage to failure classification
- tickets SHALL preserve linkage to workflow, object lineage, and suspected origin
- tickets SHALL remain open until they are resolved, closed by policy, or archived with explicit disposition

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
- `sovereign_failure_taxonomy_spec_v1.md`

Where shared terms appear here, those documents remain authoritative.

---

## 6. Design Principles

| Principle | Meaning |
| --- | --- |
| **Durability** | A root cause SHALL survive beyond the local workflow moment. |
| **Actionability** | A ticket SHALL exist only when some form of remediation, monitoring, or governance response is meaningful. |
| **Attribution with uncertainty** | The system SHOULD capture suspected origin without pretending certainty it does not have. |
| **Recurrence awareness** | Tickets SHOULD accumulate recurrence evidence over time. |
| **Separation of defect and symptom** | The ticket records the durable defect hypothesis, not only the visible failure event. |
| **Governed closure** | Tickets SHALL NOT disappear silently; closure SHALL be explicit. |
| **Integration** | Tickets SHALL connect failure taxonomy, workflow, risk, memory, assurance, and metabolism. |

---

## 7. What a RootCauseTicket Is

### 7.1 Human explanation

A `RootCauseTicket` exists when the system decides:

- this issue is probably upstream, systemic, or recurrent
- local retries are not enough
- the defect should be preserved as a repairable object
- the issue should influence future routing, memory, or assurance posture

A ticket is therefore the bridge between:
- present failure
- future correction

### 7.2 What it is not

A `RootCauseTicket` is not:
- a replacement for local failure classification
- a proof of ultimate causality
- a guarantee that remediation will succeed
- a generic bug tracker entry without constitutional meaning

---

## 8. Creation Triggers

A `RootCauseTicket` SHOULD be created when one or more of the following conditions hold:

1. the same primary failure class recurs across attempts or workflows
2. the failure likely originates upstream of the current local producer
3. local retry has low expected return
4. the issue affects memory quality, risk assignment, assurance quality, or workflow routing
5. the failure has systemic or portfolio-level diagnostic value
6. the issue materially increases waste or recurrence
7. the issue affects a higher-risk or higher-consequence path where silent forgetting would be dangerous

### 8.1 Strong triggers

A ticket SHALL be created when:
- a governance failure recurs materially
- an approval or assurance boundary is repeatedly reached with similar insufficiency
- a sensitive or durable memory defect is detected with meaningful downstream effect
- the same upstream defect causes repeated blocked or failed workflows

---

## 9. Canonical Object Schema

### 9.1 Minimal schema

```json
{
  "ticketId": "uuid",
  "workflowId": "uuid",
  "artifactId": "uuid",
  "primaryFailureClass": "structure_failure",
  "secondaryFailureClass": null,
  "severity": "moderate",
  "suspectedOriginPlane": "{hatori}",
  "detectedBy": "{trinity}",
  "currentOwner": "{zeno}",
  "confidence": 0.71,
  "blocked": false,
  "recurrenceCount": 3,
  "status": "open",
  "remediationOwner": "{meimei}",
  "createdAt": "2026-03-27T21:00:00Z",
  "updatedAt": "2026-03-27T21:00:00Z"
}
```

### 9.2 Extended recommended fields

```json
{
  "ticketId": "uuid",
  "workflowId": "uuid",
  "parentWorkflowId": null,
  "artifactId": "uuid",
  "evidenceRefs": ["artifact_uuid", "event_uuid"],
  "primaryFailureClass": "memory_quality_failure",
  "secondaryFailureClass": "usefulness_failure",
  "severity": "major",
  "suspectedOriginPlane": "{hatori}",
  "detectedBy": "{tribeca}",
  "currentPlane": "{tribeca}",
  "currentOwner": "{zeno}",
  "confidence": 0.78,
  "riskClass": "R2",
  "blocked": true,
  "status": "open",
  "recurrenceCount": 4,
  "firstSeenAt": "2026-03-20T10:00:00Z",
  "createdAt": "2026-03-27T21:10:00Z",
  "updatedAt": "2026-03-27T21:10:00Z",
  "remediationOwner": "{hatori}",
  "remediationPlan": "refresh memory quality validation and scope filters",
  "closureReason": null
}
```

---

## 10. Required Fields

Every `RootCauseTicket` SHALL contain at least:

- `ticketId`
- `workflowId`
- `primaryFailureClass`
- `severity`
- `suspectedOriginPlane`
- `detectedBy`
- `currentOwner`
- `confidence`
- `status`
- `recurrenceCount`
- `createdAt`
- `updatedAt`

### 10.1 Field meaning

| Field | Meaning |
| --- | --- |
| `ticketId` | globally unique identifier |
| `workflowId` | workflow most directly associated with ticket creation |
| `primaryFailureClass` | canonical primary failure from taxonomy |
| `severity` | current severity interpretation |
| `suspectedOriginPlane` | best current estimate of where remediation should begin |
| `detectedBy` | component that identified the root-cause-worthy defect |
| `currentOwner` | component or human currently responsible for ticket progression |
| `confidence` | confidence in origin hypothesis or ticket framing |
| `status` | lifecycle position of the ticket |
| `recurrenceCount` | number of materially linked occurrences seen |
| `createdAt` / `updatedAt` | audit timestamps |

---

## 11. Ticket Lifecycle

### 11.1 Canonical statuses

| Status | Meaning |
| --- | --- |
| `open` | ticket created and unresolved |
| `triaged` | ownership and remediation direction assigned |
| `in_remediation` | active repair or policy/process change underway |
| `monitoring` | remediation applied; recurrence risk still being watched |
| `resolved` | defect believed resolved under current evidence |
| `closed` | formally closed with explicit reason |
| `archived` | retained as historical record |

### 11.2 Lifecycle rule

Tickets SHALL NOT vanish silently.  
Every non-active end state SHALL have an explicit status and, where relevant, a closure reason.

### 11.3 Typical progression

`open` → `triaged` → `in_remediation` → `monitoring` → `resolved` → `closed` → `archived`

Not every ticket must pass through every state, but jumps SHOULD be justified.

---

## 12. Ownership Model

### 12.1 Human explanation

A ticket without an owner is just preserved frustration.

### 12.2 Ownership rules

- `{zeno}` SHOULD own newly created tickets until triage assigns a remediation owner
- remediation ownership SHOULD move to the plane most capable of repairing the suspected defect
- assurance-related tickets MAY remain under `{tribeca}` until governance response is defined
- high-risk tickets MAY require human or policy owner assignment

### 12.3 Typical remediation owners

| Failure pattern | Common remediation owner |
| --- | --- |
| task framing weakness | `{meimei}` |
| workflow routing or risk assignment weakness | `{zeno}` |
| context or memory quality weakness | `{hatori}` |
| ranking or recommendation weakness | `{messmass}` |
| local production weakness | `{trinity}` or relevant producer |
| assurance boundary weakness | `{tribeca}` |
| channel/dispatch weakness | `{reply}` |
| execution/runtime weakness | `{playground}` or runtime authority |

---

## 13. Recurrence Logic

### 13.1 Human explanation

Tickets matter most when recurrence is visible.  
A one-off issue MAY not deserve durable remediation. A repeated issue almost certainly does.

### 13.2 Recurrence count

`recurrenceCount` SHOULD increase when:
- the same primary failure class reappears
- the same suspected origin plane remains implicated
- the defect pattern appears across related workflows, branches, or tasks
- the prior remediation is not holding

### 13.3 Recurrence interpretation

| Recurrence count | Interpretation |
| --- | --- |
| `1` | first known durable instance |
| `2-3` | repeated issue; stronger triage warranted |
| `4+` | likely systemic; remediation priority SHOULD rise |

### 13.4 Rule

High recurrence SHOULD influence:
- severity
- remediation urgency
- assurance posture
- metabolic waste interpretation

---

## 14. Severity and Blocking

### 14.1 Relationship to severity

Ticket severity MAY inherit from the triggering failure, but it SHOULD also reflect:
- recurrence
- consequence class
- systemic spread
- confidence in diagnosis
- whether current workflows remain blocked

### 14.2 `blocked` field

The `blocked` field SHOULD indicate whether:
- the ticket corresponds to an issue currently preventing safe or legal progression
- the issue requires remediation before certain workflow classes can proceed normally

A ticket MAY be non-blocking but still important.

---

## 15. Linkage to Other Objects

A `RootCauseTicket` SHOULD preserve references to relevant governed objects.

Recommended links:
- `workflowId`
- `parentWorkflowId`
- `artifactId`
- `evidenceRefs`
- `eventRefs`
- `assuranceRefs`
- `memoryRefs`
- `relatedTicketIds`

### 15.1 Why

Without object linkage, the ticket becomes narratively descriptive but computationally weak.

---

## 16. Relationship to Workflow

### 16.1 Human explanation

A workflow MAY fail without generating a ticket.  
A ticket SHOULD exist when the failure has future repair value.

### 16.2 Rules

- blocked or failed workflows SHOULD open tickets when upstream or recurring defects are likely
- successful workflows MAY still generate tickets if they reveal structural weakness that was manually compensated for
- workflows SHOULD reference related ticket ids when a ticket affected routing, delay, or outcome

---

## 17. Relationship to Failure Taxonomy

The failure taxonomy names the failure.  
The `RootCauseTicket` preserves the repairable defect hypothesis.

### 17.1 Rule

A ticket SHALL reference at least one canonical primary failure class.

### 17.2 Important distinction

The ticket SHALL NOT be treated as proof of ultimate causality.  
It is a governed remediation hypothesis with evidence linkage and recurrence tracking.

---

## 18. Relationship to Memory

### 18.1 Human explanation

Tickets are part of the learning substrate, but they are not the same as ordinary memory.

### 18.2 Rules

- tickets SHOULD be available to `{hatori}` for system-learning memory
- ticket data SHALL remain separate from user-profile personalization by default
- sensitive tickets SHOULD have restricted retention scope
- resolved tickets MAY inform future routing, calibration, or policy tuning

---

## 19. Relationship to Assurance and Risk

### 19.1 Assurance linkage

`{tribeca}` MAY create or escalate tickets when:
- assurance repeatedly fails for similar reasons
- evidence sufficiency is repeatedly inadequate
- the same class of provisional output arrives structurally underprepared

### 19.2 Risk linkage

High-risk tickets SHOULD:
- escalate faster
- close more cautiously
- remain visible longer for monitoring
- influence future risk posture for similar tasks when justified

---

## 20. Relationship to Metabolism

### 20.1 Human explanation

Tickets capture waste that ordinary logs do not explain.

### 20.2 Rules

The metabolism layer SHOULD be able to count at least:
- tickets opened per workflow family
- tickets by origin plane
- tickets by recurrence band
- unresolved ticket waste
- post-remediation recurrence rate

### 20.3 Why

A system that spends heavily fixing the same hidden defect is metabolically weak, even if local workflows sometimes complete.

---

## 21. Closure Rules

### 21.1 Human explanation

A ticket is not closed because attention fades.  
It is closed because the system has a reason to believe the defect is either resolved or intentionally retired.

### 21.2 Closure reasons

A closed ticket SHOULD record one of:
- `resolved_by_remediation`
- `resolved_by_policy_change`
- `resolved_by_rerouting`
- `duplicate`
- `false_positive`
- `obsolete`
- `accepted_risk`

### 21.3 Closure requirements

A ticket SHOULD NOT move to `closed` unless:
- remediation or disposition is recorded
- recurrence posture is understood
- the current owner authorizes closure
- any required high-risk review has occurred

---

## 22. Worked Examples

### 22.1 Repeated stale-memory issue in client drafts
- primary failure: `memory_quality_failure`
- suspected origin: `{hatori}`
- recurrence: 4
- status path: `open` → `triaged` → `in_remediation`
- likely remediation: memory refresh, scope checks, review filters

### 22.2 Repeated deployment candidates failing assurance on policy fit
- primary failure: `policy_failure`
- detected by: `{tribeca}`
- recurrence: 3
- blocked: true
- likely owner: `{zeno}` and policy authority

### 22.3 One-off formatting issue in internal summary
- primary failure: `format_failure`
- recurrence: 1
- likely outcome: local fix only
- ticket: probably not needed unless repeated systematically

### 22.4 R4 healthcare recommendation repeatedly lacking evidence sufficiency
- primary failure: `evidence_sufficiency_failure`
- severity: critical
- blocked: true
- escalation: immediate
- ticket: mandatory

---

## 23. Invariants

1. a `RootCauseTicket` SHALL reference at least one canonical primary failure class
2. tickets SHALL NOT disappear silently; lifecycle state SHALL remain explicit
3. ticket ownership SHALL be explicit
4. recurrence tracking SHALL remain separate from one-off failure logging
5. a ticket SHALL remain a remediation object, not a claim of perfect causality
6. high-risk recurring governance defects SHALL receive stronger escalation treatment

---

## 24. Integration With Other Specs

- **Failure taxonomy** names the failure class that seeds the ticket.
- **Workflow state machine** determines when a ticket influences routing, block, or reroute.
- **Risk policy** determines when a ticket should escalate faster or remain visible longer.
- **Interface contract** will serialize ticket objects and linkage fields.
- **Memory retention and decay** will define how long tickets remain in active or retained visibility.
- **Metabolism metrics** will use tickets as a core waste and recurrence signal.

---

## 25. Conclusion

The purpose of a `RootCauseTicket` is to turn repeated or systemic failure from an anecdote into a governed object.

`{sovereign}` SHALL:
- preserve such defects explicitly
- assign them owners
- track recurrence
- connect them to evidence
- and close them only with explicit disposition
