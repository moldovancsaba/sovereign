# {sovereign} - Interface Contract Specification (Normalized)

**Status:** Foundational Normative Specification  
**Version:** v1.0  
**Date:** 2026-03-27  
**Scope:** Canonical object families, envelope rules, ownership rules, and consequence-safe exchange structures across `{sovereign}`

---

## 1. Purpose

This document defines how planes and kernels in `{sovereign}` exchange work, evidence, state, risk, and consequence permissions without ambiguity.

---

## 2. Reader Orientation

The contract layer is not an implementation afterthought.  
It is a constitutional boundary.

`{sovereign}` SHALL exchange governed objects, not only ad hoc prose prompts.

---

## 3. Core Thesis

Every consequential exchange in `{sovereign}` SHOULD be represented as an explicit typed object carrying:
- provenance
- risk
- state
- owner
- payload

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

---

## 6. Canonical Object Families

| Object family | Purpose |
| --- | --- |
| Task | structured intent and requested work |
| Workflow | stateful governed work unit |
| Artifact | generated or transformed output |
| Evaluation | local score/vector/decision object |
| Assurance | independent validation decision |
| Escalation | stronger authority transfer |
| Communication | governed dispatch payload |
| Execution | governed execution payload |
| MemoryRecord | retained learning or memory candidate |
| Event | immutable transition or action record |

---

## 7. Canonical Envelope

```json
{
  "objectType": "Artifact",
  "objectVersion": "1.0",
  "objectId": "uuid",
  "workflowId": "uuid",
  "parentObjectId": null,
  "currentOwner": "{trinity}",
  "riskClass": "R2",
  "state": "UNDER_LOCAL_REVIEW",
  "provenance": {
    "createdAt": "2026-03-27T20:00:00Z",
    "createdBy": "{trinity}",
    "sourcePlane": "{trinity}"
  },
  "payload": {}
}
```

### 7.1 Envelope rules

Every governed transferable object SHALL include:
- `objectType`
- `objectVersion`
- `objectId`
- `workflowId` when workflow-governed
- `currentOwner`
- `riskClass` for consequential objects
- `state` for stateful objects
- `provenance`
- `payload`

---

## 8. Task Contract

Purpose: structured handoff from `{meimei}` to `{zeno}`.

Minimum payload:
- `taskType`
- `intentText`
- `constraints`
- `requestedOutcome`
- `initialAudience`

Ownership:
- initial normalization by `{meimei}`
- authoritative workflow ownership by `{zeno}` once opened

---

## 9. Workflow Contract

Purpose: authoritative state-bearing governed unit.

Rules:
- `{zeno}` SHALL own the authoritative workflow object
- there SHALL be exactly one authoritative lifecycle state at a time
- parent/child workflow linkage SHALL be preserved where subworkflows exist

Minimum payload:
- `taskType`
- `branchId`
- `parentWorkflowId`
- `allowedNextStates`
- `approvalRequired`
- `reviewRequired`
- `escalationStatus`

---

## 10. Artifact Contract

Purpose: provisional or accepted output of production.

Rules:
- artifacts SHALL declare whether they are provisional
- artifact existence SHALL NOT imply consequence permission
- branch-capable workflows SHOULD preserve branch linkage

Minimum payload:
- `artifactType`
- `contentFormat`
- `content` or `contentRef`
- `attempt`
- `branchId`
- `provisional`

---

## 11. Evaluation Contract

Purpose: local judgment object.

Rules:
- consequential evaluation SHALL preserve the reason vector
- scalar score SHALL NOT exist without fusion metadata
- evaluation SHALL NOT substitute for assurance when stronger review is required

Minimum payload:
- `reasonVector`
- `scalarScore`
- `fusionMethodId`
- `calibrationVersion`
- `judgeVersion`
- `decision`

---

## 12. Assurance Contract

Purpose: independent validation decision from `{tribeca}`.

Rules:
- assurance objects SHALL be created only by `{tribeca}` or explicitly authorized equivalent
- assurance decision SHALL be explicit

Minimum payload:
- `assuranceDecision`
- `policyCheck`
- `evidenceSufficiency`
- `riskAction`
- `comments`

---

## 13. Escalation Contract

Purpose: record transfer of authority.

Rules:
- escalation SHALL identify trigger and stronger authority requested
- escalation SHALL remain linked to workflow and risk class

Minimum payload:
- `escalationType`
- `trigger`
- `requestedBy`
- `status`

---

## 14. Communication Contract

Purpose: governed communication consequence.

Rules:
- communication objects SHALL remain distinct from execution objects
- communication SHALL NOT be sent without class-appropriate approval

Minimum payload:
- `channel`
- `recipientClass`
- `subject`
- `bodyRef` or `body`
- `dispatchApproved`

---

## 15. Execution Contract

Purpose: governed execution consequence.

Rules:
- execution SHALL identify environment and reversibility
- execution SHALL NOT cross into consequential runtime without required gate
- execution SHALL remain distinct from communication

Minimum payload:
- `executionType`
- `targetEnvironment`
- `artifactRef`
- `executionApproved`
- `reversible`

---

## 16. MemoryRecord Contract

Purpose: retained learning or governed memory candidate.

Rules:
- memory SHALL identify type and scope
- durable memory SHOULD contain expiry/review metadata
- sensitive memory SHALL remain constrained by risk policy

Minimum payload:
- `memoryType`
- `scope`
- `confidence`
- `expiryDate`
- `overwritePolicy`
- `evidenceRef`

---

## 17. Event Contract

Purpose: immutable transition or action record.

Rules:
- events SHOULD be append-only in ordinary operation
- events SHOULD preserve actor, trigger, and transition data

Minimum payload:
- `eventType`
- `fromState`
- `toState`
- `trigger`
- `actor`

---

## 18. Ownership Rules

| Object type | Canonical owner |
| --- | --- |
| Task | `{meimei}` then `{zeno}` |
| Workflow | `{zeno}` |
| Artifact | producing kernel or producer |
| Evaluation | local adjudicator / producing kernel |
| Assurance | `{tribeca}` |
| Escalation | `{zeno}` or triggering assurance boundary |
| Communication | `{reply}` |
| Execution | `{playground}` or approved runtime |
| MemoryRecord | `{hatori}` |
| Event | transition-triggering authority or audit runtime |

There SHALL be one current authoritative owner for each active object.

---

## 19. Object Relationships

Objects SHOULD preserve:
- `workflowId`
- `parentObjectId`
- `parentWorkflowId`
- `artifactRef`
- `evidenceRef`
- `branchId`
- `subworkflowId`

Merged outputs SHALL preserve lineage and the strictest applicable risk posture where consequence is shared.

---

## 20. Consequence Routing

`APPROVED_FOR_DISPATCH` is a constitutional approval state, not a message-only state.

Consequence SHALL be split into:
- `Communication` objects for dispatch consequence
- `Execution` objects for execution consequence

No object SHALL imply consequence permission without the correct state and required review path.

---

## 21. Minimal Cross-Plane Exchange Patterns

| Exchange | Object family |
| --- | --- |
| `{meimei}` → `{zeno}` | Task |
| `{hatori}` → `{zeno}` | MemoryRecord or context bundle |
| `{messmass}` → `{zeno}` | recommendation / intelligence attachment |
| `{zeno}` → `{trinity}` | Workflow + instructions |
| `{trinity}` → `{tribeca}` | Artifact + Evaluation |
| `{tribeca}` → `{zeno}` | Assurance or Escalation |
| `{zeno}` → `{reply}` | Communication |
| `{zeno}` → `{playground}` | Execution |
| any plane → audit / memory | Event |

---

## 22. Invariants

1. no active governed object SHALL lose provenance
2. no consequential object SHALL omit risk class
3. no object SHALL imply approval without the proper workflow state or assurance path
4. communication SHALL NOT be represented as execution
5. execution SHALL NOT be represented as communication
6. local evaluation SHALL NOT replace required assurance

---

## 23. Worked Examples

### 23.1 R1 internal summary
- `Task`
- `Workflow`
- `Artifact`
- `Evaluation`
- `Event`
- optional `MemoryRecord`

### 23.2 R2 external email draft
- `Task`
- `Workflow`
- `Artifact`
- `Evaluation`
- `Assurance`
- `Communication`

### 23.3 R3 deployment candidate
- `Workflow`
- technical `Artifact`
- `Evaluation`
- `Assurance`
- optional `Escalation`
- `Execution`

---

## 24. Integration With Other Specs

- **Workflow state machine** governs allowed state values.
- **Risk policy** governs whether local exchange is enough for consequence.
- **Score/calibration** governs evaluation payload semantics.
- **Vocabulary** and **invariants** remain authoritative for shared meanings.

---

## 25. Conclusion

`{sovereign}` SHALL exchange governed objects.

That is what keeps the system from collapsing back into ad hoc prompt passing.
