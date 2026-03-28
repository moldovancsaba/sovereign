# {sovereign} - Document Set Map

**Status:** Foundational Meta-Specification  
**Version:** v1.1  
**Date:** 2026-03-27  
**Purpose:** Define the document architecture, authority order, dependency order, reading order, and authoritative set designation of the `{sovereign}` foundation set.

---

## 1. Why this file exists

The `{sovereign}` foundation is a constitutional document set, not a pile of related notes.

This file fixes three governance requirements:

- one authoritative set
- one authority order
- one reading and dependency order

Any file not listed in the authoritative set is non-authoritative unless explicitly promoted later.

---

## 2. Authoritative Set

The active authoritative set is:

1. `sovereign_document_set_map_v1.md`
2. `sovereign_canonical_vocabulary_v1.md`
3. `sovereign_constitutional_invariants_v1.md`
4. `sovereign_system_foundation_normalized_v1.md`
5. `sovereign_risk_classes_and_escalation_policy_normalized_v1.md`
6. `sovereign_workflow_state_machine_normalized_v1.md`
7. `sovereign_interface_contract_spec_normalized_v1.md`
8. `sovereign_score_vector_and_calibration_spec_normalized_v1.md`
9. `sovereign_failure_taxonomy_spec_v1.md`
10. `sovereign_root_cause_ticket_spec_v1.md`
11. `sovereign_memory_retention_and_decay_spec_v1.md`
12. `sovereign_metabolism_metrics_spec_v1.md`

Only these files SHALL be treated as constitutionally active.

---

## 3. Authority Order

When two documents overlap, the following authority order SHALL apply:

1. **`sovereign_document_set_map_v1.md`**  
   authoritative set designation, document architecture, dependency order

2. **`sovereign_canonical_vocabulary_v1.md`**  
   shared terminology

3. **`sovereign_constitutional_invariants_v1.md`**  
   non-negotiable cross-document rules

4. **`sovereign_system_foundation_normalized_v1.md`**  
   theory, ideology, architecture, crosswalks, evidence posture

5. **`sovereign_risk_classes_and_escalation_policy_normalized_v1.md`**  
   risk, automation ceilings, escalation

6. **`sovereign_workflow_state_machine_normalized_v1.md`**  
   lifecycle states, guards, transitions

7. **`sovereign_interface_contract_spec_normalized_v1.md`**  
   objects, envelopes, ownership, exchange rules

8. **`sovereign_score_vector_and_calibration_spec_normalized_v1.md`**  
   evaluation, calibration, scoring governance

9. **`sovereign_failure_taxonomy_spec_v1.md`**  
   failure families, classes, severity, routing semantics

10. **`sovereign_root_cause_ticket_spec_v1.md`**  
    durable remediation object model and recurrence handling

11. **`sovereign_memory_retention_and_decay_spec_v1.md`**  
    memory retention, decay, scope, overwrite discipline

12. **`sovereign_metabolism_metrics_spec_v1.md`**  
    efficiency, waste, and metabolic interpretation

If a lower document conflicts with a higher document, the higher document SHALL prevail.

---

## 4. Reading Order

A first serious reader SHOULD read the set in this order:

1. `sovereign_system_foundation_normalized_v1.md`
2. `sovereign_canonical_vocabulary_v1.md`
3. `sovereign_constitutional_invariants_v1.md`
4. `sovereign_risk_classes_and_escalation_policy_normalized_v1.md`
5. `sovereign_workflow_state_machine_normalized_v1.md`
6. `sovereign_interface_contract_spec_normalized_v1.md`
7. `sovereign_score_vector_and_calibration_spec_normalized_v1.md`
8. `sovereign_failure_taxonomy_spec_v1.md`
9. `sovereign_root_cause_ticket_spec_v1.md`
10. `sovereign_memory_retention_and_decay_spec_v1.md`
11. `sovereign_metabolism_metrics_spec_v1.md`

A builder implementing storage or orchestration SHOULD read:

1. vocabulary
2. invariants
3. workflow
4. interface
5. risk
6. failure taxonomy
7. ticket
8. memory
9. metabolism
10. scoring

---

## 5. Dependency Map

| Document | Depends on |
| --- | --- |
| Document set map | none |
| Vocabulary | none |
| Invariants | vocabulary |
| Foundation | vocabulary, invariants conceptually |
| Risk policy | vocabulary, invariants, foundation |
| Workflow state machine | vocabulary, invariants, foundation, risk policy |
| Interface contract | vocabulary, invariants, foundation, risk policy, workflow |
| Score/calibration | vocabulary, invariants, foundation, risk policy, workflow, interface |
| Failure taxonomy | vocabulary, invariants, risk policy, workflow |
| RootCauseTicket | vocabulary, invariants, failure taxonomy, workflow |
| Memory retention/decay | vocabulary, invariants, risk policy, root cause ticket |
| Metabolism metrics | vocabulary, invariants, failure taxonomy, root cause ticket, memory retention/decay |

---

## 6. Normative Classification

| Document | Type |
| --- | --- |
| Foundation | hybrid explanatory + normative anchor |
| Vocabulary | normative |
| Invariants | normative |
| Risk policy | normative |
| Workflow state machine | normative |
| Interface contract | normative |
| Score/calibration | normative with experimental governance |
| Failure taxonomy | normative |
| RootCauseTicket | normative |
| Memory retention/decay | normative |
| Metabolism metrics | normative |

---

## 7. Legacy and Superseded Material

Files not listed in the authoritative set SHALL be treated as:
- legacy
- superseded
- archive-only
- or working artifacts

They SHALL NOT be used as constitutional references for implementation or governance unless explicitly re-promoted.

See:
`sovereign_legacy_and_superseded_files_v1.md`

---

## 8. Shared Section Pattern

All active normative specifications SHOULD use the following section order where applicable:

1. Purpose  
2. Reader Orientation  
3. Core Thesis  
4. Normative Language  
5. Canonical Terminology Reference  
6. Design Principles  
7. Human Explanation / Model Overview  
8. Formal Model  
9. Rules / Invariants  
10. Worked Examples  
11. Integration With Other Specs  
12. Conclusion  

---

## 9. Conclusion

This file designates the authoritative `{sovereign}` foundation set.

It exists to ensure that the documentation is governed as rigorously as the system it describes.
