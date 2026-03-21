function asRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value;
}

function normalizeText(value) {
  const normalized = String(value || "").trim();
  return normalized || "";
}

function clampInt(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.trunc(parsed), min), max);
}

function normalizeIssueNumber(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  const normalized = Math.trunc(parsed);
  return normalized > 0 ? normalized : null;
}

const ALLOWED_MEMORY_SCOPES = new Set(["THREAD", "PROJECT_SESSION"]);

function normalizeScope(value) {
  const raw = normalizeText(value).toUpperCase();
  if (!raw) return "THREAD";
  if (raw === "SESSION") return "PROJECT_SESSION";
  return raw;
}

function normalizeMode(value) {
  const raw = normalizeText(value).toUpperCase();
  if (!raw) return "READ";
  return raw;
}

function tokenize(text, maxTerms = 32) {
  const normalized = normalizeText(text).toLowerCase();
  if (!normalized) return [];
  const matches = normalized.match(/[a-z0-9_]+/g) || [];
  const deduped = [];
  const seen = new Set();
  for (const token of matches) {
    if (token.length < 2) continue;
    if (seen.has(token)) continue;
    seen.add(token);
    deduped.push(token);
    if (deduped.length >= maxTerms) break;
  }
  return deduped;
}

function trimSnippet(text, maxChars) {
  const normalized = normalizeText(text).replace(/\s+/g, " ");
  if (normalized.length <= maxChars) return normalized;
  const clipped = normalized.slice(0, Math.max(0, maxChars - 13)).trimEnd();
  return `${clipped} [TRUNCATED]`;
}

function isoOrNull(value) {
  if (value instanceof Date) return value.toISOString();
  const parsed = Date.parse(String(value || ""));
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toISOString();
}

function envMem(env, sovereignKey, legacyKey, fallback, min, max) {
  const raw = env[sovereignKey] ?? env[legacyKey];
  return clampInt(raw, fallback, min, max);
}

function resolveTaskMemoryConfig(env = process.env) {
  const queryMaxChars = envMem(env, "SOVEREIGN_MEMORY_QUERY_MAX_CHARS", "SENTINELSQUAD_MEMORY_QUERY_MAX_CHARS", 280, 80, 600);
  const defaultDocumentLimit = envMem(env, "SOVEREIGN_MEMORY_DOCUMENT_LIMIT", "SENTINELSQUAD_MEMORY_DOCUMENT_LIMIT", 80, 10, 200);
  const defaultMaxSnippets = envMem(env, "SOVEREIGN_MEMORY_DEFAULT_MAX_SNIPPETS", "SENTINELSQUAD_MEMORY_DEFAULT_MAX_SNIPPETS", 4, 1, 8);
  const defaultSnippetMaxChars = envMem(
    env,
    "SOVEREIGN_MEMORY_DEFAULT_SNIPPET_MAX_CHARS",
    "SENTINELSQUAD_MEMORY_DEFAULT_SNIPPET_MAX_CHARS",
    320,
    80,
    800
  );
  const indexDocumentMaxChars = envMem(
    env,
    "SOVEREIGN_MEMORY_INDEX_DOC_MAX_CHARS",
    "SENTINELSQUAD_MEMORY_INDEX_DOC_MAX_CHARS",
    1200,
    120,
    4000
  );
  return {
    queryMaxChars,
    defaultDocumentLimit,
    defaultMaxSnippets,
    defaultSnippetMaxChars,
    indexDocumentMaxChars
  };
}

function buildTaskMemoryRequest(params) {
  const config = params?.config || resolveTaskMemoryConfig();
  const payloadRecord = asRecord(params?.payload);
  const memoryRecord = asRecord(payloadRecord?.memory);
  const task = asRecord(params?.task);
  const queryOverride = normalizeText(params?.queryOverride);
  const queryFromPayload = normalizeText(memoryRecord?.query);
  const queryFromTask = normalizeText(task?.title);
  const requestedScope = normalizeText(memoryRecord?.scope).toUpperCase() || null;
  const requestedMode = normalizeText(memoryRecord?.mode).toUpperCase() || null;
  const requestedEnabled = typeof memoryRecord?.enabled === "boolean" ? memoryRecord.enabled : null;
  const requestedDocumentLimit = memoryRecord?.documentLimit;
  const requestedMaxSnippets = memoryRecord?.maxSnippets;
  const requestedSnippetMaxChars = memoryRecord?.snippetMaxChars;
  const projectSessionId =
    normalizeText(params?.projectSessionId) || normalizeText(memoryRecord?.projectSessionId) || null;

  return {
    query: queryOverride || queryFromPayload || queryFromTask,
    scope: normalizeScope(memoryRecord?.scope),
    mode: normalizeMode(memoryRecord?.mode),
    enabled: requestedEnabled == null ? true : requestedEnabled,
    threadId: normalizeText(task?.threadId) || null,
    issueNumber: normalizeIssueNumber(task?.issueNumber),
    projectSessionId,
    documentLimit: clampInt(
      requestedDocumentLimit,
      config.defaultDocumentLimit,
      10,
      config.defaultDocumentLimit
    ),
    maxSnippets: clampInt(
      requestedMaxSnippets,
      config.defaultMaxSnippets,
      1,
      config.defaultMaxSnippets
    ),
    snippetMaxChars: clampInt(
      requestedSnippetMaxChars,
      config.defaultSnippetMaxChars,
      80,
      config.defaultSnippetMaxChars
    ),
    requestedScope,
    requestedMode,
    requestedEnabled,
    requestedDocumentLimit:
      typeof requestedDocumentLimit === "number" && Number.isFinite(requestedDocumentLimit)
        ? Math.trunc(requestedDocumentLimit)
        : null,
    requestedMaxSnippets:
      typeof requestedMaxSnippets === "number" && Number.isFinite(requestedMaxSnippets)
        ? Math.trunc(requestedMaxSnippets)
        : null,
    requestedSnippetMaxChars:
      typeof requestedSnippetMaxChars === "number" && Number.isFinite(requestedSnippetMaxChars)
        ? Math.trunc(requestedSnippetMaxChars)
        : null
  };
}

function evaluateTaskMemoryPolicy(request, config = resolveTaskMemoryConfig()) {
  if (!request?.enabled) {
    return {
      allowed: false,
      code: "MEMORY_DISABLED",
      reason: "Task memory retrieval is disabled for this request."
    };
  }
  if (request.mode !== "READ") {
    return {
      allowed: false,
      code: "MEMORY_MODE_DENIED",
      reason: `Memory mode "${request.mode}" is denied. Only READ mode is allowed in this phase.`
    };
  }
  if (!ALLOWED_MEMORY_SCOPES.has(request.scope)) {
    return {
      allowed: false,
      code: "MEMORY_SCOPE_DENIED",
      reason: `Memory scope "${request.scope}" is denied. Allowed: THREAD, PROJECT_SESSION.`
    };
  }
  if (!request.query) {
    return {
      allowed: false,
      code: "MEMORY_QUERY_MISSING",
      reason: "Memory retrieval denied: query is empty."
    };
  }
  if (request.query.length > config.queryMaxChars) {
    return {
      allowed: false,
      code: "MEMORY_QUERY_TOO_LARGE",
      reason: `Memory retrieval denied: query length ${request.query.length} exceeds ${config.queryMaxChars}.`
    };
  }

  if (request.scope === "PROJECT_SESSION") {
    if (!request.projectSessionId) {
      return {
        allowed: false,
        code: "MEMORY_PROJECT_SESSION_REQUIRED",
        reason: "Memory retrieval denied: no active project session for PROJECT_SESSION scope."
      };
    }
    return {
      allowed: true,
      code: "MEMORY_ALLOWED",
      reason: "Memory retrieval policy check passed (project-session scope)."
    };
  }

  if (!request.threadId) {
    return {
      allowed: false,
      code: "MEMORY_THREAD_REQUIRED",
      reason: "Memory retrieval denied: task has no linked thread."
    };
  }
  if (!request.issueNumber) {
    return {
      allowed: false,
      code: "MEMORY_ISSUE_SCOPE_REQUIRED",
      reason: "Memory retrieval denied: issue scope is required."
    };
  }

  return {
    allowed: true,
    code: "MEMORY_ALLOWED",
    reason: "Memory retrieval policy check passed."
  };
}

function buildTaskMemoryAuditMetadata(request, config, extras = {}) {
  return {
    code: extras.code || null,
    scope: request.scope,
    mode: request.mode,
    enabled: request.enabled,
    issueNumber: request.issueNumber,
    threadId: request.threadId,
    projectSessionId: request.projectSessionId || null,
    queryLength: request.query.length,
    queryMaxChars: config.queryMaxChars,
    documentLimit: request.documentLimit,
    maxSnippets: request.maxSnippets,
    snippetMaxChars: request.snippetMaxChars,
    requestedScope: request.requestedScope,
    requestedMode: request.requestedMode,
    requestedEnabled: request.requestedEnabled,
    requestedDocumentLimit: request.requestedDocumentLimit,
    requestedMaxSnippets: request.requestedMaxSnippets,
    requestedSnippetMaxChars: request.requestedSnippetMaxChars,
    ...extras
  };
}

function buildTaskMemoryIndexRows(messages, options = {}) {
  const documentLimit = clampInt(options.documentLimit, 80, 1, 200);
  const indexDocumentMaxChars = clampInt(options.indexDocumentMaxChars, 1200, 120, 4000);
  const source = Array.isArray(messages) ? messages : [];
  const rows = [];
  for (const message of source) {
    if (rows.length >= documentLimit) break;
    if (!message) continue;
    const authorType = normalizeText(message.authorType).toUpperCase();
    if (authorType !== "HUMAN" && authorType !== "AGENT") continue;
    const text = trimSnippet(message.content, indexDocumentMaxChars);
    if (!text) continue;
    const createdAtIso = isoOrNull(message.createdAt);
    rows.push({
      id: normalizeText(message.id) || `row-${rows.length + 1}`,
      authorType,
      createdAt: createdAtIso,
      createdAtMs: createdAtIso ? Date.parse(createdAtIso) : 0,
      text,
      tokenSet: new Set(tokenize(text, 96))
    });
  }
  return rows;
}

function buildProjectMemoryIndexRows(memories, options = {}) {
  const documentLimit = clampInt(options.documentLimit, 80, 1, 200);
  const indexDocumentMaxChars = clampInt(options.indexDocumentMaxChars, 1200, 120, 4000);
  const source = Array.isArray(memories) ? memories : [];
  const rows = [];
  for (const mem of source) {
    if (rows.length >= documentLimit) break;
    if (!mem) continue;
    const title = normalizeText(mem.title);
    const summary = normalizeText(mem.summary);
    const content = normalizeText(mem.content);
    const body = [title, summary, content].filter(Boolean).join("\n");
    const text = trimSnippet(body, indexDocumentMaxChars);
    if (!text) continue;
    const createdAtIso = isoOrNull(mem.updatedAt || mem.createdAt);
    rows.push({
      id: normalizeText(mem.id) || `pm-${rows.length + 1}`,
      authorType: "AGENT",
      createdAt: createdAtIso,
      createdAtMs: createdAtIso ? Date.parse(createdAtIso) : 0,
      text,
      tokenSet: new Set(tokenize(text, 96))
    });
  }
  return rows;
}

function retrieveTaskMemorySnippets(params) {
  const query = normalizeText(params?.query);
  const documents = Array.isArray(params?.documents) ? params.documents : [];
  const maxSnippets = clampInt(params?.maxSnippets, 4, 1, 8);
  const snippetMaxChars = clampInt(params?.snippetMaxChars, 320, 80, 800);
  const queryTokens = tokenize(query, 24);

  if (!queryTokens.length) {
    return {
      snippets: [],
      indexedCount: documents.length,
      matchedCount: 0
    };
  }

  const matched = [];
  for (const row of documents) {
    let overlap = 0;
    for (const token of queryTokens) {
      if (row.tokenSet.has(token)) overlap += 1;
    }
    if (!overlap) continue;
    matched.push({
      ...row,
      overlap
    });
  }

  matched.sort((a, b) => {
    if (b.overlap !== a.overlap) return b.overlap - a.overlap;
    if (b.createdAtMs !== a.createdAtMs) return b.createdAtMs - a.createdAtMs;
    return a.id.localeCompare(b.id);
  });

  const snippets = matched.slice(0, maxSnippets).map((row, idx) => {
    const sourcePrefix = `[${row.authorType} ${row.createdAt || "unknown"} score=${row.overlap}]`;
    const source = row.createdAt ? `${row.authorType.toLowerCase()}@${row.createdAt}` : row.authorType.toLowerCase();
    const available = Math.max(40, snippetMaxChars - sourcePrefix.length - 1);
    return {
      rank: idx + 1,
      id: row.id,
      source,
      score: row.overlap,
      text: `${sourcePrefix} ${trimSnippet(row.text, available)}`
    };
  });

  return {
    snippets,
    indexedCount: documents.length,
    matchedCount: matched.length
  };
}

function buildTaskMemoryPromptBlock(snippets, header = "Memory snippets (thread-scoped, bounded):") {
  if (!Array.isArray(snippets) || snippets.length === 0) return "";
  const lines = snippets.map((snippet, idx) => `${idx + 1}. ${snippet.text}`);
  return [header, ...lines].join("\n");
}

module.exports = {
  resolveTaskMemoryConfig,
  buildTaskMemoryRequest,
  evaluateTaskMemoryPolicy,
  buildTaskMemoryAuditMetadata,
  buildTaskMemoryIndexRows,
  buildProjectMemoryIndexRows,
  retrieveTaskMemorySnippets,
  buildTaskMemoryPromptBlock
};
