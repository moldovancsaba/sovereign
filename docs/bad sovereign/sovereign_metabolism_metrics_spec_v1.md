# {sovereign} - Metabolism Metrics Specification

**Status:** Foundational Normative Specification  
**Version:** v1.0  
**Date:** 2026-03-27  
**Scope:** Formal metabolic variables, equations, KPI definitions, collection points, normalization rules, and routing/optimization usage across `{sovereign}`

---

## 1. Purpose

This document defines the metabolism metrics model of `{sovereign}`.

It answers the system question:

> **How does `{sovereign}` measure the efficiency with which it converts effort into accepted value while identifying waste, recurrence, and unsustainable operating patterns?**

Without a formal metabolism specification:

- the system can appear intelligent while being operationally wasteful
- retries may continue long after their return collapses
- high-cost branches may hide behind occasional success
- recurring defects may be expensive without becoming visible
- routing cannot improve based on economic reality
- calibration and assurance cannot be compared against operational cost
- memory and ticket systems cannot be tied cleanly to real efficiency outcomes

This document therefore defines the constitutional efficiency language of `{sovereign}`.

---

## 2. Reader Orientation

The metabolism layer is not an observability ornament.

In `{sovereign}`, metabolism is a governing concept.  
It exists to answer questions such as:

- how much energy did this workflow consume?
- how much useful yield did it produce?
- how much of that effort became waste?
- which retry paths are still worth operating?
- which planes or routes are systematically expensive?
- which defects are metabolically toxic even if some workflows still complete?

This document is normative because efficiency without definition quickly becomes vanity accounting.

---

## 3. Core Thesis

The core thesis is:

> **`{sovereign}` SHALL measure not only whether work succeeded, but whether the system produced durable value efficiently enough to justify its chosen path.**

This means:
- effort SHALL be modeled explicitly
- yield SHALL be modeled explicitly
- waste SHALL be modeled explicitly
- efficiency and waste ratios SHOULD influence routing, retries, and remediation
- metabolic signals SHALL remain subordinate to risk, policy, and assurance boundaries

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
| **Energy explicitness** | Resource expenditure SHALL be modeled rather than assumed. |
| **Yield explicitness** | Accepted value SHALL be modeled rather than hand-waved. |
| **Waste explicitness** | Rejected, duplicated, blocked, or unresolved work SHALL be measurable. |
| **Multi-level accounting** | Metrics SHOULD be available at artifact, stage, plane, workflow, and portfolio levels. |
| **Governed interpretation** | Metabolic metrics SHALL NOT override risk, assurance, or approval rules. |
| **Comparability** | Metrics SHOULD support comparison across branches, prompts, models, and routing strategies. |
| **Learning utility** | Metrics SHOULD inform reroute, retry, and remediation decisions. |

---

## 7. Why Metabolism Exists

### 7.1 Human explanation

Most systems report activity.  
Far fewer report whether activity was worthwhile.

A workflow may:
- complete successfully but consume too much energy
- look elegant but generate hidden waste
- fail repeatedly for the same reason
- produce high-quality outputs that are too expensive for their class of work
- appear cheap because they shift unresolved cost into other planes

The metabolism layer exists so `{sovereign}` can understand not just output quality, but **operational viability**.

### 7.2 Constitutional implication

A path that is occasionally clever but systematically wasteful SHALL be visible as such.

---

## 8. Metabolic Variables

### 8.1 Energy

Energy captures what the system spent to move work forward.

`E = E_tokens + E_calls + E_latency + E_compute + E_retries + E_human`

Where:

- `E_tokens` = model token expenditure
- `E_calls` = service / model / tool invocation cost
- `E_latency` = elapsed time cost
- `E_compute` = runtime / infrastructure cost
- `E_retries` = additional cost caused by repeated attempts
- `E_human` = human review or approval effort cost

### 8.2 Yield

Yield captures what the system successfully converted into accepted value.

`Y = Y_acceptance + Y_quality + Y_reuse + Y_outcome`

Where:

- `Y_acceptance` = accepted artifacts or accepted governed steps
- `Y_quality` = calibrated quality contribution
- `Y_reuse` = future reuse potential
- `Y_outcome` = downstream task completion or business utility proxy

### 8.3 Waste

Waste captures what the system spent but could not convert into durable value.

`W = W_rejects + W_deadends + W_ambiguity + W_duplication + W_rootcause`

Where:

- `W_rejects` = rejected artifacts or failed candidate outputs
- `W_deadends` = abandoned branches or non-productive attempts
- `W_ambiguity` = unresolved clarification or low-confidence residue
- `W_duplication` = duplicated work across retries or branches
- `W_rootcause` = unresolved systemic defect cost captured through tickets

---

## 9. Core Metabolic Ratios

### 9.1 Metabolic efficiency

`ME = Y / E`

Interpretation:
How much accepted value is produced per unit of energy.

### 9.2 Waste ratio

`WR = W / E`

Interpretation:
How much spent energy turned into residue rather than durable value.

### 9.3 Net useful yield

`NUY = Y - W`

Interpretation:
How much useful value remains after waste is accounted for.

### 9.4 Branch efficiency

`BE_i = Y_i / E_i`

Interpretation:
Efficiency of branch `i` in a branchable workflow.

### 9.5 Retry return

`RR = ΔY / ΔE_retry`

Interpretation:
Additional useful yield gained per additional retry energy.

### 9.6 Plane burden

`PB_p = E_p / E_total`

Interpretation:
Energy share consumed by plane `p`.

This helps reveal whether one plane is metabolically dominating the workflow.

---

## 10. Measurement Domains

### 10.1 Human explanation

Not all inefficiency lives at the same level.

A workflow may be expensive because:
- one artifact path is wasteful
- one stage is slow
- one plane keeps causing reroutes
- one task family is badly calibrated
- one portfolio segment has recurrent tickets

### 10.2 Domains

| Domain | Meaning |
| --- | --- |
| **Artifact level** | cost/yield/waste for one artifact path |
| **Stage level** | cost/yield/waste for Discuss / Discover / Distill / etc. |
| **Plane level** | cost/yield/waste contribution by plane |
| **Workflow level** | end-to-end metabolic picture for one governed workflow |
| **Portfolio level** | system-wide pattern across workflows, task types, and risk classes |

---

## 11. Collection Points

Metabolic signals SHOULD be collected at the following points:

- workflow state transitions
- artifact creation and rejection
- retry events
- branch open / merge / terminate events
- assurance outcomes
- communication consequence events
- execution consequence events
- ticket creation and closure
- memory review and supersession events

### 11.1 Why

Without explicit collection points, metabolic models become approximate narratives instead of measurable system behavior.

---

## 12. Normalization Rules

### 12.1 Human explanation

Raw cost numbers are not enough because workflows differ in size, risk, and value.

### 12.2 Normalization dimensions

Metrics SHOULD be normalizable by:
- task family
- risk class
- artifact type
- branch count
- consequence type
- time window
- portfolio segment

### 12.3 Rule

A high-cost workflow SHALL NOT automatically be judged weak if its risk class or value class justifies deeper assurance or human oversight.

### 12.4 Important caution

The metabolism layer SHALL NOT reduce all operating quality to “cheapness.”  
Necessary depth is not automatically waste.

---

## 13. KPI Set

The first operational KPI set SHOULD include:

- average metabolic efficiency by task family
- average waste ratio by plane
- retry return by artifact type
- branch efficiency dispersion
- average net useful yield per workflow
- time-to-accepted-artifact
- cost-to-accepted-artifact
- unresolved ticket waste by plane
- stale-memory linked waste rate
- assurance-induced waste vs prevented consequence rate

---

## 14. Relationship to Workflow

### 14.1 Human explanation

The workflow state machine is one of the main anchors of metabolic accounting.

### 14.2 Rules

Each workflow state SHOULD record:
- entry time
- exit time
- dwell time
- owner
- energy spent
- yield produced
- waste generated
- interventions applied

### 14.3 Why

This allows the system to answer whether inefficiency is coming from:
- planning
- production
- assurance
- communication
- execution
- memory-related rerouting

---

## 15. Relationship to Failure Taxonomy and Tickets

### 15.1 Failure linkage

Failure classes SHOULD support waste attribution such as:
- rejected content waste
- repeated retry waste
- assurance waste
- dispatch/execution waste
- unresolved root-cause waste

### 15.2 Ticket linkage

`RootCauseTicket`s SHOULD feed:
- unresolved waste measurement
- recurrence burden
- post-remediation improvement analysis

### 15.3 Rule

A recurring systemic defect SHALL be visible metabolically even if some workflows still complete.

---

## 16. Relationship to Scoring and Calibration

### 16.1 Human explanation

High quality and high efficiency are related but not identical.

A path MAY produce excellent outputs at unacceptable cost.  
Another path MAY be cheap but not good enough.

### 16.2 Rules

The metabolism layer SHOULD compare:
- evaluation quality vs energy spent
- scalar and vector improvement vs retry cost
- fusion methods vs operational return
- calibration profiles vs actual waste

### 16.3 Retry return

`RR = ΔY / ΔE_retry` SHALL be available to retry logic wherever practical.

When retry return collapses, local optimization SHOULD stop or escalate.

---

## 17. Relationship to Memory

### 17.1 Memory linkage

Memory quality affects metabolism by changing:
- retrieval efficiency
- repetition of avoidable mistakes
- waste caused by stale assumptions
- reuse yield from prior successful artifacts or playbooks

### 17.2 Suggested memory-related KPIs

- memory review hit rate
- stale-memory induced failure rate
- semantic reuse yield
- profile-memory overwrite frequency
- ticket volume caused by memory defects

---

## 18. Routing and Optimization Use

### 18.1 Human explanation

Metabolism is not passive reporting.  
It exists so `{zeno}` can learn which paths are sustainable.

### 18.2 Control uses

`{zeno}` SHOULD use metabolism to:
- prefer lean paths for cheap low-risk tasks
- allow deeper paths where expected return justifies them
- cut off weak branches
- shorten retries when retry return collapses
- escalate when waste grows faster than yield
- compare kernels, prompts, models, and routes over time

### 18.3 Constraint

Metabolic optimization SHALL remain subordinate to:
- policy
- risk
- assurance
- approval
- constitutional invariants

---

## 19. Worked Examples

### 19.1 Cheap internal summary with strong local outcome
- low `E`
- acceptable `Y`
- low `W`
- high `ME`
- good candidate for lean routing

### 19.2 External email draft with many retries but small gain
- rising `E_retries`
- flat `ΔY`
- low `RR`
- route should escalate or terminate rather than keep refining

### 19.3 Deployment candidate with high assurance cost but justified value
- high `E_human` and assurance burden
- high `Y_outcome` if accepted
- not automatically wasteful because risk and consequence justify depth

### 19.4 Repeated stale-memory failures across workflows
- visible `W_rootcause`
- recurrence burden rising
- ticket-linked waste indicates systemic repair is overdue

---

## 20. Invariants

1. energy, yield, and waste SHALL all remain explicit concepts
2. metabolic metrics SHALL NOT override risk or assurance boundaries
3. retry optimization SHALL consider retry return, not only raw success count
4. recurring unresolved defects SHALL remain metabolically visible
5. necessary high-risk assurance cost SHALL NOT be mislabeled as waste merely because it is expensive
6. metabolic data SHOULD remain comparable across task families and time windows where possible

---

## 21. Integration With Other Specs

- **Foundation** defines the metabolism concept constitutionally.
- **Workflow state machine** provides state-level measurement anchors.
- **Failure taxonomy** provides waste attribution language.
- **RootCauseTicket spec** provides durable defect burden objects.
- **Memory retention and decay** affects reuse yield and stale-memory waste.
- **Score/calibration** relates quality improvements to effort spent.
- **Risk policy** determines when expensive depth is justified.

---

## 22. Conclusion

The purpose of the metabolism layer is not to count activity.

It is to make `{sovereign}` economically and structurally legible.

The system SHALL:
- measure effort
- measure yield
- measure waste
- and learn which kinds of intelligence are actually worth operating
