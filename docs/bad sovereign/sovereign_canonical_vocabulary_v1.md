# {sovereign} - Canonical Vocabulary

**Status:** Foundational Normative Specification  
**Version:** v1.0  
**Date:** 2026-03-27  
**Purpose:** Define the authoritative vocabulary of the `{sovereign}` foundation set.

---

## 1. Normative rule

All companion specifications SHALL use the following terms with the meanings below.

If a later document uses the same term differently, this vocabulary file SHALL prevail.

---

## 2. Core constitutional terms

| Term | Canonical definition |
| --- | --- |
| **{sovereign}** | The total governed ecosystem and constitutional umbrella. |
| **{zeno}** | The explicit control plane and sole owner of the authoritative workflow graph. |
| **{meimei}** | The intent interface layer that structures human requests into governable task objects. |
| **{hatori}** | The context, memory, and learning plane. |
| **{messmass}** | The intelligence and decision-support plane that ranks, predicts, and recommends. |
| **{tribeca}** | The assurance plane that performs independent validation and escalation. |
| **{reply}** | The communication-governance plane that controls dispatch rights, channels, and traceability. |
| **{playground}** | The safe execution and experimentation plane. |
| **{trinity}** | The text-centric artifact kernel for drafting, writing, and local adjudication. |

---

## 3. Governance and lifecycle terms

| Term | Canonical definition |
| --- | --- |
| **Adjudication** | Local kernel- or component-level quality judgment over a provisional artifact or result. |
| **Assurance** | Independent validation performed by `{tribeca}` or an authorized equivalent boundary. |
| **Approval** | Explicit authorization that allows a workflow to cross a consequence boundary. |
| **Human review** | Human inspection of a workflow or artifact without necessarily granting final authorization. |
| **Human approval** | Explicit human authorization required before finalization. |
| **Completion** | Successful closure of a workflow after governed consequence has resolved or no further governed action is required. |
| **Archive / Archival** | Final retention state after closure. Archived workflows SHALL NOT re-enter ordinary active processing. |
| **Consequence** | Any outward effect that changes communication state, execution state, memory durability, permissions, commitments, or externally relevant outputs. |
| **Dispatch** | Governed communication release or outward informational delivery through `{reply}`. |
| **Deploy / Deployment** | Governed execution or operational action, typically through `{playground}` or an approved execution path. |
| **Execution** | The act of running code, procedures, or operational actions in sandbox or approved runtime. Execution MAY or MAY NOT be deployment. |
| **Provisional output** | Any generated or transformed output that has not yet crossed the required assurance and consequence boundary. |
| **Risk elevation** | Raising the risk class because consequence, sensitivity, ambiguity, or exposure increased. |
| **Risk demotion** | Lowering the risk class. Risk demotion SHALL NOT occur automatically through local production or scoring. |

---

## 4. Object and state terms

| Term | Canonical definition |
| --- | --- |
| **Task object** | A structured representation of requested work before or during workflow governance. |
| **Workflow object** | The main state-bearing governed unit of work. |
| **Artifact** | Any generated or transformed output unit tracked by the system. |
| **Evaluation** | A structured local judgment object containing reason vector, scalar score, and decision metadata. |
| **Escalation** | Transfer of authority to a stronger validator or human boundary. |
| **Envelope** | The governance wrapper around a payload object. |
| **Payload** | The domain-specific body of an object. |
| **Owner** | The current authoritative responsible component for an object. |
| **Lineage** | The chain of parentage and derivation between related objects. |
| **Consequence routing** | The move from approved state into communication or execution object family. |
| **Object family** | A constitutional category of interface objects with shared semantics. |

---

## 5. Scoring and learning terms

| Term | Canonical definition |
| --- | --- |
| **Reason vector** | Structured evaluation across declared dimensions. |
| **Scalar score** | A derived summary score computed from the reason vector. |
| **Fusion method** | The explicit formula or algorithm used to derive scalar score from vector. |
| **Calibration** | Controlled alignment of scores and decisions to external references or outcome signals. |
| **Threshold profile** | A task/risk-specific minimum acceptance profile. |
| **Shadow mode** | Experimental scoring that does not control consequence boundaries. |
| **Metabolism layer** | The cross-cutting efficiency model that tracks energy, yield, and waste. |
| **RootCauseTicket** | A durable object that records unresolved or upstream-attributed failure. |

---

## 6. Constitutional usage rules

- `APPROVED_FOR_DISPATCH` in the workflow state machine SHALL mean **approved for external consequence routing**.
- External consequence routing MAY resolve into:
  - governed communication (`DISPATCHED`), or
  - governed execution (`EXECUTING`).
- Review SHALL NOT be treated as equivalent to approval.
- Adjudication SHALL NOT be treated as equivalent to assurance.
- Completion SHALL NOT be treated as equivalent to archival.

---

## 7. Conclusion

This file is the single-source vocabulary spine of the `{sovereign}` foundation set.
