import type { Agent, AgentReadiness } from "@prisma/client";
import type { AgentSetting } from "@/lib/settings-store";

export const AGENT_NOT_READY_REASON =
  "Agent readiness is NOT_READY. Complete the readiness checklist and switch the agent to READY.";
export const AGENT_PAUSED_REASON =
  "Agent readiness is PAUSED. Task is queued and will execute after switching back to READY.";

type ChecklistItemKey = "runtimeConfig" | "apiKeyEnv" | "heartbeat" | "smokeTest";

export type ReadinessChecklistItem = {
  key: ChecklistItemKey;
  label: string;
  ok: boolean;
  detail: string;
};

export type AgentReadinessChecklist = {
  items: ReadinessChecklistItem[];
  blockingReasons: string[];
  checklistReady: boolean;
};

function envOrEmpty(name: string) {
  return String(process.env[name] || "").trim();
}

function defaultConfigForAgent(agent: Pick<Agent, "key" | "runtime">) {
  if (agent.runtime === "LOCAL") {
    return {
      endpointEnv: "OLLAMA_BASE_URL",
      modelEnv: "OLLAMA_MODEL",
      apiKeyEnv: ""
    };
  }
  if (agent.runtime === "CLOUD") {
    return {
      endpointEnv: "OPENAI_BASE_URL",
      modelEnv: "OPENAI_MODEL",
      apiKeyEnv: "OPENAI_API_KEY"
    };
  }
  return {
    endpointEnv: "",
    modelEnv: "",
    apiKeyEnv: ""
  };
}

function runtimeConfigChecklist(
  agent: Pick<Agent, "key" | "runtime" | "model" | "host">,
  cfg: AgentSetting | null
): ReadinessChecklistItem {
  if (agent.runtime === "MANUAL") {
    return {
      key: "runtimeConfig",
      label: "Runtime config",
      ok: false,
      detail: "Runtime is MANUAL; no autonomous executor is wired."
    };
  }

  const defaults = defaultConfigForAgent(agent);
  const endpoint = cfg?.agentUrl || envOrEmpty(defaults.endpointEnv);
  const model = cfg?.agentModel || agent.model || envOrEmpty(defaults.modelEnv);
  const missing: string[] = [];
  if (!endpoint) missing.push("endpoint");
  if (!model) missing.push("model");
  if (missing.length) {
    return {
      key: "runtimeConfig",
      label: "Runtime config",
      ok: false,
      detail: `Missing ${missing.join(" + ")}.`
    };
  }
  return {
    key: "runtimeConfig",
    label: "Runtime config",
    ok: true,
    detail: `${agent.runtime} endpoint/model present.`
  };
}

function apiKeyChecklist(
  agent: Pick<Agent, "key" | "runtime">,
  cfg: AgentSetting | null
): ReadinessChecklistItem {
  if (agent.runtime !== "CLOUD") {
    return {
      key: "apiKeyEnv",
      label: "API key env",
      ok: true,
      detail: "Not required for non-CLOUD runtime."
    };
  }

  const defaults = defaultConfigForAgent(agent);
  const apiKeyEnv = cfg?.agentApiKeyEnv || defaults.apiKeyEnv;
  if (!apiKeyEnv) {
    return {
      key: "apiKeyEnv",
      label: "API key env",
      ok: false,
      detail: "No API key env var configured."
    };
  }
  const hasValue = Boolean(envOrEmpty(apiKeyEnv));
  return {
    key: "apiKeyEnv",
    label: "API key env",
    ok: hasValue,
    detail: hasValue
      ? `${apiKeyEnv} is present in environment.`
      : `${apiKeyEnv} is missing in environment.`
  };
}

function heartbeatChecklist(
  agent: Pick<Agent, "runtime" | "lastHeartbeatAt">,
  isRunning: boolean,
  sharedWorkerCoverage: boolean,
  nowMs: number
): ReadinessChecklistItem {
  if (agent.runtime === "MANUAL") {
    return {
      key: "heartbeat",
      label: "Heartbeat",
      ok: false,
      detail: "No runnable worker is implemented for this agent yet."
    };
  }
  if (!isRunning) {
    return {
      key: "heartbeat",
      label: "Heartbeat",
      ok: false,
      detail: "Worker process is stopped."
    };
  }
  if (sharedWorkerCoverage) {
    return {
      key: "heartbeat",
      label: "Heartbeat",
      ok: true,
      detail: "Covered by active ALPHA orchestrator worker."
    };
  }
  if (!agent.lastHeartbeatAt) {
    return {
      key: "heartbeat",
      label: "Heartbeat",
      ok: false,
      detail: "No heartbeat received yet."
    };
  }
  const ageMs = nowMs - agent.lastHeartbeatAt.getTime();
  if (ageMs > 60_000) {
    return {
      key: "heartbeat",
      label: "Heartbeat",
      ok: false,
      detail: `Heartbeat is stale (${Math.round(ageMs / 1000)}s old).`
    };
  }
  return {
    key: "heartbeat",
    label: "Heartbeat",
    ok: true,
    detail: "Recent heartbeat received."
  };
}

function smokeTestChecklist(
  agent: Pick<Agent, "smokeTestPassedAt">
): ReadinessChecklistItem {
  if (!agent.smokeTestPassedAt) {
    return {
      key: "smokeTest",
      label: "Smoke test",
      ok: false,
      detail: "Smoke test not marked as passed yet."
    };
  }
  return {
    key: "smokeTest",
    label: "Smoke test",
    ok: true,
    detail: `Passed at ${agent.smokeTestPassedAt.toLocaleString()}.`
  };
}

export function buildAgentReadinessChecklist(params: {
  agent: Pick<
    Agent,
    "key" | "runtime" | "model" | "host" | "lastHeartbeatAt" | "smokeTestPassedAt"
  >;
  config: AgentSetting | null;
  isRunning: boolean;
  sharedWorkerCoverage?: boolean;
  nowMs?: number;
}): AgentReadinessChecklist {
  const nowMs = params.nowMs ?? Date.now();
  const items: ReadinessChecklistItem[] = [
    runtimeConfigChecklist(params.agent, params.config),
    apiKeyChecklist(params.agent, params.config),
    heartbeatChecklist(
      params.agent,
      params.isRunning,
      Boolean(params.sharedWorkerCoverage),
      nowMs
    ),
    smokeTestChecklist(params.agent)
  ];
  const blockingReasons = items.filter((i) => !i.ok).map((i) => `${i.label}: ${i.detail}`);
  return {
    items,
    blockingReasons,
    checklistReady: blockingReasons.length === 0
  };
}

export function normalizeReadinessInput(v: string): AgentReadiness {
  if (v === "READY" || v === "PAUSED" || v === "NOT_READY") return v;
  throw new Error("Invalid readiness value.");
}
