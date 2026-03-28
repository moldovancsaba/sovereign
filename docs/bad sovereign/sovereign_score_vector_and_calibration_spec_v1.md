# {sovereign} - Score Vector and Calibration Specification

**Status:** Foundational Specification  
**Version:** v1.0  
**Date:** 2026-03-27  
**Scope:** Evaluation dimensions, reason vectors, scalar derivation, calibration policy, experimental comparison, and scoring governance across the `{sovereign}` ecosystem

---

## 1. Purpose

This document defines the **score vector and calibration model** of `{sovereign}`.

Its purpose is to answer the following system question:

> **How does `{sovereign}` evaluate provisional outputs in a way that is interpretable, calibratable, experimentally comparable, and constitutionally bounded?**

Without a formal scoring and calibration specification:

- `{trinity}` cannot judge artifacts consistently
- `{tribeca}` cannot distinguish local judgment from stronger assurance
- `{zeno}` cannot compare routes, branches, or retries rationally
- `{messmass}` cannot contribute ranking signals coherently
- the metabolism layer cannot measure quality return against effort
- experimentation degrades into anecdotal tuning

This document therefore defines the **evaluation language** of the system.

---

## 2. Reader Orientation

This document is dual-layered by design:

- **Human layer** — explains why evaluation is structured this way
- **System layer** — defines vectors, scalar derivation, metadata, calibration logic, and governance constraints

The intent is not merely to score things.  
The intent is to make scoring **interpretable, bounded, and improvable**.

---

## 3. Core Thesis

`{sovereign}` does not treat one number as truth.

The core thesis is:

> **Evaluation SHALL be vector-first, scalar-second, and calibration-bound.**

This means:

- local judgment MUST preserve structured reasons
- scalar scores MAY summarize, but SHALL NOT erase diagnostic structure
- calibration is a system process, not a one-time choice
- score use SHALL remain subordinate to risk policy, assurance, and workflow guards

A fluent output with a high scalar score is still only a **provisional candidate** unless the constitutional system permits consequence.

---

## 4. Normative Language

This specification uses the following normative keywords:

- **SHALL** / **SHALL NOT** → mandatory constitutional requirement
- **SHOULD** / **SHOULD NOT** → strong default requirement unless a justified exception exists
- **MAY** → permitted but optional behavior

---

## 5. Canonical Terminology Reference

This document SHALL interpret the following terms exactly as defined in the canonical definitions table of the `{sovereign}` foundation:

- adjudication
- assurance
- approval
- review
- consequence
- provisional output
- risk elevation

Where these terms appear here, the foundation definition remains authoritative.

---

## 6. Design Principles

| Principle | Meaning |
| --- | --- |
| **Vector first** | Structured evaluation dimensions SHALL be preserved explicitly. |
| **Scalar second** | Scalar summaries MAY be derived, but SHALL NOT replace the vector. |
| **Calibration over intuition** | Fusion rules and thresholds SHALL be measured and compared, not treated as doctrine. |
| **Evidence over confidence theater** | High confidence SHALL NOT compensate for missing provenance or weak evaluation structure. |
| **Task-relative scoring** | Evaluation SHOULD be conditioned by task type, risk class, and consequence context. |
| **Comparability** | Scores SHOULD remain comparable across models, prompts, routes, and experiments. |
| **Governed use** | Scores SHALL remain subordinate to workflow guards and assurance boundaries. |

---

## 7. Why Vector-First Evaluation Exists

### 7.1 Human explanation

A single score is seductive because it is simple.  
It is also dangerous because it hides **why** something is strong or weak.

A system that only stores one scalar cannot answer questions like:

- Was the artifact well grounded but poorly structured?
- Did quality improve, or did the wording merely become more persuasive?
- Is the output acceptable for internal use but not external consequence?
- Did the retry improve usefulness while damaging completeness?
- Is the model strong, or is the judge biased?

That is why `{sovereign}` makes the **reason vector** the primary evaluation object.

### 7.2 Constitutional implication

No consequential evaluation in `{sovereign}` SHALL exist only as a scalar.

---

## 8. Canonical Reason Vector

### 8.1 Baseline dimensions

The baseline reason vector SHALL include the following dimensions unless a task-specific schema explicitly extends or overrides them:

| Dimension | Meaning |
| --- | --- |
| **grounding** | factual or evidentiary support relative to available context |
| **structure** | coherence, organization, and fitness of arrangement |
| **completeness** | coverage of required parts and constraints |
| **language** | clarity, fluency, precision, and readability |
| **usefulness** | practical utility relative to the requested outcome |
| **policy** | compliance with known policy, safety, and governance constraints |

### 8.2 Canonical example

```json
{
  "grounding": 0.90,
  "structure": 0.40,
  "completeness": 0.75,
  "language": 0.88,
  "usefulness": 0.80,
  "policy": 1.00
}
```

### 8.3 Range rule

Each vector dimension SHOULD be represented on a normalized `[0,1]` scale unless an approved alternate scale is explicitly documented.

### 8.4 Extension rule

Additional dimensions MAY be added for task families, for example:

- `tone_fit`
- `evidence_density`
- `channel_fitness`
- `technical_correctness`
- `executability`

Extensions SHALL preserve the baseline dimensions unless a justified task family excludes one.

---

## 9. Evaluation Object Requirements

Every consequential evaluation SHALL preserve:

- `reasonVector`
- `scalarScore`
- `fusionMethodId`
- `calibrationVersion`
- `judgeVersion`
- `modelVersion` where relevant
- `taskType`
- `riskClass`
- `timestamp`
- `decision`

### 9.1 Minimal canonical example

```json
{
  "reasonVector": {
    "grounding": 0.90,
    "structure": 0.40,
    "completeness": 0.75,
    "language": 0.88,
    "usefulness": 0.80,
    "policy": 1.00
  },
  "scalarScore": 0.61,
  "fusionMethodId": "product_v1",
  "calibrationVersion": "calib_001",
  "judgeVersion": "judge_v1",
  "taskType": "email_draft",
  "riskClass": "R2",
  "decision": "revise"
}
```

---

## 10. Scalar Derivation

### 10.1 Human explanation

The scalar exists for ranking, comparison, and thresholding.  
It does not exist to replace reasoning.

### 10.2 Default benchmark rule

The default benchmark fusion rule in `{sovereign}` is **multiplicative fusion**.

`S = Π_i v_i`

Where:
- `S` = scalar score
- `v_i` = dimension values of the reason vector

### 10.3 Why multiplicative fusion is the default

It is conservative.  
A strong score in one dimension cannot fully hide collapse in another.

This is useful during early system development because it exposes weak links instead of averaging them away.

### 10.4 Limitation

Multiplicative fusion is not treated as truth or as permanent doctrine.  
It is the **default benchmarkable rule**, not the final truth engine.

---

## 11. Alternative Fusion Families

The system MAY evaluate alternative fusion families.

### 11.1 Weighted product
`S = Π_i v_i^w_i`

Use when dimensions need differential importance.

### 11.2 Weighted sum
`S = Σ_i w_i * v_i`

Use when compensatory behavior is intentionally allowed.

### 11.3 Minimum-bound score
`S = min(v_i)`

Use when the weakest dimension should dominate.

### 11.4 Hybrid rule
`S = f(vector, taskType, riskClass, calibrationProfile)`

Use when task family or consequence class demands more context-sensitive fusion.

### 11.5 Constitutional rule

Any alternate fusion method SHALL have:
- a `fusionMethodId`
- an explicit formula or algorithm definition
- a calibration record
- task/risk applicability notes

---

## 12. Decision Outcomes

Evaluation decisions SHOULD use a bounded decision vocabulary.

| Decision | Meaning |
| --- | --- |
| **accept_local** | locally acceptable under current task/risk policy |
| **revise** | send back for improvement |
| **reject_local** | not acceptable even for local continuation without reroute |
| **escalate_assurance** | must cross into `{tribeca}` |
| **escalate_human_review** | must be reviewed by human |
| **escalate_human_approval** | must be explicitly approved by human |

### 12.1 Rule

A decision SHALL be interpreted in the context of:
- risk class
- workflow state
- consequence intent

A local “accept” SHALL NOT bypass the stronger boundary required by the risk policy.

---

## 13. Thresholds and Task Profiles

### 13.1 Human explanation

Not all tasks deserve the same score threshold.  
A quick internal summary and a customer-facing recommendation should not be judged by the same acceptance bar.

### 13.2 Profile concept

Thresholds SHOULD be defined by **task profile**, not globally.

A task profile MAY include:
- task type
- risk class
- channel class
- audience class
- artifact type

### 13.3 Example threshold profile

```json
{
  "profileId": "email_external_r2",
  "taskType": "email_draft",
  "riskClass": "R2",
  "minimums": {
    "grounding": 0.75,
    "structure": 0.70,
    "completeness": 0.70,
    "language": 0.80,
    "usefulness": 0.75,
    "policy": 0.95
  },
  "minimumScalar": 0.55
}
```

### 13.4 Constitutional rule

Threshold profiles SHALL NOT override workflow guards or risk policy.  
They only determine the local judgment boundary.

---

## 14. Calibration Model

### 14.1 Human explanation

Calibration is the process by which evaluation becomes trustworthy enough to compare variants.

The goal is not only to produce a score.  
The goal is to make the score mean roughly the same thing across:
- prompts
- models
- branches
- judges
- time

### 14.2 Calibration definition

Calibration in `{sovereign}` means:

> **the controlled alignment of reason vectors, scalar summaries, and decisions against external reference judgments or outcome signals**

### 14.3 Calibration sources

Calibration MAY use:
- human labels
- historical accepted/rejected artifacts
- downstream success metrics
- paired comparisons
- assurance outcomes
- production performance proxies

### 14.4 Calibration record

Every calibration run SHOULD produce a record containing:

- calibration id
- date range
- dataset or sample definition
- evaluator versions
- fusion methods compared
- task profiles covered
- metrics used
- winner / retained method
- limitations

---

## 15. Experimental Comparison Policy

### 15.1 Human explanation

The system is explicitly designed to improve through controlled experimentation.

This means you do not merely “believe” a better fusion method exists.  
You compare it.

### 15.2 Allowed comparison modes

- A/B comparison
- A/B/C/…/n comparison
- paired comparison with human adjudication
- historical replay comparison
- shadow scoring without consequence power

### 15.3 Comparison rule

A candidate scoring method SHALL NOT replace the active production method unless:
- it is identified explicitly
- it is evaluated against a reference set
- the comparison result is recorded
- the deployment decision is recorded

### 15.4 Shadow mode

New scoring methods SHOULD first run in **shadow mode** where they observe and score but do not control consequence boundaries.

---

## 16. Judge and Calibration Bias

### 16.1 Human explanation

A judge can be useful and still be biased.  
Calibration therefore exists partly to protect the system from trusting one evaluator too easily.

### 16.2 Known bias surfaces

The system SHOULD assume possible bias from:
- prompt framing
- position effects
- self-preference
- wording sensitivity
- order effects
- model drift
- calibration drift

### 16.3 Governance rule

The judge SHALL be treated as a bounded evaluator, not as a universal truth engine.

### 16.4 Practical implication

When the system changes:
- prompt
- model
- judge version
- fusion method
- threshold profile

it SHOULD treat that as a calibration-relevant event.

---

## 17. Relationship to Risk and Assurance

### 17.1 Human explanation

Scoring helps local judgment.  
Risk and assurance govern consequence.

### 17.2 Rule hierarchy

The following order SHALL apply:

1. policy constraints
2. risk class requirements
3. assurance boundary requirements
4. workflow guards
5. evaluation results
6. local optimization preferences

### 17.3 Constitutional consequence

A high scalar score SHALL NOT:
- lower risk class
- skip assurance
- replace approval
- authorize external consequence by itself

---

## 18. Retry and Improvement Logic

### 18.1 Human explanation

Evaluation is part of the retry system because the system must know whether another attempt is worth the cost.

### 18.2 Improvement signal

A retry SHOULD be considered beneficial when:
- one or more critical vector dimensions improve materially
- scalar score improves under the active fusion rule
- consequence readiness increases
- waste added remains acceptable under metabolic policy

### 18.3 Collapse signal

A retry SHOULD be terminated or escalated when:
- scalar gain is negligible
- critical vector dimensions stagnate
- policy remains weak
- retry return collapses
- the same failure pattern repeats

### 18.4 Retry return formula

`RR = ΔY / ΔE_retry`

Where:
- `ΔY` = change in useful yield proxy
- `ΔE_retry` = additional energy spent on retry

This links scoring to the metabolism layer.

---

## 19. Calibration by Task Family

The system SHOULD calibrate separately for at least the following families:

- internal summaries
- external communications
- decision-support recommendations
- technical artifacts
- deployment candidates
- memory write candidates

### 19.1 Why

Different task families fail differently.  
A single global calibration profile will create false confidence.

---

## 20. Minimum Metadata Requirements

Every stored evaluation SHALL include at least:

- `evaluationId`
- `artifactId`
- `workflowId`
- `taskType`
- `riskClass`
- `reasonVector`
- `scalarScore`
- `fusionMethodId`
- `calibrationVersion`
- `judgeVersion`
- `decision`
- `timestamp`

---

## 21. Worked Examples

### 21.1 Internal summary (R1)
- vector used for local quality gating
- scalar used for branch/reroute comparison
- no mandatory assurance by class
- acceptance remains local and provisional until workflow closure

### 21.2 External email draft (R2)
- vector and scalar used locally
- threshold profile stricter than internal summary
- local “accept” still routes into `{tribeca}`
- communication consequence depends on assurance, not score alone

### 21.3 Deployment candidate (R3)
- technical correctness extension MAY be added to baseline vector
- local scoring helps compare variants
- assurance and often human review still required before consequence

---

## 22. Invariants

The following invariants SHALL hold:

1. no consequential evaluation SHALL omit the reason vector
2. scalar score SHALL NOT exist without fusion metadata
3. local evaluation SHALL NOT substitute for assurance when risk class requires stronger review
4. a calibration version SHALL accompany active scoring methods
5. alternate scoring methods SHALL be versioned and comparable
6. no score SHALL by itself authorize consequence
7. threshold profiles SHALL remain task-relative, not blindly global

---

## 23. Integration with Other Foundational Documents

This specification binds directly to the rest of the `{sovereign}` foundation set:

- **Foundation**  
  provides ideology, canonical definitions, and constitutional invariants

- **Risk Classes and Escalation Policy**  
  determines when local scoring is sufficient and when stronger review is mandatory

- **Workflow State Machine**  
  determines where evaluation occurs and what transitions its outputs may influence

- **Interface Contract Spec**  
  determines how evaluations, artifacts, and calibration metadata are serialized

- **Metabolism Metrics Spec**  
  interprets scoring improvement against energy, yield, and waste

### 23.1 Rule

If scoring logic conflicts with risk policy, workflow guards, or assurance requirements, the constitutional layer SHALL prevail.

---

## 24. Vocabulary

| Term | Definition |
| --- | --- |
| **Reason vector** | Structured evaluation across declared dimensions |
| **Scalar score** | A derived summary score computed from the reason vector |
| **Fusion method** | The explicit formula or algorithm used to derive scalar score from vector |
| **Calibration** | Controlled alignment of scores and decisions to external references or outcome signals |
| **Threshold profile** | A task/risk-specific minimum acceptance profile |
| **Shadow mode** | Experimental scoring that does not control consequence boundaries |

---

## 25. Conclusion

The purpose of scoring in `{sovereign}` is not to produce a magical number.  
It is to create a disciplined evaluation language that remains interpretable, comparable, and governable.

That is the governing idea:

> **Judge with vectors.  
> Summarize with scalars.  
> Improve through calibration.  
> Never confuse score with sovereignty.**
