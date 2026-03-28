# Sovereign Trinity Workforce Plan (Research + Implementation Blueprint)

## 1) Goal

Evolve `{sovereign}` into:

- a local-first autonomous workforce system,
- compatible with direct LLM usage patterns (including Ollama and OpenAI-compatible APIs),
- capable of dynamic team hiring per task,
- while preserving strict governance and auditability.

This plan merges:

- your `{trinity}` theory (`Drafter -> Writer -> Judge` with explicit confidence and bounded retries),
- `{hatori}` strengths (task-based routing, API-first operation, deterministic fallback behavior),
- existing `{sovereign}` capabilities (role enforcement, queue worker, runtime config overlays, judgement gates, hybrid orchestrator trace model).

---

## 2) Current-State Findings (from codebase research)

`{sovereign}` already has strong foundations:

- **Role pipeline assets exist** (`@Drafter`, `@Writer`, `@Controller`) in `apps/sovereign/nexus/ChatChainConfig.json`.
- **Execution governance exists** via deterministic `judgement-gates` and task queue boundaries.
- **Runtime abstraction exists** for local and cloud agents in `runtime-config` and `worker.js`.
- **Provider compatibility exists** in worker runtime:
  - local path calls `POST /api/chat` (Ollama style),
  - cloud path calls `POST /chat/completions` (OpenAI-compatible style).
- **Agent selection signals exist** in the Hybrid Orchestrator with auditable traces.
- **Gap is explicit in repo docs**: provider abstraction is still partial, and final-judgement semantics are incomplete.

Net: this is not a greenfield build. The system is already close to the target and needs productized composition.

---

## 3) Target Operating Model

### 3.1 Core execution entities

- **Single Agent**
  - one model + one runtime config + one role profile.
- **Group Agent**
  - at least two members (single agents and/or nested groups),
  - has a group policy and decision protocol.
- **Workforce**
  - registry of all agents and groups available for hiring.

### 3.2 Mandatory Trinity policy for sovereign decision flows

For tasks marked `decision_required=true`, force:

1. Drafter prepares assumptions/spec and confidence.
2. Writer executes implementation/output and confidence.
3. Judge validates against acceptance criteria and confidence.
4. Final decision computed by policy:
   - `ACCEPT` only when all required checks pass.

### 3.3 Clarification mandate (hard policy)

- **Drafter**
  - if confidence < threshold_drafter_low -> must ask clarification.
- **Writer**
  - if confidence < threshold_writer_low -> must ask clarification.
- **Judge**
  - if confidence < threshold_judge_low -> reject or request rework (no silent acceptance).

Recommended v1 thresholds:

- `drafter_low = 0.70`
- `writer_low = 0.75`
- `judge_low = 0.80`

These values should remain configurable per project.

### 3.4 Bounded retry policy

- Max attempts per artifact: `5` (aligning with `{trinity}`).
- Feedback goes only one hop upstream:
  - Judge -> Writer
  - Writer -> Drafter
- Stop on:
  - repeated same failure class,
  - no improvement across attempts,
  - structural failure,
  - attempt cap reached.

---

## 4) API Product Requirement (today's requirement)

You want `{sovereign}` to behave like "any other LLM + Ollama via API" and allow per-task hiring.

### 4.1 Introduce Sovereign API modes

Single endpoint style, multiple execution modes:

- `mode=direct`
  - behave like standard LLM call, one selected model/provider.
- `mode=trinity`
  - enforce `Drafter -> Writer -> Judge`.
- `mode=team`
  - run a chosen group agent policy.
- `mode=auto`
  - orchestrator selects best mode and team.

### 4.2 OpenAI-compatible facade

Add compatibility endpoints under `apps/sovereign/src/app/api/v1/`:

- `POST /api/v1/chat/completions`
- `GET /api/v1/models`
- `GET /api/v1/health`

Behavior:

- Accept OpenAI-style payload.
- Translate into sovereign internal task/envelope.
- Route through selected mode (`direct`, `trinity`, `team`, `auto`).
- Return OpenAI-style response envelope.

### 4.3 Ollama compatibility facade

Add local-runtime compatibility endpoints:

- `POST /api/v1/ollama/chat`
- `POST /api/v1/ollama/generate`
- `GET /api/v1/ollama/tags`

These can proxy directly to local provider when `mode=direct`, or execute sovereign team logic and still shape response in Ollama-like schema.

---

## 5) Hiring Model (dynamic per request)

### 5.1 Request-level staffing contract

Add request field:

```json
{
  "team": {
    "strategy": "manual | auto",
    "required_roles": ["drafter", "writer", "judge"],
    "preferred_agents": ["agentA", "agentB"],
    "budget": {
      "latency_ms": 12000,
      "max_tokens": 12000
    }
  }
}
```

### 5.2 Hiring pipeline

1. **Eligibility filter**: enabled + ready + runtime healthy + policy compliant.
2. **Capability score**:
   - historical quality,
   - latency fit,
   - role fit,
   - confidence calibration.
3. **Selection**:
   - if `strategy=manual`, honor preference order with safety checks.
   - if `strategy=auto`, use weighted rank.
4. **Commit**:
   - produce immutable staffing record in trace.

### 5.3 Ranking model (v1 practical)

Use deterministic weighted score first:

- quality score (40%)
- role-fit score (25%)
- latency score (20%)
- cost/token score (10%)
- recency reliability score (5%)

Then add Elo-like pairwise ranking in v2 for competitive model/group comparison.

---

## 6) Data Model Additions (Prisma-level)

Add minimal entities:

- `AgentProfileMetrics`
  - rolling quality/latency/reliability stats.
- `AgentGroup`
  - group metadata, policy, active flag.
- `AgentGroupMember`
  - member links (agent or nested group), role in group.
- `ExecutionArtifact`
  - stage outputs and confidence for each pass.
- `ExecutionDecision`
  - final decision, reason class, trust tier.
- `HiringDecisionLog`
  - selected team, rejected candidates, rationale.

All linked to thread/task/project for full audit continuity.

---

## 7) Decision Contract (Trinity envelope)

Each stage returns:

```json
{
  "artifactId": "uuid",
  "stage": "drafter|writer|judge",
  "agentKey": "string",
  "scores": {
    "confidence": 0.0,
    "impact": 0.0
  },
  "status": "accepted|revised|rejected|partial|needs_clarification",
  "reasonClass": "clarity|structure|grounding|policy|runtime|unknown",
  "content": {},
  "provenance": {
    "attempt": 1,
    "parentArtifactId": null,
    "timestamp": "ISO-8601"
  }
}
```

Fusion defaults:

- `final_confidence = d_conf * w_conf * j_conf`
- `final_impact = d_impact * w_impact * j_impact`

Final acceptance policy:

- `judge.status == accepted`
- no blocking policy gate violations
- `final_confidence >= acceptance_threshold`

---

## 8) Phased Implementation Plan

### Phase A - API Surface (fast win)

Deliver:

- OpenAI-compatible `chat/completions` endpoint,
- `models` and `health` endpoints,
- `mode=direct` routing to existing runtime stack.

Outcome:

- `{sovereign}` immediately usable as an LLM endpoint with Ollama/cloud-backed execution.

### Phase B - Trinity Runtime

Deliver:

- explicit `judge` role support (semantic rename from `controller` for decision layer),
- confidence thresholds + mandatory clarification policy,
- bounded retry loop with reason classes,
- stage artifact persistence.

Outcome:

- real Trinity flow, not only role-themed chain.

### Phase C - Workforce Hiring

Deliver:

- `AgentGroup` support (single + nested groups),
- request-level team staffing contract,
- deterministic hiring scorer,
- staffing logs + replayable trace.

Outcome:

- dynamic team composition "hire per task."

### Phase D - Ranking + Optimization

Deliver:

- performance telemetry to quality dashboard,
- model/group ranking table,
- optional Elo tournament for candidate promotion.

Outcome:

- workforce improves over time with measurable selection logic.

---

## 9) Mapping From Existing Components (No-Rewrite Strategy)

- Reuse `judgement-gates` for hard execution boundaries.
- Reuse `runtime-config` for provider + project overlay resolution.
- Reuse worker provider calls for local/cloud execution.
- Reuse `hybrid-orchestrator` signal extraction for `mode=auto` team suggestion.
- Extend `nexus` role chain with explicit Judge contract and confidence policies.

This avoids replacing stable modules and reduces delivery risk.

---

## 10) Risks and Mitigations

- **Role confusion (`Controller` vs `Judge`)**
  - Mitigation: keep `Controller` as orchestration control-plane role; add `Judge` as decision role.
- **Latency growth in multi-stage mode**
  - Mitigation: default to `mode=direct`; use `trinity` only when requested or policy-required.
- **Schema sprawl**
  - Mitigation: phase in tables; keep v1 envelope minimal.
- **False confidence self-reporting**
  - Mitigation: track confidence calibration and penalize unreliable agents in hiring score.

---

## 11) Recommended Immediate Next Build (first sprint)

1. Add `POST /api/v1/chat/completions` facade with `mode` parameter.
2. Add internal executor interface:
   - `executeDirect()`
   - `executeTrinity()`
3. Implement `executeTrinity()` v1 with:
   - Drafter/Writer/Judge stage envelope,
   - confidence thresholds,
   - clarification-required status,
   - max-attempt loop = 5.
4. Persist stage artifacts and final decision in DB.
5. Add simple manual hiring:
   - user may specify role->agent map per request.
6. Ship observability:
   - request trace ID,
   - selected team,
   - confidence chain.

This gives you a usable sovereign API quickly while preserving the path to full workforce intelligence.

---

## 12) Definition of Done (for the requirement in this request)

Done means:

- You can call `{sovereign}` like an LLM API.
- It can run with local Ollama-backed models.
- You can select or auto-select agents per task.
- Trinity decisions include confidence and clarification behavior.
- Runs are auditable end-to-end with traceable hiring and judgement artifacts.

