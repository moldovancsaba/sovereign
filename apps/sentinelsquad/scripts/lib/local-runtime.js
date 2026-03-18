const DEFAULT_LOCAL_MODEL_FALLBACK_CANDIDATES = [
  "Granite-4.0-H-1B",
  "granite4:350m",
  "qwen2.5-coder:7b",
  "qwen2.5:7b",
  "qwen2.5:3b",
  "llama3.2:3b",
  "phi3:mini",
  "deepseek-r1:1.5b"
];

const catalogCache = new Map();
const DEFAULT_CACHE_TTL_MS = 15_000;

function normalizeModelName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function buildModelAliasCandidates(model) {
  const requested = String(model || "").trim();
  const candidates = new Set();
  if (requested) candidates.add(requested);
  const normalized = normalizeModelName(requested);
  if (normalized === "granite40h1b" || normalized === "granite4h1b") {
    candidates.add("granite4:350m");
  }
  return Array.from(candidates);
}

async function listInstalledLocalModels(options = {}) {
  const endpoint = String(options.endpoint || "http://127.0.0.1:11434").trim();
  const timeoutMs = Number(options.timeoutMs || 15_000);
  const cacheTtlMs = Number(options.cacheTtlMs || DEFAULT_CACHE_TTL_MS);
  const cacheKey = endpoint;
  const now = Date.now();
  const cached = catalogCache.get(cacheKey);

  if (cached && cached.expiresAt > now) {
    return cached.models;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${endpoint}/api/tags`, {
      method: "GET",
      signal: controller.signal
    });
    if (!response.ok) {
      return cached?.models || [];
    }
    const payload = await response.json();
    const models = Array.isArray(payload?.models)
      ? payload.models
          .map((row) => String(row?.name || row?.model || "").trim())
          .filter(Boolean)
      : [];
    catalogCache.set(cacheKey, {
      models,
      expiresAt: now + cacheTtlMs
    });
    return models;
  } catch (_error) {
    return cached?.models || [];
  } finally {
    clearTimeout(timeout);
  }
}

function selectInstalledModel(requestedModel, installedModels, fallbackCandidates = []) {
  if (!Array.isArray(installedModels) || installedModels.length === 0) {
    return String(requestedModel || "").trim();
  }

  const installedLookup = new Map();
  for (const model of installedModels) {
    installedLookup.set(model, model);
    installedLookup.set(normalizeModelName(model), model);
  }

  const preferenceChain = [
    ...buildModelAliasCandidates(requestedModel),
    ...fallbackCandidates,
    ...DEFAULT_LOCAL_MODEL_FALLBACK_CANDIDATES
  ];

  for (const candidate of preferenceChain) {
    const exact = installedLookup.get(candidate);
    if (exact) return exact;
    const normalized = installedLookup.get(normalizeModelName(candidate));
    if (normalized) return normalized;
  }

  return installedModels[0];
}

async function resolveInstalledLocalModel(options = {}) {
  const requestedModel = String(options.requestedModel || "").trim();
  const installedModels = await listInstalledLocalModels(options);
  return selectInstalledModel(
    requestedModel,
    installedModels,
    Array.isArray(options.fallbackCandidates) ? options.fallbackCandidates : []
  );
}

module.exports = {
  DEFAULT_LOCAL_MODEL_FALLBACK_CANDIDATES,
  buildModelAliasCandidates,
  listInstalledLocalModels,
  normalizeModelName,
  resolveInstalledLocalModel,
  selectInstalledModel
};
