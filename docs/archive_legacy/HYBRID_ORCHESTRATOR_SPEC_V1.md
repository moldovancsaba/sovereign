# Hybrid Orchestrator Specification — v1.0

**Semi-Adaptive (Fixed Weights) + UCGS Integrated**

This document is the canonical product/engineering spec. The executable implementation lives in `apps/sovereign/src/lib/hybrid-orchestrator/`.

---

## 1. Orchestrator Overview

### 1.1 Purpose

The orchestrator:

- interprets input signals
- scores agents
- constructs optimal stack
- injects human interrupts when required
- routes execution under UCGS governance

### 1.2 Execution Flow

```
INPUT
→ SIGNAL EXTRACTION
→ AGENT SCORING
→ STACK CONSTRUCTION
→ HUMAN INTERRUPTS (if triggered)
→ EXECUTION
→ UCGS GOVERNANCE
→ OUTPUT ENVELOPE
```

---

## 2. Signal Model (Deterministic)

### 2.1 Signals

All signals normalized to **range [0.0 – 1.0]**.

### 2.2 Signal Definitions

| Signal | Meaning |
|--------|---------|
| **AMBIGUITY** | Degree of problem uncertainty / lack of clarity |
| **COMPLEXITY** | Number of interacting components / depth of reasoning required |
| **NOVELTY** | How unfamiliar / non-standard the problem is |
| **CONFLICT** | Contradictions between inputs, agents, or constraints |
| **CONFIDENCE** | Certainty of understanding (higher = more certain) |
| **EXECUTION_LOAD** | Effort required to implement solution |
| **COMMUNICATION_LOAD** | Difficulty of explaining output to user |

### 2.3 Signal Computation (v1 Heuristic)

Implemented in code as deterministic functions of optional **raw heuristic inputs** and/or **explicit signal overrides** (see `computeSignalsFromHeuristics`).

Conceptual relationships (post-normalization):

- AMBIGUITY ← lack of structure, vague language  
- COMPLEXITY ← constraints, steps  
- NOVELTY ← deviation from known patterns  
- CONFLICT ← contradictions detected  
- CONFIDENCE ← derived from ambiguity + conflict (inverse relationship)  
- EXECUTION_LOAD ← system depth, dependencies  
- COMMUNICATION_LOAD ← abstraction level, ambiguity  

---

## 3. Agent Affinity Matrix (Fixed)

### 3.1 Weight Table

Signals: **A** Ambiguity, **C** Conflict, **N** Novelty, **X** Complexity, **E** Execution load, **M** Communication load, **F** Confidence (negative weight reduces score when confidence is high).

### 3.2 Matrix (v1)

| Agent | Weights |
|--------|---------|
| **SULTAN** (human) | A +0.8, N +0.9, C +0.4, X +0.3 |
| **MISI** (human) | C +0.9, M +0.8, A +0.3 |
| **TRIBECA** | A +0.7, X +0.6, F −0.6 |
| **CHAPPIE** | X +0.8, E +0.7, A +0.4 |
| **CHIHIRO** | E +0.9, X +0.6, F +0.3 |
| **HATORI** | C +0.7, E +0.6, F −0.5 |
| **KATJA** | M +0.7, A +0.5 |
| **MEIMEI** | M +0.8, X +0.3 |
| **AGNES** | M +0.9, C +0.4 |

### 3.3 Score Formula

`agent_score = Σ (signal × weight)` over defined weights for that agent.

---

## 4. Stack Construction Algorithm

1. **Score** all **AI** agents (humans excluded from ranking).
2. **Rank** by score (descending).
3. **Select** top 3–5 agents (configurable bounds).
4. **Apply structural constraints** (hard rules below).
5. **Lead agent** = highest-scoring agent in the **final** ordered stack.

### 4.4 Hard Rules

- **TRIBECA** must precede **CHAPPIE** (if both present).
- **CHAPPIE** must precede **CHIHIRO**.
- **CHIHIRO** must precede **HATORI**.
- **HATORI** cannot exist without **CHAPPIE** or **CHIHIRO** (otherwise removed from stack).

### 4.5 Normal flow (conceptual)

INSIGHT → DESIGN → BUILD → FIX (mapped to the constrained pipeline agents when present).

---

## 5. Human Interrupt Logic

- **SULTAN_TRIGGER** = AMBIGUITY + NOVELTY → invoke if **> 1.2** (mode-dependent).
- **MISI_TRIGGER** = CONFLICT + COMMUNICATION_LOAD → invoke if **> 1.0** (mode-dependent).

**Injection points** (recorded in trace):

- SULTAN: pre-pipeline, mid-pipeline (if ambiguity persists).
- MISI: post-pipeline, mid-pipeline (if conflict detected).

**Constraints (governance, not code-enforced execution):**

- SULTAN: cannot modify execution steps.
- MISI: cannot modify system logic.

---

## 6. Execution Modes

| Mode | Behaviour |
|------|-----------|
| **AUTOMATED** | No human interrupts in trace |
| **AUGMENTED** (default) | Humans triggered via thresholds |
| **HUMAN_LED** | Humans included at pipeline start (initiation) |

---

## 7. UCGS Integration

### 7.1 Confidence

`confidence = 1 − (0.4×AMBIGUITY + 0.3×CONFLICT + 0.3×NOVELTY)` clamped to **[0, 1]**.

### 7.2 Trust tier

- **HIGH** if confidence ≥ 0.75  
- **MEDIUM** if 0.5 ≤ confidence < 0.75  
- **LOW** if confidence < 0.5  

### 7.3 Flags

`LOW_CONFIDENCE`, `DISAGREEMENT`, `CONSENSUS_FAILURE`, `FALLBACK_USED`, `SYSTEM_FAILURE`, `HUMAN_OVERRIDE`, `TAXONOMY_VIOLATION`, plus **`SKIPPED`** for empty-input fallback.

### 7.4 Routing (LOW trust)

Force **TRIBECA** re-analysis and/or **human interrupt** (recorded in `decision_path`).

---

## 8. Consensus Handling

- **UNANIMOUS** → trust contribution **HIGH**  
- **PARTIAL** → **MEDIUM** + **DISAGREEMENT**  
- **NONE** → **LOW** + **CONSENSUS_FAILURE**  

Lead defines final **RESULT**; disagreements logged in trace.

---

## 9. Fallback System

| Case | Label | Confidence | Flag |
|------|-------|------------|------|
| Empty input | `DEFAULT` | 0.51 | `SKIPPED` |
| System failure (caller) | `DEFAULT` | 0.50 | `SYSTEM_FAILURE` |

---

## 10. Observability (Mandatory Logging)

Trace shape (JSON-serializable):

```json
{
  "signals": {},
  "agent_scores": {},
  "selected_stack": [],
  "discarded_agents": [],
  "lead_agent": "",
  "human_invoked": [],
  "confidence": 0.0,
  "trust_tier": "",
  "flags": [],
  "decision_path": []
}
```

---

## 11. Output Envelope

- **label**: lead agent + result label  
- **confidence**, **trust_tier**, **flags**  
- **metadata**: full trace  

---

## 12. System Guarantees

- Always produces output (envelope + trace).  
- Always structured (typed JSON).  
- Always auditable (`decision_path`, flags).  
- Always governed by UCGS (confidence + trust tier + flags).  
- Stack selection is reproducible for identical inputs.  

---

## 13. Implementation

| Layer | Location |
|--------|----------|
| Engine | `apps/sovereign/src/lib/hybrid-orchestrator/` |
| HTTP (simulation) | `POST /api/orchestrator/hybrid` |

---

## 14. Next Steps (Recommended)

Run multiple executions with real inputs via API or in-app callers; collect traces; tune heuristic inputs or explicit overrides before UI work.
