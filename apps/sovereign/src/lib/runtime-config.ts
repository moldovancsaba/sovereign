import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { readSentinelSquadSettings } from "@/lib/settings-store";
import { isMutableRuntimeSettingKey } from "@/lib/runtime-settings-mutability";

type RuntimeMode = "LOCAL" | "CLOUD";

type RuntimeConfigSource = {
  source: "ENV_DEFAULTS" | "AGENT_SETTINGS" | "PROJECT_SETTINGS_VARS" | "ALPHA_CONTEXT_OVERLAY";
  ref: string;
  appliedKeys: string[];
  ignoredKeys: string[];
};

export type RuntimeConfigEffective = {
  runtime: RuntimeMode;
  endpoint: string;
  model: string;
  apiKeyEnv: string | null;
  requestTimeoutMs: number;
};

export type RuntimeConfigResolution = {
  projectKey: string | null;
  projectName: string | null;
  activeContextWindowId: string | null;
  activeContextOwnerAgentKey: string | null;
  digest: string;
  sourceChain: RuntimeConfigSource[];
  effective: RuntimeConfigEffective;
  resolvedAt: string;
};

const SAFE_RUNTIME_KEYS = new Set([
  "SOVEREIGN_RUNTIME_ENDPOINT",
  "SOVEREIGN_RUNTIME_MODEL",
  "SOVEREIGN_RUNTIME_API_KEY_ENV",
  "SOVEREIGN_RUNTIME_TIMEOUT_MS",
  "SOVEREIGN_RUNTIME_LOCAL_ENDPOINT",
  "SOVEREIGN_RUNTIME_LOCAL_MODEL",
  "SOVEREIGN_RUNTIME_CLOUD_ENDPOINT",
  "SOVEREIGN_RUNTIME_CLOUD_MODEL",
  "SOVEREIGN_RUNTIME_CLOUD_API_KEY_ENV",
  "SENTINELSQUAD_RUNTIME_ENDPOINT",
  "SENTINELSQUAD_RUNTIME_MODEL",
  "SENTINELSQUAD_RUNTIME_API_KEY_ENV",
  "SENTINELSQUAD_RUNTIME_TIMEOUT_MS",
  "SENTINELSQUAD_RUNTIME_LOCAL_ENDPOINT",
  "SENTINELSQUAD_RUNTIME_LOCAL_MODEL",
  "SENTINELSQUAD_RUNTIME_CLOUD_ENDPOINT",
  "SENTINELSQUAD_RUNTIME_CLOUD_MODEL",
  "SENTINELSQUAD_RUNTIME_CLOUD_API_KEY_ENV"
]);

function normalizeText(input: string | null | undefined) {
  return String(input || "").trim();
}

function normalizeLower(input: string | null | undefined) {
  return normalizeText(input).toLowerCase();
}

function clampTimeout(value: unknown, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.trunc(parsed), 1_000), 300_000);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function normalizeForHash(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return value.map((entry) => normalizeForHash(entry));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = normalizeForHash((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

function digest(value: unknown) {
  return createHash("sha256").update(JSON.stringify(normalizeForHash(value))).digest("hex");
}

function applyRuntimeOverrides(params: {
  runtime: RuntimeMode;
  effective: RuntimeConfigEffective;
  sourceValues: Record<string, string>;
  allowKey?: (key: string) => boolean;
}) {
  const appliedKeys: string[] = [];
  const ignoredKeys: string[] = [];
  const getValue = (key: string) => normalizeText(params.sourceValues[key]);
  const canApply = (key: string) => (params.allowKey ? params.allowKey(key) : true);
  const applyStringValue = (
    candidateKeys: string[],
    assign: (value: string) => void
  ) => {
    for (const key of candidateKeys) {
      const value = getValue(key);
      if (!value) continue;
      if (!canApply(key)) {
        ignoredKeys.push(key);
        return;
      }
      assign(value);
      appliedKeys.push(key);
      return;
    }
  };

  const runtimeEndpointKey =
    params.runtime === "LOCAL" ? "SENTINELSQUAD_RUNTIME_LOCAL_ENDPOINT" : "SENTINELSQUAD_RUNTIME_CLOUD_ENDPOINT";
  const runtimeModelKey =
    params.runtime === "LOCAL" ? "SENTINELSQUAD_RUNTIME_LOCAL_MODEL" : "SENTINELSQUAD_RUNTIME_CLOUD_MODEL";
  const runtimeApiEnvKey =
    params.runtime === "CLOUD" ? "SENTINELSQUAD_RUNTIME_CLOUD_API_KEY_ENV" : "";

  applyStringValue([runtimeEndpointKey, "SENTINELSQUAD_RUNTIME_ENDPOINT"], (value) => {
    params.effective.endpoint = value;
  });

  applyStringValue([runtimeModelKey, "SENTINELSQUAD_RUNTIME_MODEL"], (value) => {
    params.effective.model = value;
  });

  if (params.runtime === "CLOUD") {
    applyStringValue([runtimeApiEnvKey, "SENTINELSQUAD_RUNTIME_API_KEY_ENV"], (value) => {
      params.effective.apiKeyEnv = value;
    });
  }

  const timeoutRaw = getValue("SENTINELSQUAD_RUNTIME_TIMEOUT_MS");
  if (timeoutRaw) {
    if (canApply("SENTINELSQUAD_RUNTIME_TIMEOUT_MS")) {
      params.effective.requestTimeoutMs = clampTimeout(timeoutRaw, params.effective.requestTimeoutMs);
      appliedKeys.push("SENTINELSQUAD_RUNTIME_TIMEOUT_MS");
    } else {
      ignoredKeys.push("SENTINELSQUAD_RUNTIME_TIMEOUT_MS");
    }
  }

  for (const key of Object.keys(params.sourceValues).sort()) {
    if (!SAFE_RUNTIME_KEYS.has(key)) {
      ignoredKeys.push(key);
    }
  }

  return { appliedKeys, ignoredKeys };
}

function readContextRuntimeOverrides(payloadSnapshot: unknown): Record<string, string> {
  const payload = asRecord(payloadSnapshot);
  if (!payload) return {};
  const direct = asRecord(payload.runtimeConfigOverrides);
  const nested = asRecord(payload.runtimeConfig);
  const source = direct || nested;
  if (!source) return {};

  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    if (!SAFE_RUNTIME_KEYS.has(key)) continue;
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed) out[key] = trimmed;
    } else if (typeof value === "number" && Number.isFinite(value)) {
      out[key] = String(Math.trunc(value));
    }
  }
  return out;
}

export async function resolveRuntimeConfigForTask(params: {
  projectName?: string | null;
  agentKey: string;
}): Promise<RuntimeConfigResolution> {
  const normalizedProjectName = normalizeText(params.projectName);
  const projectKey = normalizedProjectName ? normalizeLower(normalizedProjectName) : null;

  const agent = await prisma.agent.findFirst({
    where: { key: { equals: params.agentKey, mode: "insensitive" } },
    select: { key: true, runtime: true }
  });
  if (!agent || (agent.runtime !== "LOCAL" && agent.runtime !== "CLOUD")) {
    throw new Error(`Runtime config resolution failed: agent @${params.agentKey} is not runnable.`);
  }

  const settings = await readSentinelSquadSettings();
  const runtime = agent.runtime;
  const sourceChain: RuntimeConfigSource[] = [];

  const effective: RuntimeConfigEffective = {
    runtime,
    endpoint:
      runtime === "LOCAL"
        ? normalizeText(process.env.OLLAMA_BASE_URL) || "http://127.0.0.1:11434"
        : normalizeText(process.env.OPENAI_BASE_URL) || "https://api.openai.com/v1",
    model:
      runtime === "LOCAL"
        ? normalizeText(process.env.OLLAMA_MODEL) || "deepseek-r1:1.5b"
        : normalizeText(process.env.OPENAI_MODEL) || "gpt-4o-mini",
    apiKeyEnv: runtime === "CLOUD" ? "OPENAI_API_KEY" : null,
    requestTimeoutMs: clampTimeout(
      process.env.SOVEREIGN_WORKER_REQUEST_TIMEOUT_MS || process.env.SENTINELSQUAD_WORKER_REQUEST_TIMEOUT_MS,
      60_000
    )
  };

  sourceChain.push({
    source: "ENV_DEFAULTS",
    ref: "process.env",
    appliedKeys:
      runtime === "LOCAL"
        ? ["OLLAMA_BASE_URL", "OLLAMA_MODEL", "SOVEREIGN_WORKER_REQUEST_TIMEOUT_MS"]
        : [
            "OPENAI_BASE_URL",
            "OPENAI_MODEL",
            "OPENAI_API_KEY",
            "SOVEREIGN_WORKER_REQUEST_TIMEOUT_MS"
          ],
    ignoredKeys: []
  });

  const agentSetting = settings.agents.find(
    (row) =>
      normalizeLower(row.agentId) === normalizeLower(agent.key) ||
      normalizeLower(row.agentName) === normalizeLower(agent.key)
  );
  if (agentSetting) {
    const appliedKeys: string[] = [];
    if (normalizeText(agentSetting.agentUrl)) {
      effective.endpoint = normalizeText(agentSetting.agentUrl);
      appliedKeys.push("settings.agents.agentUrl");
    }
    if (normalizeText(agentSetting.agentModel)) {
      effective.model = normalizeText(agentSetting.agentModel);
      appliedKeys.push("settings.agents.agentModel");
    }
    if (runtime === "CLOUD" && normalizeText(agentSetting.agentApiKeyEnv)) {
      effective.apiKeyEnv = normalizeText(agentSetting.agentApiKeyEnv);
      appliedKeys.push("settings.agents.agentApiKeyEnv");
    }
    sourceChain.push({
      source: "AGENT_SETTINGS",
      ref: `settings.agents:${agentSetting.agentId || agentSetting.agentName}`,
      appliedKeys,
      ignoredKeys: []
    });
  }

  const projectSetting = normalizedProjectName
    ? settings.projects.find(
        (row) =>
          normalizeLower(row.projectName) === normalizeLower(normalizedProjectName) ||
          normalizeLower(row.projectId) === normalizeLower(normalizedProjectName)
      )
    : null;

  if (projectSetting) {
    const vars: Record<string, string> = {};
    for (const row of projectSetting.vars) {
      const key = normalizeText(row.key);
      const value = normalizeText(row.value);
      if (!key || !value) continue;
      vars[key] = value;
    }
    const projectOverrides = applyRuntimeOverrides({ runtime, effective, sourceValues: vars });
    sourceChain.push({
      source: "PROJECT_SETTINGS_VARS",
      ref: `settings.projects:${projectSetting.projectId}`,
      appliedKeys: projectOverrides.appliedKeys,
      ignoredKeys: projectOverrides.ignoredKeys
    });
  }

  let activeContextWindowId: string | null = null;
  let activeContextOwnerAgentKey: string | null = null;
  if (projectKey) {
    const lock = await prisma.projectAlphaLock.findUnique({
      where: { projectKey },
      include: {
        activeWindow: {
          select: {
            id: true,
            ownerAgentKey: true
          }
        }
      }
    });

    activeContextWindowId = lock?.activeWindow?.id ?? null;
    activeContextOwnerAgentKey = lock?.activeWindow?.ownerAgentKey ?? null;

    if (activeContextWindowId) {
      const latestContextSnapshot = await prisma.alphaContextPackageInvariant.findFirst({
        where: { windowId: activeContextWindowId },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: {
          id: true,
          payloadSnapshot: true
        }
      });

      const contextValues = readContextRuntimeOverrides(
        latestContextSnapshot?.payloadSnapshot ?? null
      );
      const contextOverrides = applyRuntimeOverrides({
        runtime,
        effective,
        sourceValues: contextValues,
        allowKey: (key) => isMutableRuntimeSettingKey(key)
      });
      sourceChain.push({
        source: "ALPHA_CONTEXT_OVERLAY",
        ref: latestContextSnapshot
          ? `alpha-context-snapshot:${latestContextSnapshot.id}`
          : `alpha-context:${activeContextWindowId}`,
        appliedKeys: contextOverrides.appliedKeys,
        ignoredKeys: contextOverrides.ignoredKeys
      });
    }
  }

  const digestValue = digest({
    projectKey,
    projectName: normalizedProjectName || null,
    activeContextWindowId,
    activeContextOwnerAgentKey,
    effective,
    sourceChain
  });

  return {
    projectKey,
    projectName: normalizedProjectName || null,
    activeContextWindowId,
    activeContextOwnerAgentKey,
    digest: digestValue,
    sourceChain,
    effective,
    resolvedAt: new Date().toISOString()
  };
}
