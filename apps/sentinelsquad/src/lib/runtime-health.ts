import { prisma } from "@/lib/prisma";
import { resolveRuntimeConfigForTask } from "@/lib/runtime-config";

type RuntimeHealthStatus = "HEALTHY" | "DEGRADED" | "UNAVAILABLE";

export type LocalProviderHealth = {
  provider: "ollama";
  endpoint: string;
  status: RuntimeHealthStatus;
  available: boolean;
  installedModels: string[];
  error: string | null;
  checkedAt: string;
};

export type AgentRuntimeHealth = {
  agentKey: string;
  runtime: "LOCAL" | "CLOUD" | "MANUAL";
  configuredEndpoint: string | null;
  configuredModel: string | null;
  resolvedModel: string | null;
  providerStatus: RuntimeHealthStatus;
  issue: string | null;
};

function normalizeModelName(value: string | null | undefined) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function buildModelAliasCandidates(model: string | null | undefined) {
  const requested = String(model || "").trim();
  const candidates = new Set<string>();
  if (requested) candidates.add(requested);
  const normalized = normalizeModelName(requested);
  if (normalized === "granite40h1b" || normalized === "granite4h1b") {
    candidates.add("granite4:350m");
  }
  return Array.from(candidates);
}

const LOCAL_MODEL_FALLBACK_CANDIDATES = [
  "Granite-4.0-H-1B",
  "granite4:350m",
  "qwen2.5-coder:7b",
  "qwen2.5:7b",
  "qwen2.5:3b",
  "llama3.2:3b",
  "phi3:mini",
  "deepseek-r1:1.5b"
];

async function listInstalledOllamaModels(endpoint: string) {
  const checkedAt = new Date().toISOString();
  try {
    const response = await fetch(`${endpoint.replace(/\/$/, "")}/api/tags`, {
      method: "GET",
      cache: "no-store"
    });
    if (!response.ok) {
      const error = await response.text();
      return {
        provider: "ollama" as const,
        endpoint,
        status: "UNAVAILABLE" as const,
        available: false,
        installedModels: [],
        error: error || `HTTP ${response.status}`,
        checkedAt
      };
    }
    const payload = await response.json();
    const installedModels = Array.isArray(payload?.models)
      ? payload.models
          .map((row: { name?: string; model?: string }) =>
            String(row?.name || row?.model || "").trim()
          )
          .filter(Boolean)
      : [];
    return {
      provider: "ollama" as const,
      endpoint,
      status: installedModels.length ? "HEALTHY" as const : "DEGRADED" as const,
      available: true,
      installedModels,
      error: installedModels.length ? null : "Provider responded but returned no installed models.",
      checkedAt
    };
  } catch (error) {
    return {
      provider: "ollama" as const,
      endpoint,
      status: "UNAVAILABLE" as const,
      available: false,
      installedModels: [],
      error: error instanceof Error ? error.message : String(error),
      checkedAt
    };
  }
}

function selectInstalledModel(requestedModel: string | null | undefined, installedModels: string[]) {
  if (!installedModels.length) {
    return String(requestedModel || "").trim() || null;
  }

  const installedLookup = new Map<string, string>();
  for (const model of installedModels) {
    installedLookup.set(model, model);
    installedLookup.set(normalizeModelName(model), model);
  }

  const preferenceChain = [
    ...buildModelAliasCandidates(requestedModel),
    ...LOCAL_MODEL_FALLBACK_CANDIDATES
  ];
  for (const candidate of preferenceChain) {
    const exact = installedLookup.get(candidate);
    if (exact) return exact;
    const normalized = installedLookup.get(normalizeModelName(candidate));
    if (normalized) return normalized;
  }
  return installedModels[0];
}

export async function getLocalRuntimeHealth() {
  const runnableAgents = await prisma.agent.findMany({
    where: { runtime: { in: ["LOCAL", "CLOUD"] }, enabled: true },
    orderBy: { key: "asc" },
    select: {
      key: true,
      runtime: true
    }
  });

  const runtimeResolutions = await Promise.all(
    runnableAgents.map(async (agent) => {
      try {
        const resolution = await resolveRuntimeConfigForTask({
          agentKey: agent.key,
          projectName: null
        });
        return [agent.key, resolution] as const;
      } catch {
        return [agent.key, null] as const;
      }
    })
  );

  const resolutionMap = new Map(runtimeResolutions);
  const localEndpoints = Array.from(
    new Set(
      runtimeResolutions
        .map(([, resolution]) =>
          resolution?.effective.runtime === "LOCAL" ? resolution.effective.endpoint : null
        )
        .filter((value): value is string => Boolean(value))
    )
  );

  const providerHealthEntries = await Promise.all(
    localEndpoints.map(async (endpoint) => [endpoint, await listInstalledOllamaModels(endpoint)] as const)
  );
  const providerHealthMap = new Map(providerHealthEntries);

  const agents: AgentRuntimeHealth[] = runnableAgents.map((agent) => {
    const resolution = resolutionMap.get(agent.key);
    if (!resolution) {
      return {
        agentKey: agent.key,
        runtime: agent.runtime,
        configuredEndpoint: null,
        configuredModel: null,
        resolvedModel: null,
        providerStatus: "UNAVAILABLE",
        issue: "Runtime config resolution failed."
      };
    }

    if (resolution.effective.runtime !== "LOCAL") {
      return {
        agentKey: agent.key,
        runtime: resolution.effective.runtime,
        configuredEndpoint: resolution.effective.endpoint,
        configuredModel: resolution.effective.model,
        resolvedModel: resolution.effective.model,
        providerStatus: "HEALTHY",
        issue: null
      };
    }

    const providerHealth = providerHealthMap.get(resolution.effective.endpoint);
    const resolvedModel = providerHealth
      ? selectInstalledModel(resolution.effective.model, providerHealth.installedModels)
      : resolution.effective.model;

    let issue: string | null = null;
    if (!providerHealth) {
      issue = "Provider health is unavailable.";
    } else if (!providerHealth.available) {
      issue = providerHealth.error || "Provider is unavailable.";
    } else if (!providerHealth.installedModels.length) {
      issue = "Provider is reachable but has no installed models.";
    } else if (resolvedModel !== resolution.effective.model) {
      issue = `Requested model "${resolution.effective.model}" resolved to installed model "${resolvedModel}".`;
    }

    return {
      agentKey: agent.key,
      runtime: resolution.effective.runtime,
      configuredEndpoint: resolution.effective.endpoint,
      configuredModel: resolution.effective.model,
      resolvedModel,
      providerStatus: providerHealth?.status || "UNAVAILABLE",
      issue
    };
  });

  return {
    providers: providerHealthEntries.map(([, value]) => value),
    agents
  };
}
