type AgentJudgementSnapshot = {
  enabled: boolean;
  runtime: "MANUAL" | "LOCAL" | "CLOUD";
  readiness: "NOT_READY" | "READY" | "PAUSED";
  controlRole: "ALPHA" | "BETA";
};

type JudgementGateSeverity = "BLOCK" | "INFO";

export type JudgementGateCheck = {
  policyId: string;
  passed: boolean;
  severity: JudgementGateSeverity;
  reason: string;
  evidence: Record<string, unknown>;
};

export type JudgementGateDecision = {
  policyVersion: "judgement-gates-v1";
  decision: "GO" | "NO_GO";
  allowed: boolean;
  status: "QUEUED" | "MANUAL_REQUIRED";
  error: string | null;
  controlBoundaryDenied: boolean;
  summary: string;
  checks: JudgementGateCheck[];
};

export const AGENT_NOT_READY_REASON =
  "Agent readiness is NOT_READY. Complete the readiness checklist and switch the agent to READY.";
export const AGENT_PAUSED_REASON =
  "Agent readiness is PAUSED. Task is queued and will execute after switching back to READY.";
export const CONTROL_INTENT_BETA_REASON =
  "Control-intent task denied for BETA role. Route strategic/control requests to an ALPHA agent.";

function isControlIntent(text: string) {
  const raw = String(text || "").toLowerCase();
  return /\b(plan|decompose|delegate|assign|coordinate|priorit|strategy|roadmap)\b/.test(
    raw
  );
}

export function evaluateTaskJudgementGate(input: {
  agentKey: string;
  title: string;
  agent: AgentJudgementSnapshot | null;
}): JudgementGateDecision {
  const checks: JudgementGateCheck[] = [];
  const trimmedTitle = String(input.title || "").trim();
  const controlIntent = isControlIntent(trimmedTitle);

  checks.push({
    policyId: "TITLE_NON_EMPTY",
    passed: Boolean(trimmedTitle),
    severity: "BLOCK",
    reason: trimmedTitle ? "Task title is present." : "Task title is empty.",
    evidence: {
      titleLength: trimmedTitle.length
    }
  });

  const agent = input.agent;
  checks.push({
    policyId: "AGENT_REGISTERED",
    passed: Boolean(agent),
    severity: "BLOCK",
    reason: agent ? `Agent @${input.agentKey} is registered.` : `Agent @${input.agentKey} is not registered in Sovereign.`,
    evidence: {
      agentKey: input.agentKey,
      exists: Boolean(agent)
    }
  });

  if (agent) {
    checks.push({
      policyId: "CONTROL_INTENT_ALPHA_ONLY",
      passed: !(controlIntent && agent.controlRole === "BETA"),
      severity: "BLOCK",
      reason:
        controlIntent && agent.controlRole === "BETA"
          ? CONTROL_INTENT_BETA_REASON
          : "Control-intent boundary check passed.",
      evidence: {
        controlIntent,
        controlRole: agent.controlRole
      }
    });

    checks.push({
      policyId: "AGENT_ENABLED",
      passed: agent.enabled,
      severity: "BLOCK",
      reason: agent.enabled ? `Agent @${input.agentKey} is enabled.` : `Agent @${input.agentKey} is disabled.`,
      evidence: {
        enabled: agent.enabled
      }
    });

    checks.push({
      policyId: "RUNTIME_AUTONOMOUS",
      passed: agent.runtime === "LOCAL" || agent.runtime === "CLOUD",
      severity: "BLOCK",
      reason:
        agent.runtime === "LOCAL" || agent.runtime === "CLOUD"
          ? `Agent runtime ${agent.runtime} is runnable.`
          : `Agent @${input.agentKey} uses MANUAL runtime and cannot execute automatically.`,
      evidence: {
        runtime: agent.runtime
      }
    });

    checks.push({
      policyId: "READINESS_NOT_READY_BLOCK",
      passed: agent.readiness !== "NOT_READY",
      severity: "BLOCK",
      reason:
        agent.readiness !== "NOT_READY"
          ? `Agent readiness is ${agent.readiness}.`
          : AGENT_NOT_READY_REASON,
      evidence: {
        readiness: agent.readiness
      }
    });

    checks.push({
      policyId: "READINESS_PAUSED_QUEUE_NOTE",
      passed: true,
      severity: "INFO",
      reason:
        agent.readiness === "PAUSED"
          ? AGENT_PAUSED_REASON
          : "Agent readiness does not require pause-note handling.",
      evidence: {
        readiness: agent.readiness
      }
    });
  }

  const firstBlockingFailure = checks.find((check) => check.severity === "BLOCK" && !check.passed);
  const allowed = !firstBlockingFailure;
  const status: "QUEUED" | "MANUAL_REQUIRED" = allowed ? "QUEUED" : "MANUAL_REQUIRED";

  let error: string | null = firstBlockingFailure ? firstBlockingFailure.reason : null;
  if (!firstBlockingFailure && agent?.readiness === "PAUSED") {
    error = AGENT_PAUSED_REASON;
  }

  const controlBoundaryDenied = checks.some(
    (check) => check.policyId === "CONTROL_INTENT_ALPHA_ONLY" && check.passed === false
  );

  return {
    policyVersion: "judgement-gates-v1",
    decision: allowed ? "GO" : "NO_GO",
    allowed,
    status,
    error,
    controlBoundaryDenied,
    summary: allowed
      ? "Judgement gate GO: deterministic policy checks passed."
      : `Judgement gate NO_GO: ${firstBlockingFailure?.reason || "policy failure"}`,
    checks
  };
}
