import type { AgentSetting, ProjectVar } from "@/lib/settings-store";

export type RuntimeSettingMutabilityClass = "IMMUTABLE" | "MUTABLE";

const IMMUTABLE_RUNTIME_SETTING_KEYS = new Set([
  "SOVEREIGN_RUNTIME_ENDPOINT",
  "SOVEREIGN_RUNTIME_LOCAL_ENDPOINT",
  "SOVEREIGN_RUNTIME_CLOUD_ENDPOINT",
  "SOVEREIGN_RUNTIME_API_KEY_ENV",
  "SOVEREIGN_RUNTIME_CLOUD_API_KEY_ENV",
  "SENTINELSQUAD_RUNTIME_ENDPOINT",
  "SENTINELSQUAD_RUNTIME_LOCAL_ENDPOINT",
  "SENTINELSQUAD_RUNTIME_CLOUD_ENDPOINT",
  "SENTINELSQUAD_RUNTIME_API_KEY_ENV",
  "SENTINELSQUAD_RUNTIME_CLOUD_API_KEY_ENV"
]);

const MUTABLE_RUNTIME_SETTING_KEYS = new Set([
  "SOVEREIGN_RUNTIME_MODEL",
  "SOVEREIGN_RUNTIME_LOCAL_MODEL",
  "SOVEREIGN_RUNTIME_CLOUD_MODEL",
  "SOVEREIGN_RUNTIME_TIMEOUT_MS",
  "SENTINELSQUAD_RUNTIME_MODEL",
  "SENTINELSQUAD_RUNTIME_LOCAL_MODEL",
  "SENTINELSQUAD_RUNTIME_CLOUD_MODEL",
  "SENTINELSQUAD_RUNTIME_TIMEOUT_MS"
]);

export function classifyRuntimeSettingKey(
  key: string
): RuntimeSettingMutabilityClass | null {
  const normalized = String(key || "").trim();
  if (!normalized) return null;
  if (IMMUTABLE_RUNTIME_SETTING_KEYS.has(normalized)) return "IMMUTABLE";
  if (MUTABLE_RUNTIME_SETTING_KEYS.has(normalized)) return "MUTABLE";
  return null;
}

export function isMutableRuntimeSettingKey(key: string) {
  return classifyRuntimeSettingKey(key) === "MUTABLE";
}

export function isImmutableRuntimeSettingKey(key: string) {
  return classifyRuntimeSettingKey(key) === "IMMUTABLE";
}

export type RuntimeMutabilityDiff = {
  immutableChangedKeys: string[];
  mutableChangedKeys: string[];
};

function toProjectVarMap(vars: ProjectVar[]) {
  const out = new Map<string, string>();
  for (const row of vars) {
    const key = String(row.key || "").trim();
    if (!key) continue;
    out.set(key, String(row.value || "").trim());
  }
  return out;
}

export function diffProjectRuntimeVarMutations(
  previousVars: ProjectVar[],
  nextVars: ProjectVar[]
): RuntimeMutabilityDiff {
  const previous = toProjectVarMap(previousVars);
  const next = toProjectVarMap(nextVars);
  const keys = Array.from(new Set([...previous.keys(), ...next.keys()]));

  const immutableChangedKeys: string[] = [];
  const mutableChangedKeys: string[] = [];

  for (const key of keys) {
    const policy = classifyRuntimeSettingKey(key);
    if (!policy) continue;
    const before = previous.get(key) || "";
    const after = next.get(key) || "";
    if (before === after) continue;
    if (policy === "IMMUTABLE") {
      // Allow first assignment, but deny subsequent edits/removals.
      if (before) immutableChangedKeys.push(key);
    }
    if (policy === "MUTABLE") mutableChangedKeys.push(key);
  }

  immutableChangedKeys.sort();
  mutableChangedKeys.sort();
  return { immutableChangedKeys, mutableChangedKeys };
}

export function diffAgentRuntimeSettingMutations(
  previous: AgentSetting | null,
  next: AgentSetting
): RuntimeMutabilityDiff {
  if (!previous) {
    return {
      immutableChangedKeys: [],
      mutableChangedKeys: []
    };
  }

  const immutableChangedKeys: string[] = [];
  const mutableChangedKeys: string[] = [];

  const beforeUrl = String(previous.agentUrl || "").trim();
  const afterUrl = String(next.agentUrl || "").trim();
  if (beforeUrl !== afterUrl && beforeUrl) {
    immutableChangedKeys.push("agentUrl");
  }
  const beforeApiEnv = String(previous.agentApiKeyEnv || "").trim();
  const afterApiEnv = String(next.agentApiKeyEnv || "").trim();
  if (beforeApiEnv !== afterApiEnv && beforeApiEnv) {
    immutableChangedKeys.push("agentApiKeyEnv");
  }
  if (String(previous.agentModel || "").trim() !== String(next.agentModel || "").trim()) {
    mutableChangedKeys.push("agentModel");
  }

  return {
    immutableChangedKeys,
    mutableChangedKeys
  };
}
