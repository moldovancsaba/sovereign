import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { sovereignEnvDefault } from "@/lib/env-sovereign";
import { AGENT_MODEL_PRESETS } from "@/lib/model-presets";
import { persistTrinityExecutionRun } from "@/lib/trinity-execution-runs";
import { prisma } from "@/lib/prisma";
import { resolveRuntimeConfigForTask } from "@/lib/runtime-config";
import { applyRoleRankingOutcome, getRoleRankingMap } from "@/lib/agent-role-ranking";

export type SovereignApiMode = "direct" | "trinity" | "team" | "auto";
export type SovereignApiProvider = "local" | "cloud" | "mlx" | "auto" | "mock";

export type SovereignApiChatMessage = {
  role: "system" | "user" | "assistant";
  content: string | Array<{ type?: string; text?: string }>;
};

export type SovereignChatCompletionsRequest = {
  model?: string;
  messages: SovereignApiChatMessage[];
  temperature?: number;
  max_tokens?: number;
  mode?: SovereignApiMode;
  provider?: SovereignApiProvider;
  team?: {
    strategy?: "manual" | "auto";
    group_key?: string;
    manual_staffing?: {
      drafter?: string;
      writer?: string;
      judge?: string;
    };
  };
};

export type SovereignExecutionSuccess = {
  id: string;
  mode: SovereignApiMode;
  provider: "ollama" | "openai-compatible" | "mlx" | "mock";
  model: string;
  outputText: string;
  finishReason: string;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  metadata?: Record<string, unknown>;
};

export class SovereignApiError extends Error {
  statusCode: number;
  type: "invalid_request_error" | "authentication_error" | "api_error" | "server_error";
  code: string;
  param: string | null;

  constructor(params: {
    message: string;
    statusCode: number;
    type: "invalid_request_error" | "authentication_error" | "api_error" | "server_error";
    code: string;
    param?: string | null;
  }) {
    super(params.message);
    this.name = "SovereignApiError";
    this.statusCode = params.statusCode;
    this.type = params.type;
    this.code = params.code;
    this.param = params.param ?? null;
  }
}

type ResolvedProviderConfig = {
  provider: "ollama" | "openai-compatible" | "mlx" | "mock";
  endpoint: string;
  model: string;
  apiKey: string | null;
  capabilityProfile: "ollama-chat-v1" | "openai-chat-v1" | "mlx-openai-chat-v1" | "mock-deterministic-v1";
};

type ProviderRunResult = {
  provider: "ollama" | "openai-compatible" | "mlx" | "mock";
  model: string;
  outputText: string;
  finishReason: string;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
};

type TrinityStageResult = {
  stage: "drafter" | "writer" | "judge";
  attempt: number;
  status: "accepted" | "revised" | "rejected" | "needs_clarification";
  confidence: number;
  reasonClass: string;
  askBack: boolean;
  content: string;
  schemaValid: boolean;
};

type TrinityRole = "drafter" | "writer" | "judge";

type StaffingCalibration = {
  profile: string;
  qualityWeight: number;
  roleFitWeight: number;
  latencyWeight: number;
  costWeight: number;
  reliabilityWeight: number;
  rankingBoostWeight: number;
};

type TeamPolicyContext = {
  mode: "group_policy_v1";
  applied: boolean;
  sourceGroupKey: string | null;
  sourceGroupId: string | null;
  directMemberCount: number;
  nestedGroupsVisited: number;
  roleDefaults: Partial<Record<TrinityRole, string>>;
  unresolvedRoles: TrinityRole[];
  precedence: Array<"manual_staffing" | "group_role_defaults" | "auto_staffing" | "fallback_provider">;
};

type StaffingDecision = {
  strategy: "manual" | "auto";
  assignments: Partial<Record<TrinityRole, string>>;
  resolvedProviders: Partial<Record<TrinityRole, ResolvedProviderConfig>>;
  calibration: StaffingCalibration;
  teamPolicy?: TeamPolicyContext;
  scoring?: Record<
    TrinityRole,
    {
      selectedAgentKey: string | null;
      evaluated: Array<{
        agentKey: string;
        total: number;
        quality: number;
        roleFit: number;
        latency: number;
        cost: number;
        reliability: number;
        rankingBoost: number;
      }>;
    }
  >;
  group?: {
    key: string;
    id: string;
    memberCount: number;
  } | null;
};

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function parseFiniteNumber(raw: string | undefined) {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

function normalizeWeightValue(raw: string | undefined, fallback: number) {
  const parsed = parseFiniteNumber(raw);
  if (parsed == null) return fallback;
  // Invalid or negative values are treated as disabled signals.
  return Math.max(0, parsed);
}

function resolveStaffingCalibration(): StaffingCalibration {
  const defaults = {
    qualityWeight: 0.35,
    roleFitWeight: 0.22,
    latencyWeight: 0.18,
    costWeight: 0.1,
    reliabilityWeight: 0.05,
    rankingBoostWeight: 0.1
  };
  const requested = {
    qualityWeight: normalizeWeightValue(process.env.SOVEREIGN_STAFFING_WEIGHT_QUALITY, defaults.qualityWeight),
    roleFitWeight: normalizeWeightValue(process.env.SOVEREIGN_STAFFING_WEIGHT_ROLE_FIT, defaults.roleFitWeight),
    latencyWeight: normalizeWeightValue(process.env.SOVEREIGN_STAFFING_WEIGHT_LATENCY, defaults.latencyWeight),
    costWeight: normalizeWeightValue(process.env.SOVEREIGN_STAFFING_WEIGHT_COST, defaults.costWeight),
    reliabilityWeight: normalizeWeightValue(
      process.env.SOVEREIGN_STAFFING_WEIGHT_RELIABILITY,
      defaults.reliabilityWeight
    ),
    rankingBoostWeight: normalizeWeightValue(
      process.env.SOVEREIGN_STAFFING_WEIGHT_RANKING_BOOST,
      defaults.rankingBoostWeight
    )
  };
  const sum =
    requested.qualityWeight +
    requested.roleFitWeight +
    requested.latencyWeight +
    requested.costWeight +
    requested.reliabilityWeight +
    requested.rankingBoostWeight;

  if (!(sum > 0)) {
    return { profile: "default_safe", ...defaults };
  }
  return {
    profile: "env_calibrated",
    qualityWeight: requested.qualityWeight / sum,
    roleFitWeight: requested.roleFitWeight / sum,
    latencyWeight: requested.latencyWeight / sum,
    costWeight: requested.costWeight / sum,
    reliabilityWeight: requested.reliabilityWeight / sum,
    rankingBoostWeight: requested.rankingBoostWeight / sum
  };
}

function readMessageContent(content: SovereignApiChatMessage["content"]) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => (part && typeof part.text === "string" ? part.text : ""))
    .join("")
    .trim();
}

function normalizeMessages(messages: SovereignApiChatMessage[]) {
  return messages.map((message) => ({
    role: message.role,
    content: readMessageContent(message.content)
  }));
}

function tryParseJsonObject(input: string): Record<string, unknown> | null {
  const raw = normalizeText(input);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        const partial = JSON.parse(raw.slice(start, end + 1));
        if (partial && typeof partial === "object" && !Array.isArray(partial)) {
          return partial as Record<string, unknown>;
        }
      } catch {
        return null;
      }
    }
    return null;
  }
}

function parseStageResponse(
  stage: TrinityStageResult["stage"],
  attempt: number,
  rawText: string
): TrinityStageResult {
  const parsed = tryParseJsonObject(rawText);
  const fallback: TrinityStageResult = {
    stage,
    attempt,
    status: "needs_clarification",
    confidence: 0,
    reasonClass: "structure",
    askBack: true,
    content: "Stage response schema invalid. Upstream clarification or retry is required.",
    schemaValid: false
  };
  if (!parsed) return fallback;
  const hasConfidence = parsed.confidence !== undefined && Number.isFinite(Number(parsed.confidence));
  const hasContent = normalizeText(parsed.content || parsed.output).length > 0;
  const statusRaw = normalizeText(parsed.status).toLowerCase();
  const statusCandidate: TrinityStageResult["status"] =
    statusRaw === "accepted" ||
    statusRaw === "revised" ||
    statusRaw === "rejected" ||
    statusRaw === "needs_clarification"
      ? statusRaw
      : fallback.status;
  const hasReasonClass = normalizeText(parsed.reasonClass || parsed.reason_class).length > 0;
  const schemaValid = hasConfidence && hasContent && hasReasonClass;
  if (!schemaValid) return fallback;
  const confidence = clamp01(Number(parsed.confidence));
  return {
    stage,
    attempt,
    status: statusCandidate,
    confidence: Number.isFinite(confidence) ? confidence : fallback.confidence,
    reasonClass: normalizeText(parsed.reasonClass || parsed.reason_class || "unknown") || "unknown",
    askBack: Boolean(parsed.askBack ?? parsed.ask_back ?? false),
    content: normalizeText(parsed.content || parsed.output || rawText),
    schemaValid: true
  };
}

function resolveProviderConfig(input: SovereignChatCompletionsRequest): ResolvedProviderConfig {
  const preferred = normalizeText(input.provider || "auto").toLowerCase();
  const mode =
    preferred === "local" || preferred === "cloud" || preferred === "mlx" || preferred === "mock"
      ? preferred
      : "auto";
  if (mode === "mock") {
    return {
      provider: "mock",
      endpoint: "mock://sovereign",
      model: normalizeText(input.model) || "sovereign-mock-v1",
      apiKey: null,
      capabilityProfile: "mock-deterministic-v1"
    };
  }
  const localModel = normalizeText(input.model) || sovereignEnvDefault("OLLAMA_MODEL", "deepseek-r1:1.5b");
  const cloudModel = normalizeText(input.model) || sovereignEnvDefault("OPENAI_MODEL", "gpt-4o-mini");
  const mlxModel = normalizeText(input.model) || sovereignEnvDefault("SOVEREIGN_MLX_MODEL", "mlx-community/Qwen2.5-7B-Instruct-4bit");
  if (mode === "local") {
    return {
      provider: "ollama",
      endpoint: sovereignEnvDefault("OLLAMA_BASE_URL", "http://127.0.0.1:11434").replace(/\/$/, ""),
      model: localModel,
      apiKey: null,
      capabilityProfile: "ollama-chat-v1"
    };
  }
  if (mode === "cloud") {
    return {
      provider: "openai-compatible",
      endpoint: sovereignEnvDefault("OPENAI_BASE_URL", "https://api.openai.com/v1").replace(/\/$/, ""),
      model: cloudModel,
      apiKey: normalizeText(process.env.OPENAI_API_KEY) || null,
      capabilityProfile: "openai-chat-v1"
    };
  }
  if (mode === "mlx") {
    return {
      provider: "mlx",
      endpoint: sovereignEnvDefault("SOVEREIGN_MLX_BASE_URL", "http://127.0.0.1:8080/v1").replace(/\/$/, ""),
      model: mlxModel,
      apiKey: normalizeText(process.env.SOVEREIGN_MLX_API_KEY) || null,
      capabilityProfile: "mlx-openai-chat-v1"
    };
  }

  // Auto: prefer local-first.
  return {
    provider: "ollama",
    endpoint: sovereignEnvDefault("OLLAMA_BASE_URL", "http://127.0.0.1:11434").replace(/\/$/, ""),
    model: localModel,
    apiKey: null,
    capabilityProfile: "ollama-chat-v1"
  };
}

async function runProviderCompletion(
  resolved: ResolvedProviderConfig,
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  input: SovereignChatCompletionsRequest
): Promise<ProviderRunResult> {
  if (!messages.length) {
    throw new Error("messages is required and cannot be empty.");
  }

  if (resolved.provider === "mock") {
    const finalPrompt = normalizeText(messages[messages.length - 1]?.content || "");
    const isTrinityStage =
      /You are the Drafter in a Trinity pipeline/i.test(finalPrompt) ||
      /You are the Writer in a Trinity pipeline/i.test(finalPrompt) ||
      /You are the Judge in a Trinity pipeline/i.test(finalPrompt);
    if (isTrinityStage) {
      if (/Drafter/i.test(finalPrompt)) {
        return {
          provider: "mock",
          model: resolved.model,
          outputText: JSON.stringify({
            status: "accepted",
            confidence: 0.96,
            reasonClass: "clarity",
            askBack: false,
            content: "Structured draft ready for writer."
          }),
          finishReason: "stop"
        };
      }
      if (/Writer/i.test(finalPrompt)) {
        return {
          provider: "mock",
          model: resolved.model,
          outputText: JSON.stringify({
            status: "accepted",
            confidence: 0.95,
            reasonClass: "implementation",
            askBack: false,
            content: "Mock writer output: task completed."
          }),
          finishReason: "stop"
        };
      }
      return {
        provider: "mock",
        model: resolved.model,
        outputText: JSON.stringify({
          status: "accepted",
          confidence: 0.97,
          reasonClass: "quality",
          askBack: false,
          content: "Judge validated output."
        }),
        finishReason: "stop"
      };
    }
    const userPrompt = normalizeText(messages.filter((m) => m.role === "user").at(-1)?.content || "");
    return {
      provider: "mock",
      model: resolved.model,
      outputText: `Mock response: ${userPrompt || "ok"}`,
      finishReason: "stop"
    };
  }

  const timeoutMs = Math.min(
    Math.max(Number(sovereignEnvDefault("SOVEREIGN_API_PROVIDER_TIMEOUT_MS", "60000")), 1000),
    300000
  );
  const fetchWithTimeout = async (url: string, init: RequestInit) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new SovereignApiError({
          message: `Provider request timed out after ${timeoutMs}ms.`,
          statusCode: 504,
          type: "api_error",
          code: "provider_timeout"
        });
      }
      throw new SovereignApiError({
        message: error instanceof Error ? error.message : String(error),
        statusCode: 502,
        type: "api_error",
        code: "provider_unavailable"
      });
    } finally {
      clearTimeout(timeout);
    }
  };

  if (resolved.provider === "ollama") {
    const res = await fetchWithTimeout(`${resolved.endpoint}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: resolved.model,
        stream: false,
        messages,
        options: {
          temperature: typeof input.temperature === "number" ? input.temperature : 0.2,
          num_predict: typeof input.max_tokens === "number" ? input.max_tokens : undefined
        }
      })
    });
    if (!res.ok) {
      const text = await res.text();
      throw new SovereignApiError({
        message: `Ollama request failed (${res.status}): ${text || "unknown error"}`,
        statusCode: 502,
        type: "api_error",
        code: "provider_http_error"
      });
    }
    const payload = await res.json();
    const outputText = normalizeText(payload?.message?.content || payload?.response || "");
    if (!outputText) {
      throw new SovereignApiError({
        message: "Ollama returned an empty completion.",
        statusCode: 502,
        type: "api_error",
        code: "empty_provider_response"
      });
    }
    return {
      provider: resolved.provider,
      model: resolved.model,
      outputText,
      finishReason: String(payload?.done_reason || "stop"),
      usage: undefined
    };
  }

  if (resolved.provider === "mlx") {
    const headers: Record<string, string> = {
      "Content-Type": "application/json"
    };
    if (resolved.apiKey) headers.Authorization = `Bearer ${resolved.apiKey}`;
    const res = await fetchWithTimeout(`${resolved.endpoint}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: resolved.model,
        messages,
        temperature: typeof input.temperature === "number" ? input.temperature : 0.2,
        max_tokens: typeof input.max_tokens === "number" ? input.max_tokens : undefined
      })
    });
    if (!res.ok) {
      const text = await res.text();
      throw new SovereignApiError({
        message: `MLX request failed (${res.status}): ${text || "unknown error"}`,
        statusCode: 502,
        type: "api_error",
        code: "provider_http_error"
      });
    }
    const payload = await res.json();
    const outputText = normalizeText(payload?.choices?.[0]?.message?.content);
    if (!outputText) {
      throw new SovereignApiError({
        message: "MLX provider returned an empty completion.",
        statusCode: 502,
        type: "api_error",
        code: "empty_provider_response"
      });
    }
    return {
      provider: resolved.provider,
      model: String(payload?.model || resolved.model),
      outputText,
      finishReason: String(payload?.choices?.[0]?.finish_reason || "stop"),
      usage:
        payload?.usage && typeof payload.usage === "object"
          ? {
              prompt_tokens: payload.usage.prompt_tokens,
              completion_tokens: payload.usage.completion_tokens,
              total_tokens: payload.usage.total_tokens
            }
          : undefined
    };
  }

  if (!resolved.apiKey) {
    throw new SovereignApiError({
      message: "OPENAI_API_KEY is required for cloud provider mode.",
      statusCode: 400,
      type: "invalid_request_error",
      code: "missing_api_key",
      param: "provider"
    });
  }
  const res = await fetchWithTimeout(`${resolved.endpoint}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resolved.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: resolved.model,
      messages,
      temperature: typeof input.temperature === "number" ? input.temperature : 0.2,
      max_tokens: typeof input.max_tokens === "number" ? input.max_tokens : undefined
    })
  });
  if (!res.ok) {
    const text = await res.text();
    throw new SovereignApiError({
      message: `OpenAI-compatible request failed (${res.status}): ${text || "unknown error"}`,
      statusCode: 502,
      type: "api_error",
      code: "provider_http_error"
    });
  }
  const payload = await res.json();
  const outputText = normalizeText(payload?.choices?.[0]?.message?.content);
  if (!outputText) {
    throw new SovereignApiError({
      message: "OpenAI-compatible provider returned an empty completion.",
      statusCode: 502,
      type: "api_error",
      code: "empty_provider_response"
    });
  }
  return {
    provider: resolved.provider,
    model: String(payload?.model || resolved.model),
    outputText,
    finishReason: String(payload?.choices?.[0]?.finish_reason || "stop"),
    usage:
      payload?.usage && typeof payload.usage === "object"
        ? {
            prompt_tokens: payload.usage.prompt_tokens,
            completion_tokens: payload.usage.completion_tokens,
            total_tokens: payload.usage.total_tokens
          }
        : undefined
  };
}

async function executeDirect(input: SovereignChatCompletionsRequest): Promise<SovereignExecutionSuccess> {
  const resolved = resolveProviderConfig(input);
  const result = await runProviderCompletion(resolved, normalizeMessages(input.messages), input);
  return {
    id: `chatcmpl_${randomUUID()}`,
    mode: "direct",
    provider: result.provider,
    model: result.model,
    outputText: result.outputText,
    finishReason: result.finishReason,
    usage: result.usage,
    metadata: {
      providerCapabilities: resolved.capabilityProfile
    }
  };
}

function parseModelSizeB(model: string | null | undefined) {
  const raw = normalizeText(model).toLowerCase();
  const match = /(\d+(?:\.\d+)?)\s*b\b/.exec(raw);
  if (!match) return 7;
  const parsed = Number(match[1]);
  if (!Number.isFinite(parsed) || parsed <= 0) return 7;
  return parsed;
}

function scoreRoleFit(role: TrinityRole, model: string | null | undefined, controlRole: string) {
  const lower = normalizeText(model).toLowerCase();
  if (role === "writer") {
    if (/coder|code|deepseek|qwen/.test(lower)) return 1;
    return 0.75;
  }
  if (role === "judge") {
    if (controlRole === "ALPHA") return 1;
    if (/r1|reason|instruct/.test(lower)) return 0.9;
    return 0.75;
  }
  // drafter
  if (/nano|mini|1b|1\.5b|350m/.test(lower)) return 1;
  return 0.8;
}

function scoreLatency(role: TrinityRole, model: string | null | undefined) {
  const size = parseModelSizeB(model);
  if (role === "drafter") return clamp01(1 - size / 8);
  if (role === "writer") return clamp01(1 - size / 16);
  return clamp01(1 - size / 20);
}

function scoreCost(model: string | null | undefined) {
  const size = parseModelSizeB(model);
  return clamp01(1 - size / 20);
}

function scoreReliability(lastHeartbeatAt: Date | null, smokeTestPassedAt: Date | null) {
  const now = Date.now();
  const heartbeatAgeMs = lastHeartbeatAt ? now - new Date(lastHeartbeatAt).getTime() : Number.POSITIVE_INFINITY;
  const heartbeatScore =
    heartbeatAgeMs <= 5 * 60 * 1000
      ? 1
      : heartbeatAgeMs <= 60 * 60 * 1000
      ? 0.8
      : heartbeatAgeMs <= 24 * 60 * 60 * 1000
      ? 0.5
      : 0.2;
  const smokeScore = smokeTestPassedAt ? 1 : 0.5;
  return clamp01(heartbeatScore * 0.7 + smokeScore * 0.3);
}

function scoreQuality(smokeTestPassedAt: Date | null, readiness: string, enabled: boolean) {
  const enabledScore = enabled ? 1 : 0;
  const readinessScore = readiness === "READY" ? 1 : 0;
  const smokeScore = smokeTestPassedAt ? 1 : 0.7;
  return clamp01(enabledScore * 0.2 + readinessScore * 0.4 + smokeScore * 0.4);
}

async function resolveManualRoleProvider(
  role: TrinityRole,
  requestedAgentKey: string
): Promise<ResolvedProviderConfig> {
  const agentKey = normalizeText(requestedAgentKey);
  if (!agentKey) {
    throw new SovereignApiError({
      message: `Manual staffing for ${role} is empty.`,
      statusCode: 400,
      type: "invalid_request_error",
      code: "invalid_staffing_agent",
      param: `team.manual_staffing.${role}`
    });
  }
  const agent = await prisma.agent.findFirst({
    where: { key: { equals: agentKey, mode: "insensitive" } },
    select: {
      key: true,
      enabled: true,
      readiness: true,
      runtime: true
    }
  });
  if (!agent) {
    throw new SovereignApiError({
      message: `Manual staffing agent @${agentKey} is not registered.`,
      statusCode: 400,
      type: "invalid_request_error",
      code: "staffing_agent_not_found",
      param: `team.manual_staffing.${role}`
    });
  }
  if (!agent.enabled) {
    throw new SovereignApiError({
      message: `Manual staffing agent @${agent.key} is disabled.`,
      statusCode: 400,
      type: "invalid_request_error",
      code: "staffing_agent_disabled",
      param: `team.manual_staffing.${role}`
    });
  }
  if (agent.readiness !== "READY") {
    throw new SovereignApiError({
      message: `Manual staffing agent @${agent.key} readiness is ${agent.readiness}; READY required.`,
      statusCode: 400,
      type: "invalid_request_error",
      code: "staffing_agent_not_ready",
      param: `team.manual_staffing.${role}`
    });
  }
  if (agent.runtime !== "LOCAL" && agent.runtime !== "CLOUD") {
    throw new SovereignApiError({
      message: `Manual staffing agent @${agent.key} runtime ${agent.runtime} is not runnable.`,
      statusCode: 400,
      type: "invalid_request_error",
      code: "staffing_agent_runtime_invalid",
      param: `team.manual_staffing.${role}`
    });
  }

  const resolved = await resolveRuntimeConfigForTask({ agentKey: agent.key, projectName: null });
  if (resolved.effective.runtime === "LOCAL") {
    return {
      provider: "ollama",
      endpoint: resolved.effective.endpoint.replace(/\/$/, ""),
      model: resolved.effective.model,
      apiKey: null,
      capabilityProfile: "ollama-chat-v1"
    };
  }
  const apiKeyEnv = normalizeText(resolved.effective.apiKeyEnv);
  const apiKey = apiKeyEnv ? normalizeText(process.env[apiKeyEnv]) : normalizeText(process.env.OPENAI_API_KEY);
  return {
    provider: "openai-compatible",
    endpoint: resolved.effective.endpoint.replace(/\/$/, ""),
    model: resolved.effective.model,
    apiKey: apiKey || null,
    capabilityProfile: "openai-chat-v1"
  };
}

function normalizeGroupRole(role: string | null | undefined): TrinityRole | null {
  const normalized = normalizeText(role).toLowerCase();
  if (normalized === "drafter" || normalized === "writer" || normalized === "judge") return normalized;
  return null;
}

async function resolveGroupRoleDefaults(groupId: string) {
  const visited = new Set<string>();
  let nestedGroupsVisited = 0;
  const defaults: Partial<Record<TrinityRole, string>> = {};
  const firstLevel = await prisma.$queryRaw<
    Array<{ memberType: string; memberAgentKey: string | null; memberGroupId: string | null; role: string | null }>
  >(
    Prisma.sql`
      SELECT "memberType", "memberAgentKey", "memberGroupId", "role"
      FROM "AgentGroupMember"
      WHERE "groupId" = ${groupId}
      ORDER BY "createdAt" ASC
    `
  );
  const directMemberCount = firstLevel.length;

  const walkGroup = async (currentGroupId: string, depth: number): Promise<void> => {
    if (depth > 6) return;
    if (visited.has(currentGroupId)) return;
    visited.add(currentGroupId);
    const members = await prisma.$queryRaw<
      Array<{ memberType: string; memberAgentKey: string | null; memberGroupId: string | null; role: string | null }>
    >(
      Prisma.sql`
        SELECT "memberType", "memberAgentKey", "memberGroupId", "role"
        FROM "AgentGroupMember"
        WHERE "groupId" = ${currentGroupId}
        ORDER BY "createdAt" ASC
      `
    );
    for (const member of members) {
      const role = normalizeGroupRole(member.role);
      if (member.memberType === "AGENT" && role && member.memberAgentKey && !defaults[role]) {
        defaults[role] = member.memberAgentKey;
        continue;
      }
      if (member.memberType !== "GROUP" || !member.memberGroupId) continue;
      const childRows = await prisma.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`SELECT "id" FROM "AgentGroup" WHERE "id" = ${member.memberGroupId} AND "active" = true LIMIT 1`
      );
      if (!childRows.length) continue;
      nestedGroupsVisited += 1;
      await walkGroup(member.memberGroupId, depth + 1);
    }
  };

  await walkGroup(groupId, 0);
  return {
    directMemberCount,
    nestedGroupsVisited,
    roleDefaults: defaults
  };
}

async function buildAutoRoleSelection(role: TrinityRole, calibration: StaffingCalibration) {
  const candidates = await prisma.agent.findMany({
    where: {
      enabled: true,
      readiness: "READY",
      runtime: { in: ["LOCAL", "CLOUD"] }
    },
    select: {
      key: true,
      model: true,
      controlRole: true,
      enabled: true,
      readiness: true,
      lastHeartbeatAt: true,
      smokeTestPassedAt: true
    },
    orderBy: { key: "asc" }
  });

  const rankingMap = await getRoleRankingMap(role);
  const evaluated = candidates.map((agent) => {
    const quality = scoreQuality(agent.smokeTestPassedAt, agent.readiness, agent.enabled);
    const roleFit = scoreRoleFit(role, agent.model, agent.controlRole);
    const latency = scoreLatency(role, agent.model);
    const cost = scoreCost(agent.model);
    const reliability = scoreReliability(agent.lastHeartbeatAt, agent.smokeTestPassedAt);
    const ranking = rankingMap.get(agent.key);
    const rankingBoost = ranking ? clamp01(((ranking.rating || 1000) - 1000) / 400 + 0.5) : 0.5;
    const total =
      quality * calibration.qualityWeight +
      roleFit * calibration.roleFitWeight +
      latency * calibration.latencyWeight +
      cost * calibration.costWeight +
      reliability * calibration.reliabilityWeight +
      rankingBoost * calibration.rankingBoostWeight;
    return {
      agentKey: agent.key,
      total,
      quality,
      roleFit,
      latency,
      cost,
      reliability,
      rankingBoost
    };
  });

  evaluated.sort((a, b) => {
    if (b.total !== a.total) return b.total - a.total;
    return a.agentKey.localeCompare(b.agentKey);
  });

  return {
    selectedAgentKey: evaluated[0]?.agentKey || null,
    evaluated
  };
}

async function resolveStaffingDecision(
  input: SovereignChatCompletionsRequest,
  fallbackProvider: ResolvedProviderConfig
): Promise<StaffingDecision> {
  const calibration = resolveStaffingCalibration();
  const strategy = input.team?.strategy === "manual" ? "manual" : "auto";
  const manual = input.team?.manual_staffing;
  const resolvedProviders: Partial<Record<TrinityRole, ResolvedProviderConfig>> = {};
  const assignments: Partial<Record<TrinityRole, string>> = {};
  const scoring: StaffingDecision["scoring"] = {
    drafter: { selectedAgentKey: null, evaluated: [] },
    writer: { selectedAgentKey: null, evaluated: [] },
    judge: { selectedAgentKey: null, evaluated: [] }
  };
  let group: StaffingDecision["group"] = null;
  let teamPolicy: TeamPolicyContext | undefined;

  const requestedGroupKey = normalizeText(input.team?.group_key);
  if (requestedGroupKey) {
    const groups = await prisma.$queryRaw<Array<{ id: string; key: string; active: boolean }>>(
      Prisma.sql`
        SELECT "id", "key", "active"
        FROM "AgentGroup"
        WHERE "key" = ${requestedGroupKey}
        LIMIT 1
      `
    );
    const selected = groups[0];
    if (!selected) {
      throw new SovereignApiError({
        message: `Requested team.group_key "${requestedGroupKey}" is not registered.`,
        statusCode: 400,
        type: "invalid_request_error",
        code: "group_not_found",
        param: "team.group_key"
      });
    }
    if (!selected.active) {
      throw new SovereignApiError({
        message: `Requested team.group_key "${requestedGroupKey}" is not active.`,
        statusCode: 400,
        type: "invalid_request_error",
        code: "group_inactive",
        param: "team.group_key"
      });
    }
    const counts = await prisma.$queryRaw<Array<{ count: bigint | number }>>(
      Prisma.sql`SELECT COUNT(*) AS count FROM "AgentGroupMember" WHERE "groupId" = ${selected.id}`
    );
    const countRaw = counts[0]?.count ?? 0;
    const memberCount = typeof countRaw === "bigint" ? Number(countRaw) : Number(countRaw);
    group = {
      key: selected.key,
      id: selected.id,
      memberCount
    };
    if (input.mode === "team") {
      const defaults = await resolveGroupRoleDefaults(selected.id);
      teamPolicy = {
        mode: "group_policy_v1",
        applied: true,
        sourceGroupKey: selected.key,
        sourceGroupId: selected.id,
        directMemberCount: defaults.directMemberCount,
        nestedGroupsVisited: defaults.nestedGroupsVisited,
        roleDefaults: defaults.roleDefaults,
        unresolvedRoles: (["drafter", "writer", "judge"] as TrinityRole[]).filter(
          (role) => !defaults.roleDefaults[role]
        ),
        precedence: ["manual_staffing", "group_role_defaults", "auto_staffing", "fallback_provider"]
      };
    }
  }

  if (teamPolicy?.roleDefaults) {
    for (const role of ["drafter", "writer", "judge"] as TrinityRole[]) {
      const fromGroup = teamPolicy.roleDefaults[role];
      if (!fromGroup) continue;
      try {
        assignments[role] = fromGroup;
        resolvedProviders[role] = await resolveManualRoleProvider(role, fromGroup);
      } catch {
        delete assignments[role];
      }
    }
  }

  if (strategy === "manual") {
    if (manual) {
      const roles: TrinityRole[] = ["drafter", "writer", "judge"];
      for (const role of roles) {
        const agentKey = normalizeText(manual[role]);
        if (!agentKey) continue;
        assignments[role] = agentKey;
        resolvedProviders[role] = await resolveManualRoleProvider(role, agentKey);
      }
    }
  } else {
    for (const role of ["drafter", "writer", "judge"] as TrinityRole[]) {
      if (resolvedProviders[role]) continue;
      const selected = await buildAutoRoleSelection(role, calibration);
      scoring[role] = selected;
      if (selected.selectedAgentKey) {
        assignments[role] = selected.selectedAgentKey;
        resolvedProviders[role] = await resolveManualRoleProvider(role, selected.selectedAgentKey);
      }
    }
  }

  for (const role of ["drafter", "writer", "judge"] as TrinityRole[]) {
    if (!resolvedProviders[role]) resolvedProviders[role] = fallbackProvider;
  }
  if (teamPolicy) {
    teamPolicy.unresolvedRoles = (["drafter", "writer", "judge"] as TrinityRole[]).filter(
      (role) => !assignments[role]
    );
  }

  return {
    strategy,
    assignments,
    resolvedProviders,
    calibration,
    teamPolicy,
    scoring,
    group
  };
}

async function executeTrinity(input: SovereignChatCompletionsRequest): Promise<SovereignExecutionSuccess> {
  const resolved = resolveProviderConfig(input);
  const staffing = await resolveStaffingDecision(input, resolved);
  const normalizedInputMessages = normalizeMessages(input.messages);
  const requestId = `chatcmpl_${randomUUID()}`;
  const userRequest = normalizedInputMessages
    .filter((m) => m.role !== "system")
    .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
    .join("\n\n")
    .trim();
  const drafterLow = 0.7;
  const writerLow = 0.75;
  const judgeLow = 0.8;
  const maxAttempts = 5;
  const stageTrace: TrinityStageResult[] = [];
  let draftContent = "";
  let writerContent = "";
  let finalJudge: TrinityStageResult | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const drafterPrompt = [
      "You are the Drafter in a Trinity pipeline.",
      "Return ONLY JSON with keys: status, confidence, reasonClass, askBack, content.",
      "status must be one of: accepted, revised, rejected, needs_clarification.",
      "confidence must be number in [0,1].",
      "If input is fuzzy, set askBack=true and status=needs_clarification.",
      "Create a clear executable draft/spec for the Writer.",
      "",
      `Request:\n${userRequest}`
    ].join("\n");
    const drafterRaw = await runProviderCompletion(
      staffing.resolvedProviders.drafter || resolved,
      [{ role: "user", content: drafterPrompt }],
      input
    );
    const drafter = parseStageResponse("drafter", attempt, drafterRaw.outputText);
    stageTrace.push(drafter);
    draftContent = drafter.content;
    if (drafter.askBack || drafter.status === "needs_clarification" || drafter.confidence < drafterLow) {
      if (staffing.strategy === "auto" && staffing.assignments.drafter && staffing.scoring?.drafter) {
        await applyRoleRankingOutcome({
          role: "drafter",
          selectedAgentKey: staffing.assignments.drafter,
          selectedConfidence: drafter.confidence,
          contenderAgentKeys: staffing.scoring.drafter.evaluated.map((row) => row.agentKey),
          accepted: false
        }).catch(() => {});
      }
      let runId: string | null = null;
      try {
        runId = await persistTrinityExecutionRun({
          requestId,
          mode: "trinity",
          provider: drafterRaw.provider,
          model: drafterRaw.model,
          status: "CLARIFICATION_REQUIRED_DRAFTER",
          finalConfidence: null,
          attempts: attempt,
          inputMessages: normalizedInputMessages,
          outputText: drafter.content || "Clarification required by Drafter.",
          stageTrace,
          meta: {
            stage: "drafter",
            reasonClass: drafter.reasonClass,
            staffing
          }
        });
      } catch {
        runId = null;
      }
      return {
        id: requestId,
        mode: "trinity",
        provider: drafterRaw.provider,
        model: drafterRaw.model,
        outputText: `Clarification required by Drafter: ${drafter.content || "Please clarify task requirements."}`,
        finishReason: "stop",
        metadata: { trinityStatus: "CLARIFICATION_REQUIRED", stage: "drafter", stageTrace, runId, staffing }
      };
    }

    const writerPrompt = [
      "You are the Writer in a Trinity pipeline.",
      "Return ONLY JSON with keys: status, confidence, reasonClass, askBack, content.",
      "status must be one of: accepted, revised, rejected, needs_clarification.",
      "confidence must be number in [0,1].",
      "If draft is unclear, set askBack=true and status=needs_clarification.",
      "Execute the task from the draft and include the final answer in content.",
      "",
      `Draft:\n${draftContent}`,
      "",
      `Original request:\n${userRequest}`
    ].join("\n");
    const writerRaw = await runProviderCompletion(
      staffing.resolvedProviders.writer || resolved,
      [{ role: "user", content: writerPrompt }],
      input
    );
    const writer = parseStageResponse("writer", attempt, writerRaw.outputText);
    stageTrace.push(writer);
    writerContent = writer.content;
    if (writer.askBack || writer.status === "needs_clarification" || writer.confidence < writerLow) {
      if (staffing.strategy === "auto" && staffing.assignments.writer && staffing.scoring?.writer) {
        await applyRoleRankingOutcome({
          role: "writer",
          selectedAgentKey: staffing.assignments.writer,
          selectedConfidence: writer.confidence,
          contenderAgentKeys: staffing.scoring.writer.evaluated.map((row) => row.agentKey),
          accepted: false
        }).catch(() => {});
      }
      let runId: string | null = null;
      try {
        runId = await persistTrinityExecutionRun({
          requestId,
          mode: "trinity",
          provider: writerRaw.provider,
          model: writerRaw.model,
          status: "CLARIFICATION_REQUIRED_WRITER",
          finalConfidence: null,
          attempts: attempt,
          inputMessages: normalizedInputMessages,
          outputText: writer.content || "Clarification required by Writer.",
          stageTrace,
          meta: {
            stage: "writer",
            reasonClass: writer.reasonClass,
            staffing
          }
        });
      } catch {
        runId = null;
      }
      return {
        id: requestId,
        mode: "trinity",
        provider: writerRaw.provider,
        model: writerRaw.model,
        outputText: `Clarification required by Writer: ${writer.content || "Please provide missing details."}`,
        finishReason: "stop",
        metadata: { trinityStatus: "CLARIFICATION_REQUIRED", stage: "writer", stageTrace, runId, staffing }
      };
    }

    const judgePrompt = [
      "You are the Judge in a Trinity pipeline.",
      "Return ONLY JSON with keys: status, confidence, reasonClass, askBack, content.",
      "status must be one of: accepted, revised, rejected, needs_clarification.",
      "confidence must be number in [0,1].",
      "content must contain concise judgement notes.",
      "If answer is acceptable set status=accepted; otherwise set rejected or revised.",
      "",
      `Draft:\n${draftContent}`,
      "",
      `Writer output:\n${writerContent}`,
      "",
      `Original request:\n${userRequest}`
    ].join("\n");
    const judgeRaw = await runProviderCompletion(
      staffing.resolvedProviders.judge || resolved,
      [{ role: "user", content: judgePrompt }],
      input
    );
    const judge = parseStageResponse("judge", attempt, judgeRaw.outputText);
    stageTrace.push(judge);
    finalJudge = judge;

    const finalConfidence = clamp01(drafter.confidence * writer.confidence * judge.confidence);
    const accepted = judge.status === "accepted" && judge.confidence >= judgeLow;
    if (accepted) {
      if (staffing.strategy === "auto") {
        const updates: Promise<void>[] = [];
        if (staffing.assignments.drafter && staffing.scoring?.drafter) {
          updates.push(
            applyRoleRankingOutcome({
              role: "drafter",
              selectedAgentKey: staffing.assignments.drafter,
              selectedConfidence: drafter.confidence,
              contenderAgentKeys: staffing.scoring.drafter.evaluated.map((row) => row.agentKey),
              accepted: true
            })
          );
        }
        if (staffing.assignments.writer && staffing.scoring?.writer) {
          updates.push(
            applyRoleRankingOutcome({
              role: "writer",
              selectedAgentKey: staffing.assignments.writer,
              selectedConfidence: writer.confidence,
              contenderAgentKeys: staffing.scoring.writer.evaluated.map((row) => row.agentKey),
              accepted: true
            })
          );
        }
        if (staffing.assignments.judge && staffing.scoring?.judge) {
          updates.push(
            applyRoleRankingOutcome({
              role: "judge",
              selectedAgentKey: staffing.assignments.judge,
              selectedConfidence: judge.confidence,
              contenderAgentKeys: staffing.scoring.judge.evaluated.map((row) => row.agentKey),
              accepted: true
            })
          );
        }
        await Promise.allSettled(updates);
      }
      let runId: string | null = null;
      try {
        runId = await persistTrinityExecutionRun({
          requestId,
          mode: "trinity",
          provider: judgeRaw.provider,
          model: judgeRaw.model,
          status: "ACCEPTED",
          finalConfidence,
          attempts: attempt,
          inputMessages: normalizedInputMessages,
          outputText: writerContent,
          stageTrace,
          meta: {
            stage: "judge",
            reasonClass: judge.reasonClass,
            staffing
          }
        });
      } catch {
        runId = null;
      }
      return {
        id: requestId,
        mode: "trinity",
        provider: judgeRaw.provider,
        model: judgeRaw.model,
        outputText: writerContent,
        finishReason: "stop",
        metadata: {
          trinityStatus: "ACCEPTED",
          stageTrace,
          finalConfidence,
          runId,
          staffing
        }
      };
    }
  }

  let runId: string | null = null;
  if (staffing.strategy === "auto") {
    const updates: Promise<void>[] = [];
    if (staffing.assignments.drafter && staffing.scoring?.drafter) {
      updates.push(
        applyRoleRankingOutcome({
          role: "drafter",
          selectedAgentKey: staffing.assignments.drafter,
          selectedConfidence: stageTrace.find((x) => x.stage === "drafter")?.confidence ?? null,
          contenderAgentKeys: staffing.scoring.drafter.evaluated.map((row) => row.agentKey),
          accepted: false
        })
      );
    }
    if (staffing.assignments.writer && staffing.scoring?.writer) {
      updates.push(
        applyRoleRankingOutcome({
          role: "writer",
          selectedAgentKey: staffing.assignments.writer,
          selectedConfidence: stageTrace.find((x) => x.stage === "writer")?.confidence ?? null,
          contenderAgentKeys: staffing.scoring.writer.evaluated.map((row) => row.agentKey),
          accepted: false
        })
      );
    }
    if (staffing.assignments.judge && staffing.scoring?.judge) {
      updates.push(
        applyRoleRankingOutcome({
          role: "judge",
          selectedAgentKey: staffing.assignments.judge,
          selectedConfidence: stageTrace.find((x) => x.stage === "judge")?.confidence ?? null,
          contenderAgentKeys: staffing.scoring.judge.evaluated.map((row) => row.agentKey),
          accepted: false
        })
      );
    }
    await Promise.allSettled(updates);
  }
  try {
    runId = await persistTrinityExecutionRun({
      requestId,
      mode: "trinity",
      provider: resolved.provider,
      model: resolved.model,
      status: "RETRY_BUDGET_EXHAUSTED",
      finalConfidence: null,
      attempts: maxAttempts,
      inputMessages: normalizedInputMessages,
      outputText:
        writerContent ||
        finalJudge?.content ||
        "Trinity could not reach acceptance within retry budget. Please clarify and retry.",
      stageTrace,
      meta: {
        stage: finalJudge?.stage || null,
        reasonClass: finalJudge?.reasonClass || "unknown",
        staffing
      }
    });
  } catch {
    runId = null;
  }

  return {
    id: requestId,
    mode: "trinity",
    provider: resolved.provider,
    model: resolved.model,
    outputText:
      writerContent ||
      finalJudge?.content ||
      "Trinity could not reach acceptance within retry budget. Please clarify and retry.",
    finishReason: "length",
    metadata: {
      trinityStatus: "RETRY_BUDGET_EXHAUSTED",
      stageTrace,
      runId,
      staffing
    }
  };
}

export async function executeSovereignChatCompletion(
  input: SovereignChatCompletionsRequest
): Promise<SovereignExecutionSuccess> {
  const mode = normalizeText(input.mode || "direct").toLowerCase() as SovereignApiMode;
  if (mode === "trinity") {
    return executeTrinity(input);
  }
  if (mode === "team") {
    const trinityResult = await executeTrinity(input);
    return {
      ...trinityResult,
      mode: "team",
      metadata: {
        ...(trinityResult.metadata || {}),
        teamStatus: "GROUP_POLICY_TRINITY_MODE"
      }
    };
  }
  if (mode === "auto") {
    const trinityResult = await executeTrinity({
      ...input,
      mode: "trinity",
      team: {
        ...(input.team || {}),
        strategy: "auto"
      }
    });
    return {
      ...trinityResult,
      mode: "auto",
      metadata: {
        ...(trinityResult.metadata || {}),
        staffingStatus: "AUTO_SCORING_APPLIED"
      }
    };
  }
  return executeDirect(input);
}

export async function listSovereignApiModels() {
  const localEndpoint = sovereignEnvDefault("OLLAMA_BASE_URL", "http://127.0.0.1:11434").replace(/\/$/, "");
  let ollamaModels: string[] = [];
  try {
    const res = await fetch(`${localEndpoint}/api/tags`, { method: "GET", cache: "no-store" });
    if (res.ok) {
      const payload = await res.json();
      ollamaModels = Array.isArray(payload?.models)
        ? payload.models
            .map((row: { name?: string; model?: string }) => normalizeText(row?.name || row?.model || ""))
            .filter(Boolean)
        : [];
    }
  } catch {
    ollamaModels = [];
  }

  const known = new Set<string>([...AGENT_MODEL_PRESETS, ...ollamaModels]);
  return Array.from(known).sort((a, b) => a.localeCompare(b));
}
