import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { sovereignEnvDefault } from "@/lib/env-sovereign";
import { AGENT_MODEL_PRESETS } from "@/lib/model-presets";
import { prisma } from "@/lib/prisma";
import { resolveRuntimeConfigForTask } from "@/lib/runtime-config";

export type SovereignApiMode = "direct" | "dag";
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

// staffing / trinity types decommissioned

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

// Weight / calibration logic decommissioned

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

// parseStageResponse decommissioned

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
    const isDrafterStage = /You are the Drafter in a Trinity pipeline/i.test(finalPrompt);
    const isWriterStage = /You are the Writer in a Trinity pipeline/i.test(finalPrompt);
    const isJudgeStage = /You are the Judge in a Trinity pipeline/i.test(finalPrompt);
    const isTrinityStage = isDrafterStage || isWriterStage || isJudgeStage;
    const forceDrafterClarification = /force_drafter_clarification/i.test(finalPrompt);
    const forceRetryBudgetExhausted = /force_retry_budget_exhausted/i.test(finalPrompt);
    if (isTrinityStage) {
      return {
        provider: "mock",
        model: resolved.model,
        outputText: "Mock response: Trinity pipeline decommissioned. Transition to DAG governed routing.",
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

// executeTrinity decommissioned

export async function executeSovereignChatCompletion(
  input: SovereignChatCompletionsRequest
): Promise<SovereignExecutionSuccess> {
  const mode = normalizeText(input.mode || "direct").toLowerCase() as SovereignApiMode;
  if (mode === "dag") {
    throw new SovereignApiError({
      message: "The DAG mode is not supported via the chat/completions endpoint. Use /api/sovereign/ingest.",
      statusCode: 400,
      type: "invalid_request_error",
      code: "unsupported_mode"
    });
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
