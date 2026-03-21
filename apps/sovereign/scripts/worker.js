/* eslint-disable no-console */
const { PrismaClient } = require("@prisma/client");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const {
  summarizeToolCallProtocolEnvelope,
  validateToolCallProtocolEnvelope
} = require("./lib/tool-call-protocol");
const {
  buildToolCallActionFingerprint,
  verifyToolCallApprovalToken
} = require("./lib/tool-call-approval");
const {
  evaluateToolCommandPolicy,
  summarizeToolCommandPolicyEvaluation
} = require("./lib/tool-command-policy");
const {
  ToolFilesystemError,
  executeFilesystemToolCall,
  resolveFilesystemToolContext
} = require("./lib/tool-filesystem");
const {
  ToolGitError,
  executeGitToolCall,
  resolveGitToolContext
} = require("./lib/tool-git");
const {
  ToolShellError,
  executeShellToolCall,
  resolveShellToolContext
} = require("./lib/tool-shell");
const { executeBacklogToolCall } = require("./lib/tool-backlog");
const { executeMemoryToolCall } = require("./lib/tool-memory");
const {
  applyOutputDlp,
  resolveDlpMode
} = require("./lib/output-dlp");
const {
  readTaskProvenance,
  withProvenanceMetadata,
  mergeProvenanceResultMeta
} = require("./lib/task-provenance");
const {
  evaluateNbaOrchestrationPolicy,
  normalizeNbaApproval,
  buildNbaRoutingMetadata
} = require("./lib/omnichannel-routing");
const { parseAgentHandoffs } = require("./lib/agent-handoff-router");
const {
  strictConfigFromEnv,
  roleForAgent,
  enforceStrictOrchestration,
  evaluateExecutionRolePolicy
} = require("./lib/strict-orchestration");
const {
  resolveTaskMemoryConfig,
  buildTaskMemoryRequest,
  evaluateTaskMemoryPolicy,
  buildTaskMemoryAuditMetadata,
  buildTaskMemoryIndexRows,
  buildProjectMemoryIndexRows,
  retrieveTaskMemorySnippets,
  buildTaskMemoryPromptBlock
} = require("./lib/task-memory");
const {
  buildPolicyReplayRequest,
  runPolicyReplaySimulation,
  buildPolicyReplayResultSummary,
  formatPolicyReplayReport
} = require("./lib/policy-replay");
const {
  DEFAULT_LOCAL_MODEL_FALLBACK_CANDIDATES,
  listInstalledLocalModels: listInstalledLocalModelsFromProvider,
  resolveInstalledLocalModel: resolveInstalledLocalModelShared
} = require("./lib/local-runtime");

const prisma = new PrismaClient();

function argValue(prefix) {
  const found = process.argv.find((a) => a.startsWith(`${prefix}=`));
  if (!found) return null;
  return found.slice(prefix.length + 1);
}

function envPreferSovereign(sovereignKey, legacyKey, fallback = undefined) {
  const s = process.env[sovereignKey];
  if (s !== undefined && String(s).length > 0) return s;
  const l = process.env[legacyKey];
  if (l !== undefined && String(l).length > 0) return l;
  return fallback;
}

function envBoolTrue(sovereignKey, legacyKey) {
  return (
    process.env[sovereignKey] === "true" || process.env[legacyKey] === "true"
  );
}

function resolveProductSettingsPath() {
  const root = path.join(__dirname, "..");
  const next = path.join(root, ".sovereign", "settings.json");
  const legacy = path.join(root, ".sentinelsquad", "settings.json");
  try {
    if (fs.existsSync(next)) return next;
    if (fs.existsSync(legacy)) return legacy;
  } catch {
    // ignore
  }
  return next;
}

const RAW_AGENT_KEY =
  argValue("--agent") ||
  envPreferSovereign(
    "SOVEREIGN_WORKER_AGENT_KEY",
    "SENTINELSQUAD_WORKER_AGENT_KEY"
  ) ||
  null;
const POLL_MS = Number(
  envPreferSovereign(
    "SOVEREIGN_WORKER_POLL_MS",
    "SENTINELSQUAD_WORKER_POLL_MS",
    "1200"
  )
);
const WORKER_MODEL = envPreferSovereign(
  "SOVEREIGN_WORKER_MODEL",
  "SENTINELSQUAD_WORKER_MODEL",
  null
);
const WORKER_HOST =
  envPreferSovereign("SOVEREIGN_WORKER_HOST", "SENTINELSQUAD_WORKER_HOST") ||
  os.hostname();
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434";
const SOVEREIGN_EMBEDDING_MODEL =
  process.env.SOVEREIGN_EMBEDDING_MODEL || "nomic-embed-text";
const SOVEREIGN_EMBEDDING_DIMS = 768;
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "deepseek-r1:1.5b";
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || null;
const GITHUB_TOKEN =
  envPreferSovereign("SOVEREIGN_GITHUB_TOKEN", "SENTINELSQUAD_GITHUB_TOKEN") ||
  process.env.GITHUB_TOKEN ||
  process.env.MVP_PROJECT_TOKEN ||
  null;
const GITHUB_BOARD_ENABLED = envBoolTrue(
  "SOVEREIGN_ENABLE_GITHUB_BOARD",
  "SENTINELSQUAD_ENABLE_GITHUB_BOARD"
);
const GITHUB_PROJECT_OWNER =
  envPreferSovereign(
    "SOVEREIGN_GITHUB_PROJECT_OWNER",
    "SENTINELSQUAD_GITHUB_PROJECT_OWNER",
    "moldovancsaba"
  );
const GITHUB_REPO_OWNER =
  envPreferSovereign(
    "SOVEREIGN_GITHUB_REPO_OWNER",
    "SENTINELSQUAD_GITHUB_REPO_OWNER",
    "moldovancsaba"
  );
const GITHUB_REPO_NAME =
  envPreferSovereign(
    "SOVEREIGN_GITHUB_REPO_NAME",
    "SENTINELSQUAD_GITHUB_REPO_NAME",
    "sovereign"
  );
const GITHUB_PROJECT_NUMBER = Number(
  envPreferSovereign(
    "SOVEREIGN_GITHUB_PROJECT_NUMBER",
    "SENTINELSQUAD_GITHUB_PROJECT_NUMBER",
    "1"
  )
);
const SETTINGS_FILE = resolveProductSettingsPath();
const LOCAL_MODEL_RESOLUTION_CACHE_TTL_MS = 15000;
const LOCAL_MODEL_FALLBACK_CANDIDATES = DEFAULT_LOCAL_MODEL_FALLBACK_CANDIDATES.filter(
  (model) => String(model || "").trim().toLowerCase() !== "granite-4.0-h-1b"
);

let cachedProjectMeta = null;
const cachedIssueBoardStatus = new Map();
const localModelCatalogCache = new Map();
let WORKER_AGENT_KEY = RAW_AGENT_KEY;
let WORKER_CONTROL_ROLE = null;
let CLAIM_ALL_TASKS = false;
const NOT_READY_REASON =
  "Agent readiness is NOT_READY. Complete the readiness checklist and switch the agent to READY.";
const PAUSED_REASON =
  "Agent readiness is PAUSED. Task is queued and will execute after switching back to READY.";
const DEFAULT_MAX_ATTEMPTS = Number(
  envPreferSovereign(
    "SOVEREIGN_TASK_MAX_ATTEMPTS",
    "SENTINELSQUAD_TASK_MAX_ATTEMPTS",
    "3"
  )
);
const RETRY_BASE_MS = Number(
  envPreferSovereign(
    "SOVEREIGN_TASK_RETRY_BASE_MS",
    "SENTINELSQUAD_TASK_RETRY_BASE_MS",
    "5000"
  )
);
const RETRY_MAX_MS = Number(
  envPreferSovereign(
    "SOVEREIGN_TASK_RETRY_MAX_MS",
    "SENTINELSQUAD_TASK_RETRY_MAX_MS",
    "300000"
  )
);
const RETRY_JITTER_MS = Number(
  envPreferSovereign(
    "SOVEREIGN_TASK_RETRY_JITTER_MS",
    "SENTINELSQUAD_TASK_RETRY_JITTER_MS",
    "750"
  )
);
const REQUEST_TIMEOUT_MS = Number(
  envPreferSovereign(
    "SOVEREIGN_WORKER_REQUEST_TIMEOUT_MS",
    "SENTINELSQUAD_WORKER_REQUEST_TIMEOUT_MS",
    "60000"
  )
);
const SHELL_STREAM_FLUSH_CHARS = clampInt(
  envPreferSovereign(
    "SOVEREIGN_SHELL_STREAM_FLUSH_CHARS",
    "SENTINELSQUAD_SHELL_STREAM_FLUSH_CHARS",
    "1200"
  ),
  1200,
  200,
  4000
);
const SHELL_STREAM_MESSAGE_MAX_CHARS = clampInt(
  envPreferSovereign(
    "SOVEREIGN_SHELL_STREAM_MESSAGE_MAX_CHARS",
    "SENTINELSQUAD_SHELL_STREAM_MESSAGE_MAX_CHARS",
    "1600"
  ),
  1600,
  200,
  6000
);
const SHELL_ARTIFACT_SNIPPET_MAX_CHARS = clampInt(
  envPreferSovereign(
    "SOVEREIGN_SHELL_ARTIFACT_SNIPPET_MAX_CHARS",
    "SENTINELSQUAD_SHELL_ARTIFACT_SNIPPET_MAX_CHARS",
    "4000"
  ),
  4000,
  500,
  24000
);
const ISSUE_EVIDENCE_MAX_ATTEMPTS = clampInt(
  envPreferSovereign(
    "SOVEREIGN_ISSUE_EVIDENCE_MAX_ATTEMPTS",
    "SENTINELSQUAD_ISSUE_EVIDENCE_MAX_ATTEMPTS",
    "3"
  ),
  3,
  1,
  6
);
const ISSUE_EVIDENCE_RETRY_BASE_MS = clampInt(
  envPreferSovereign(
    "SOVEREIGN_ISSUE_EVIDENCE_RETRY_BASE_MS",
    "SENTINELSQUAD_ISSUE_EVIDENCE_RETRY_BASE_MS",
    "1000"
  ),
  1000,
  250,
  60_000
);
const ISSUE_EVIDENCE_RETRY_MAX_MS = clampInt(
  envPreferSovereign(
    "SOVEREIGN_ISSUE_EVIDENCE_RETRY_MAX_MS",
    "SENTINELSQUAD_ISSUE_EVIDENCE_RETRY_MAX_MS",
    "15000"
  ),
  15_000,
  ISSUE_EVIDENCE_RETRY_BASE_MS,
  300_000
);
const OUTPUT_DLP_MODE = resolveDlpMode(
  envPreferSovereign("SOVEREIGN_DLP_MODE", "SENTINELSQUAD_DLP_MODE")
);
const ORCHESTRATOR_LEASE_ID =
  envPreferSovereign(
    "SOVEREIGN_ORCHESTRATOR_LEASE_ID",
    "SENTINELSQUAD_ORCHESTRATOR_LEASE_ID",
    "sovereign-primary-orchestrator"
  );
const ORCHESTRATOR_LEASE_TTL_MS = clampInt(
  envPreferSovereign(
    "SOVEREIGN_ORCHESTRATOR_LEASE_TTL_MS",
    "SENTINELSQUAD_ORCHESTRATOR_LEASE_TTL_MS",
    "20000"
  ),
  20_000,
  5_000,
  300_000
);
const ORCHESTRATOR_STALE_RUNNING_MS = clampInt(
  envPreferSovereign(
    "SOVEREIGN_ORCHESTRATOR_STALE_RUNNING_MS",
    "SENTINELSQUAD_ORCHESTRATOR_STALE_RUNNING_MS",
    String(Math.max(ORCHESTRATOR_LEASE_TTL_MS * 2, 30_000))
  ),
  Math.max(ORCHESTRATOR_LEASE_TTL_MS * 2, 30_000),
  ORCHESTRATOR_LEASE_TTL_MS,
  3_600_000
);
const HANDOFF_INFERRED_MAX = clampInt(
  envPreferSovereign(
    "SOVEREIGN_HANDOFF_INFERRED_MAX",
    "SENTINELSQUAD_HANDOFF_INFERRED_MAX",
    "3"
  ),
  3,
  1,
  10
);
const STRICT_ORCHESTRATION = strictConfigFromEnv();
const DRIFT_STATUS_CACHE_TTL_MS = clampInt(
  envPreferSovereign(
    "SOVEREIGN_DRIFT_STATUS_CACHE_TTL_MS",
    "SENTINELSQUAD_DRIFT_STATUS_CACHE_TTL_MS",
    "15000"
  ),
  15_000,
  1_000,
  300_000
);
const ALLOWED_RUNNING_BOARD_STATUSES = new Set(["in progress", "ready"]);
const ORCHESTRATOR_OWNER_ID = [
  WORKER_HOST,
  process.pid,
  RAW_AGENT_KEY || "ANY",
  Date.now().toString(36)
].join(":");

class WorkerTaskError extends Error {
  constructor(code, message, retryable) {
    super(message);
    this.name = "WorkerTaskError";
    this.code = code;
    this.retryable = Boolean(retryable);
  }
}

function clampInt(input, fallback, min, max) {
  const n = Number(input);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(Math.trunc(n), min), max);
}

function normalizeTaskLimits(task) {
  const maxAttempts = clampInt(task?.maxAttempts, clampInt(DEFAULT_MAX_ATTEMPTS, 3, 1, 10), 1, 10);
  const attemptCount = clampInt(task?.attemptCount, 0, 0, 1000);
  return { maxAttempts, attemptCount };
}

function computeRetryDelayMs(attemptCount) {
  const step = Math.max(attemptCount, 1) - 1;
  const base = clampInt(RETRY_BASE_MS, 5000, 250, 60_000);
  const max = clampInt(RETRY_MAX_MS, 300000, base, 3_600_000);
  const jitter = clampInt(RETRY_JITTER_MS, 750, 0, 10_000);
  const raw = Math.min(base * 2 ** step, max);
  const variance = jitter ? Math.floor(Math.random() * (jitter + 1)) : 0;
  return Math.min(raw + variance, max);
}

function formatFailureMessage(failure) {
  return `[${failure.code}] ${failure.message}`;
}

function failureMeta(failure, attemptCount, maxAttempts) {
  return {
    code: failure.code,
    retryable: failure.retryable,
    attemptCount,
    maxAttempts
  };
}

function normalizeLower(v) {
  return String(v || "").trim().toLowerCase();
}

function asRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value;
}

function normalizeText(value) {
  return String(value || "").trim();
}

async function captureProjectMemoryRecord(params, tx) {
  const projectSessionId = normalizeText(params?.projectSessionId);
  const answer = normalizeText(params?.answer);
  if (!projectSessionId || !answer) return null;

  const summary = answer.replace(/\s+/g, " ").trim().slice(0, 240);
  const content = answer.replace(/\s+/g, " ").trim().slice(0, 4000);
  const tags = Array.from(
    new Set(
      [
        normalizeText(params?.agentKey),
        normalizeText(params?.model),
        ...((normalizeText(params?.title).toLowerCase().match(/[a-z0-9_]+/g) || []).slice(0, 12))
      ].filter(Boolean)
    )
  ).slice(0, 16);

  return tx.projectMemory.create({
    data: {
      projectSessionId,
      threadId: normalizeText(params?.threadId) || null,
      taskId: normalizeText(params?.taskId) || null,
      sourceMessageId: normalizeText(params?.sourceMessageId) || null,
      title: normalizeText(params?.title) || "Untitled task result",
      summary,
      content,
      tags,
      status: "CAPTURED",
      kind: "AGENT",
      sourceKind: "task_result",
      sourceAgentKey: normalizeText(params?.agentKey) || null
    }
  });
}

async function maybeEmbedProjectMemory(memoryId, text) {
  if (process.env.SOVEREIGN_MEMORY_EMBED_ON_CAPTURE !== "1") return;
  const trimmed = String(text || "").trim().slice(0, 8000);
  if (!trimmed || !memoryId) return;
  try {
    const base = String(OLLAMA_BASE_URL || "").replace(/\/$/, "");
    const res = await fetch(`${base}/api/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: SOVEREIGN_EMBEDDING_MODEL, prompt: trimmed })
    });
    if (!res.ok) return;
    const body = await res.json();
    const embedding = Array.isArray(body.embedding) ? body.embedding : [];
    if (embedding.length !== SOVEREIGN_EMBEDDING_DIMS) return;
    const vec = `[${embedding.map((n) => Number(n).toFixed(8)).join(",")}]`;
    await prisma.$executeRawUnsafe(
      `UPDATE "ProjectMemory" SET embedding = $1::vector, "embeddingModel" = $2, "embeddingDimensions" = $3, "updatedAt" = NOW() WHERE id = $4`,
      vec,
      SOVEREIGN_EMBEDDING_MODEL,
      SOVEREIGN_EMBEDDING_DIMS,
      memoryId
    );
  } catch {
    // best-effort; pgvector or Ollama may be unavailable
  }
}

function redactSensitiveOutput(text, channel = "generic") {
  const dlp = applyOutputDlp(text, {
    mode: OUTPUT_DLP_MODE,
    channel
  });
  return {
    text: dlp.text,
    redacted: dlp.redacted,
    blocked: dlp.blocked,
    dlp
  };
}

function appendBoundedText(current, incoming, limit) {
  const base = String(current || "");
  const addition = String(incoming || "");
  if (!addition) return { text: base, truncated: false };
  if (base.length >= limit) return { text: base, truncated: true };
  const next = `${base}${addition}`;
  if (next.length <= limit) return { text: next, truncated: false };
  const clipped = next.slice(0, limit);
  return {
    text: `${clipped}\n[TRUNCATED]`,
    truncated: true
  };
}

function sanitizeShellMetadata(metadata) {
  const record = asRecord(metadata);
  if (!record) return null;
  const out = { ...record };
  if (typeof out.command === "string") {
    out.command = redactSensitiveOutput(out.command, "shell_metadata").text;
  }
  if (typeof out.stdoutPreview === "string") {
    out.stdoutPreview = redactSensitiveOutput(out.stdoutPreview, "shell_metadata").text;
  }
  if (typeof out.stderrPreview === "string") {
    out.stderrPreview = redactSensitiveOutput(out.stderrPreview, "shell_metadata").text;
  }
  return out;
}

function readTaskToolCallApprovalToken(payload) {
  const payloadRecord = asRecord(payload);
  return normalizeText(payloadRecord?.toolCallApprovalToken) || null;
}

function readTaskToolCallPolicy(payload) {
  const payloadRecord = asRecord(payload);
  const policy = asRecord(payloadRecord?.toolCallPolicy);
  return {
    dryRun: Boolean(policy?.dryRun)
  };
}

function readTaskRuntimeConfigResolution(payload) {
  const payloadRecord = asRecord(payload);
  const resolution = asRecord(payloadRecord?.runtimeConfigResolution);
  if (!resolution) return null;

  const effective = asRecord(resolution.effective);
  if (!effective) return null;

  const runtime = normalizeText(effective.runtime).toUpperCase();
  if (runtime !== "LOCAL" && runtime !== "CLOUD") return null;

  const endpoint = normalizeText(effective.endpoint);
  const model = normalizeText(effective.model);
  const apiKeyEnv = normalizeText(effective.apiKeyEnv) || null;
  const requestTimeoutMs = clampInt(
    effective.requestTimeoutMs,
    clampInt(REQUEST_TIMEOUT_MS, 60000, 1000, 300000),
    1000,
    300000
  );

  return {
    digest: normalizeText(resolution.digest) || null,
    projectKey: normalizeText(resolution.projectKey) || null,
    projectName: normalizeText(resolution.projectName) || null,
    activeContextWindowId: normalizeText(resolution.activeContextWindowId) || null,
    activeContextOwnerAgentKey: normalizeText(resolution.activeContextOwnerAgentKey) || null,
    sourceChain: Array.isArray(resolution.sourceChain) ? resolution.sourceChain : [],
    effective: {
      runtime,
      endpoint,
      model,
      apiKeyEnv,
      requestTimeoutMs
    }
  };
}

function readTaskNbaApproval(payload) {
  const payloadRecord = asRecord(payload);
  return normalizeNbaApproval(payloadRecord?.nbaApproval);
}

function evaluateOrchestratorTaskTransition(action, fromState, toState) {
  if (action === "ROUTE_HANDOFF_TASK") {
    if (fromState !== null) {
      return { allowed: false, reason: "Handoff task creation requires fromState=null." };
    }
    if (toState === "QUEUED" || toState === "MANUAL_REQUIRED") {
      return { allowed: true, reason: "Orchestrator handoff creation transition allowed." };
    }
    return {
      allowed: false,
      reason: "Handoff task creation can only target QUEUED or MANUAL_REQUIRED."
    };
  }
  if (action === "CLAIM_TASK") {
    return fromState === "QUEUED" && toState === "RUNNING"
      ? { allowed: true, reason: "Orchestrator claim transition allowed." }
      : { allowed: false, reason: "Claim transition requires QUEUED -> RUNNING." };
  }
  if (action === "COMPLETE_TASK") {
    return fromState === "RUNNING" && toState === "DONE"
      ? { allowed: true, reason: "Orchestrator completion transition allowed." }
      : { allowed: false, reason: "Completion transition requires RUNNING -> DONE." };
  }
  if (action === "CANCEL_TASK") {
    if (fromState === "RUNNING" && toState === "CANCELED") {
      return { allowed: true, reason: "Orchestrator cancel transition allowed." };
    }
    if (fromState === "CANCELED" && toState === "CANCELED") {
      return { allowed: true, reason: "Orchestrator cancel idempotent transition allowed." };
    }
    return { allowed: false, reason: "Cancel transition requires RUNNING -> CANCELED." };
  }
  if (action === "RETRY_TASK") {
    return fromState === "RUNNING" && toState === "QUEUED"
      ? { allowed: true, reason: "Orchestrator retry transition allowed." }
      : { allowed: false, reason: "Retry transition requires RUNNING -> QUEUED." };
  }
  if (action === "DEAD_LETTER_TASK") {
    return fromState === "RUNNING" && toState === "DEAD_LETTER"
      ? { allowed: true, reason: "Orchestrator dead-letter transition allowed." }
      : {
          allowed: false,
          reason: "Dead-letter transition requires RUNNING -> DEAD_LETTER."
        };
  }
  if (action === "RECOVER_STALE_RUNNING") {
    return fromState === "RUNNING" && toState === "QUEUED"
      ? { allowed: true, reason: "Stale-running recovery transition allowed." }
      : {
          allowed: false,
          reason: "Stale-running recovery requires RUNNING -> QUEUED."
        };
  }
  if (action === "BLOCK_TASK_ON_DRIFT") {
    return fromState === "RUNNING" && toState === "MANUAL_REQUIRED"
      ? { allowed: true, reason: "Board/runtime drift block transition allowed." }
      : {
          allowed: false,
          reason: "Drift block transition requires RUNNING -> MANUAL_REQUIRED."
        };
  }
  return { allowed: false, reason: `Unsupported orchestrator task action: ${action}.` };
}

async function recordLifecycleAudit(entry, db = prisma) {
  await db.lifecycleAuditEvent.create({
    data: {
      entityType: entry.entityType,
      entityId: entry.entityId || null,
      actorRole: entry.actorRole,
      action: entry.action,
      fromState: entry.fromState || null,
      toState: entry.toState || null,
      allowed: Boolean(entry.allowed),
      reason: entry.reason,
      metadata: entry.metadata || undefined
    }
  });
}

async function verifyAndConsumeToolCallApproval(params) {
  const { task, envelope, policyEvaluation, payload } = params;
  const provenance = readTaskProvenance(payload, task);
  if (!policyEvaluation.requiresApproval) {
    return null;
  }

  const actionFingerprint = buildToolCallActionFingerprint(envelope);
  const approvalToken = readTaskToolCallApprovalToken(payload);
  if (!approvalToken) {
    const reason =
      policyEvaluation.approvalReason ||
      "Tool command policy requires explicit approval token before execution.";
    await recordLifecycleAudit({
      entityType: "TASK",
      entityId: task.id,
      actorRole: "ORCHESTRATOR",
      action: "TOOL_CALL_APPROVAL_VERIFY",
      fromState: task.status,
      toState: task.status,
      allowed: false,
      reason,
      metadata: {
        code: "TOKEN_MISSING",
        actionFingerprint,
        ...withProvenanceMetadata(provenance)
      }
    });
    throw new WorkerTaskError("TOOL_CALL_APPROVAL_REQUIRED", reason, false);
  }

  const verification = verifyToolCallApprovalToken({
    token: approvalToken,
    expectedActionFingerprint: actionFingerprint
  });
  if (!verification.ok) {
    await recordLifecycleAudit({
      entityType: "TASK",
      entityId: task.id,
      actorRole: "ORCHESTRATOR",
      action: "TOOL_CALL_APPROVAL_VERIFY",
      fromState: task.status,
      toState: task.status,
      allowed: false,
      reason: verification.reason,
      metadata: {
        code: verification.code,
        tokenId: verification.tokenId,
        actionFingerprint,
        ...withProvenanceMetadata(provenance)
      }
    });
    if (verification.tokenId) {
      await recordLifecycleAudit({
        entityType: "TOOL_APPROVAL_TOKEN",
        entityId: verification.tokenId,
        actorRole: "ORCHESTRATOR",
        action: "CONSUME_APPROVAL_TOKEN",
        fromState: null,
        toState: null,
        allowed: false,
        reason: verification.reason,
        metadata: {
          code: verification.code,
          taskId: task.id,
          actionFingerprint,
          ...withProvenanceMetadata(provenance)
        }
      });
    }
    throw new WorkerTaskError("TOOL_CALL_APPROVAL_INVALID", verification.reason, false);
  }

  const priorUse = await prisma.lifecycleAuditEvent.findFirst({
    where: {
      entityType: "TOOL_APPROVAL_TOKEN",
      entityId: verification.payload.tokenId,
      action: "CONSUME_APPROVAL_TOKEN",
      allowed: true
    },
    select: { id: true }
  });
  if (priorUse) {
    const reason = "Approval token replay rejected: token was already consumed.";
    await recordLifecycleAudit({
      entityType: "TASK",
      entityId: task.id,
      actorRole: "ORCHESTRATOR",
      action: "TOOL_CALL_APPROVAL_VERIFY",
      fromState: task.status,
      toState: task.status,
      allowed: false,
      reason,
      metadata: {
        code: "TOKEN_REPLAY",
        tokenId: verification.payload.tokenId,
        actionFingerprint,
        ...withProvenanceMetadata(provenance)
      }
    });
    await recordLifecycleAudit({
      entityType: "TOOL_APPROVAL_TOKEN",
      entityId: verification.payload.tokenId,
      actorRole: "ORCHESTRATOR",
      action: "CONSUME_APPROVAL_TOKEN",
      fromState: null,
      toState: null,
      allowed: false,
      reason,
      metadata: {
        code: "TOKEN_REPLAY",
        taskId: task.id,
        actionFingerprint,
        ...withProvenanceMetadata(provenance)
      }
    });
    throw new WorkerTaskError("TOOL_CALL_APPROVAL_REPLAY", reason, false);
  }

  await recordLifecycleAudit({
    entityType: "TOOL_APPROVAL_TOKEN",
    entityId: verification.payload.tokenId,
    actorRole: "ORCHESTRATOR",
    action: "CONSUME_APPROVAL_TOKEN",
    fromState: null,
    toState: "CONSUMED",
    allowed: true,
    reason: "Approval token consumed for tool-call execution.",
    metadata: {
      taskId: task.id,
      actionFingerprint,
      approverUserId: verification.payload.approverUserId,
      approverEmail: verification.payload.approverEmail,
      issuedAt: verification.payload.issuedAt || null,
      expiresAt: verification.payload.expiresAt,
      ...withProvenanceMetadata(provenance)
    }
  });

  await recordLifecycleAudit({
    entityType: "TASK",
    entityId: task.id,
    actorRole: "ORCHESTRATOR",
    action: "TOOL_CALL_APPROVAL_VERIFY",
    fromState: task.status,
    toState: task.status,
    allowed: true,
    reason: "Tool-call approval token verified and consumed.",
    metadata: {
      tokenId: verification.payload.tokenId,
      approverUserId: verification.payload.approverUserId,
      approverEmail: verification.payload.approverEmail,
      actionFingerprint,
      issuedAt: verification.payload.issuedAt || null,
      expiresAt: verification.payload.expiresAt,
      ...withProvenanceMetadata(provenance)
    }
  });

  if (provenance.chainId) {
    await recordLifecycleAudit({
      entityType: "TASK_PROVENANCE",
      entityId: provenance.chainId,
      actorRole: "ORCHESTRATOR",
      action: "BIND_APPROVER_TO_CHAIN",
      fromState: task.status,
      toState: task.status,
      allowed: true,
      reason: "Approver identity bound to provenance chain.",
      metadata: withProvenanceMetadata(provenance, {
        tokenId: verification.payload.tokenId,
        approverUserId: verification.payload.approverUserId,
        approverEmail: verification.payload.approverEmail,
        issuedAt: verification.payload.issuedAt || null,
        actionFingerprint
      })
    });
  }

  return verification.payload;
}

function failurePolicy(className) {
  if (className === "STALE_RUNNING_DETECTED") {
    return {
      severity: "MEDIUM",
      fallbackAction: "REQUEUE",
      remediation:
        "Inspect stale-running owner context and verify orchestrator lease recovery before further retries."
    };
  }
  if (className === "EXECUTION_RETRY_EXHAUSTED") {
    return {
      severity: "HIGH",
      fallbackAction: "DEAD_LETTER",
      remediation:
        "Review dead-letter diagnostics and route to manual-required remediation if autonomous retry is exhausted."
    };
  }
  return {
    severity: "LOW",
    fallbackAction: "ALERT_ONLY",
    remediation: "Review fallback diagnostics."
  };
}

async function recordAlphaFailureEvent(entry, db = prisma) {
  const policy = failurePolicy(entry.failureClass);
  await db.alphaFailureEvent.create({
    data: {
      failureClass: entry.failureClass,
      severity: policy.severity,
      fallbackAction: policy.fallbackAction,
      projectKey: entry.projectKey || null,
      projectName: entry.projectName || null,
      issueNumber: entry.issueNumber ?? null,
      taskId: entry.taskId || null,
      threadId: entry.threadId || null,
      leaseHealth: entry.leaseHealth || null,
      contextWindowId: entry.contextWindowId || null,
      remediation: policy.remediation,
      metadata: entry.metadata || undefined
    }
  });
}

function isoOrNull(value) {
  if (!(value instanceof Date)) return null;
  return value.toISOString();
}

let leaseHeld = false;
let isShuttingDown = false;
let lastLeaseConflictKey = null;
let lastLeaseConflictAt = 0;

function readAgentSetting(agentKey) {
  try {
    const raw = fs.readFileSync(SETTINGS_FILE, "utf8");
    const parsed = JSON.parse(raw);
    const all = Array.isArray(parsed?.agents) ? parsed.agents : [];
    const wanted = normalizeLower(agentKey);
    const row = all.find(
      (r) =>
        r &&
        typeof r === "object" &&
        typeof r.agentName === "string" &&
        normalizeLower(r.agentName) === wanted
    );
    if (!row) return null;
    return {
      agentUrl: typeof row.agentUrl === "string" ? row.agentUrl.trim() : "",
      agentModel: typeof row.agentModel === "string" ? row.agentModel.trim() : "",
      agentApiKeyEnv:
        typeof row.agentApiKeyEnv === "string" ? row.agentApiKeyEnv.trim() : ""
    };
  } catch {
    return null;
  }
}

function readProductSettingsFile() {
  try {
    const raw = fs.readFileSync(SETTINGS_FILE, "utf8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function readCommandAccessEntries() {
  const parsed = readProductSettingsFile();
  const rows = Array.isArray(parsed?.commandAccess) ? parsed.commandAccess : [];
  return rows
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const command = normalizeText(row.command).toLowerCase();
      if (!command) return null;
      return {
        command,
        status: normalizeText(row.status).toUpperCase() === "APPROVED" ? "APPROVED" : "DECLINED"
      };
    })
    .filter(Boolean);
}

function readShellAccessSettings() {
  const parsed = readProductSettingsFile();
  const shellAccess =
    parsed && typeof parsed.shellAccess === "object" && !Array.isArray(parsed.shellAccess)
      ? parsed.shellAccess
      : {};
  return {
    inheritFullProcessEnv: shellAccess.inheritFullProcessEnv !== false,
    defaultCwd: normalizeText(shellAccess.defaultCwd) || process.cwd()
  };
}

function readEnvVar(name) {
  if (!name) return "";
  return String(process.env[name] || "").trim();
}

async function listInstalledLocalModels(endpoint, timeoutMs) {
  const cacheKey = String(endpoint || OLLAMA_BASE_URL);
  const now = Date.now();
  const cached = localModelCatalogCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.models;
  }
  const models = await listInstalledLocalModelsShared(cacheKey, timeoutMs, cached);
  localModelCatalogCache.set(cacheKey, {
    models,
    expiresAt: now + LOCAL_MODEL_RESOLUTION_CACHE_TTL_MS
  });
  return models;
}

async function listInstalledLocalModelsShared(endpoint, timeoutMs, cached) {
  const models = await listInstalledLocalModelsFromProvider({
    endpoint,
    timeoutMs: Math.min(timeoutMs || REQUEST_TIMEOUT_MS, 15000),
    cacheTtlMs: LOCAL_MODEL_RESOLUTION_CACHE_TTL_MS
  });
  if (!models.length && cached?.models?.length) {
    return cached.models;
  }
  return models;
}

async function resolveInstalledLocalModel(endpoint, requestedModel, timeoutMs) {
  const installedModels = await listInstalledLocalModels(endpoint, timeoutMs);
  if (installedModels.length === 0) return requestedModel;
  return resolveInstalledLocalModelShared({
    endpoint,
    requestedModel,
    timeoutMs: Math.min(timeoutMs || REQUEST_TIMEOUT_MS, 15000),
    fallbackCandidates: LOCAL_MODEL_FALLBACK_CANDIDATES
  });
}

function resolveAgentExecutionConfig(agent, runtimeResolution = null) {
  if (!agent || !agent.key) {
    throw new Error("Missing agent record.");
  }
  const setting = readAgentSetting(agent.key);
  const displayName = agent.displayName || agent.key;
  const resolutionEffective = runtimeResolution?.effective || null;
  const runtimeMatches = resolutionEffective?.runtime === agent.runtime;
  const timeoutOverride = runtimeMatches ? resolutionEffective.requestTimeoutMs : null;

  if (agent.runtime === "LOCAL") {
    const resolved = {
      runtime: "LOCAL",
      provider: "ollama",
      displayName,
      endpoint: setting?.agentUrl || OLLAMA_BASE_URL,
      model: setting?.agentModel || agent.model || WORKER_MODEL || OLLAMA_MODEL,
      apiKey: null,
      apiKeyEnv: "",
      requestTimeoutMs: clampInt(timeoutOverride ?? REQUEST_TIMEOUT_MS, 60000, 1000, 300000),
      runtimeConfigDigest: runtimeResolution?.digest || null,
      runtimeConfigSourceChain: runtimeResolution?.sourceChain || []
    };
    if (runtimeMatches) {
      if (resolutionEffective.endpoint) resolved.endpoint = resolutionEffective.endpoint;
      if (resolutionEffective.model) resolved.model = resolutionEffective.model;
    }
    return resolved;
  }

  if (agent.runtime === "CLOUD") {
    const apiKeyEnv =
      (runtimeMatches && resolutionEffective.apiKeyEnv) ||
      setting?.agentApiKeyEnv ||
      "OPENAI_API_KEY";
    const apiKey = readEnvVar(apiKeyEnv) || OPENAI_API_KEY || "";
    const resolved = {
      runtime: "CLOUD",
      provider: "openai",
      displayName,
      endpoint: setting?.agentUrl || OPENAI_BASE_URL,
      model: setting?.agentModel || agent.model || OPENAI_MODEL,
      apiKey,
      apiKeyEnv,
      requestTimeoutMs: clampInt(timeoutOverride ?? REQUEST_TIMEOUT_MS, 60000, 1000, 300000),
      runtimeConfigDigest: runtimeResolution?.digest || null,
      runtimeConfigSourceChain: runtimeResolution?.sourceChain || []
    };
    if (runtimeMatches) {
      if (resolutionEffective.endpoint) resolved.endpoint = resolutionEffective.endpoint;
      if (resolutionEffective.model) resolved.model = resolutionEffective.model;
    }
    return resolved;
  }

  throw new Error(
    `Unsupported runtime "${agent.runtime}" for @${agent.key}. Set runtime to LOCAL or CLOUD.`
  );
}

async function resolveCanonicalAgentKey(rawAgentKey) {
  if (!rawAgentKey) return null;
  const existing = await prisma.agent.findFirst({
    where: { key: { equals: rawAgentKey, mode: "insensitive" } },
    select: { key: true }
  });
  if (!existing?.key) {
    throw new Error(
      `Worker agent "${rawAgentKey}" is not registered. Create it on /agents first.`
    );
  }
  return existing.key;
}

async function heartbeat(agentKey, leaseMeta = {}) {
  if (!agentKey) return;
  const existing = await prisma.agent.findFirst({
    where: { key: { equals: agentKey, mode: "insensitive" } },
    select: { key: true, displayName: true, runtime: true, model: true }
  });
  if (!existing?.key) {
    throw new Error(`Agent @${agentKey} is not registered.`);
  }
  const resolved = existing ? resolveAgentExecutionConfig(existing) : null;

  await prisma.agent.update({
    where: { key: existing.key },
    data: {
      model: resolved?.model || undefined,
      host: WORKER_HOST,
      lastHeartbeatAt: new Date(),
      lastHeartbeatMeta: { pid: process.pid, pollMs: POLL_MS, ...leaseMeta }
    }
  });

  return existing.key;
}

async function ensureLeaseRow(tx = prisma) {
  return tx.orchestratorLease.upsert({
    where: { id: ORCHESTRATOR_LEASE_ID },
    create: { id: ORCHESTRATOR_LEASE_ID },
    update: {}
  });
}

async function lockLeaseRow(tx) {
  await tx.$queryRaw`SELECT "id" FROM "OrchestratorLease" WHERE "id" = ${ORCHESTRATOR_LEASE_ID} FOR UPDATE`;
  return tx.orchestratorLease.findUnique({
    where: { id: ORCHESTRATOR_LEASE_ID }
  });
}

async function writeLeaseAudit(tx, entry) {
  await tx.orchestratorLeaseAudit.create({
    data: {
      leaseId: ORCHESTRATOR_LEASE_ID,
      code: entry.code,
      message: entry.message,
      ownerId: entry.ownerId || null,
      previousOwnerId: entry.previousOwnerId || null,
      metadata: entry.metadata || undefined
    }
  });
}

function describeLeaseState(lease) {
  if (!lease?.ownerId) return "no active owner";
  return `${lease.ownerId} (expires ${isoOrNull(lease.expiresAt) || "unknown"})`;
}

async function acquireOrRenewOrchestratorLease(reason) {
  return prisma.$transaction(async (tx) => {
    await ensureLeaseRow(tx);
    const lease = await lockLeaseRow(tx);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ORCHESTRATOR_LEASE_TTL_MS);

    const hasOwner = Boolean(lease?.ownerId);
    const sameOwner = lease?.ownerId === ORCHESTRATOR_OWNER_ID;
    const expired = !lease?.expiresAt || lease.expiresAt.getTime() <= now.getTime();

    if (!hasOwner || sameOwner || expired) {
      const previousOwnerId = lease?.ownerId || null;
      const reclaimed = Boolean(hasOwner && !sameOwner && expired);
      const code = reclaimed
        ? "LEASE_RECLAIM_STALE"
        : hasOwner
        ? "LEASE_RENEWED"
        : "LEASE_ACQUIRED";
      const message = reclaimed
        ? `Stale orchestrator lease reclaimed by ${ORCHESTRATOR_OWNER_ID}. Previous owner ${previousOwnerId} expired at ${isoOrNull(
            lease?.expiresAt
          )}.`
        : sameOwner
        ? `Orchestrator lease renewed by ${ORCHESTRATOR_OWNER_ID}.`
        : `Orchestrator lease acquired by ${ORCHESTRATOR_OWNER_ID}.`;

      const updated = await tx.orchestratorLease.update({
        where: { id: ORCHESTRATOR_LEASE_ID },
        data: {
          ownerId: ORCHESTRATOR_OWNER_ID,
          ownerHost: WORKER_HOST,
          ownerPid: process.pid,
          ownerAgentKey: WORKER_AGENT_KEY || null,
          acquiredAt: sameOwner ? lease?.acquiredAt || now : now,
          lastHeartbeatAt: now,
          expiresAt,
          heartbeatCount: sameOwner
            ? { increment: 1 }
            : 1
        }
      });

      if (code !== "LEASE_RENEWED") {
        await writeLeaseAudit(tx, {
          code,
          message,
          ownerId: ORCHESTRATOR_OWNER_ID,
          previousOwnerId,
          metadata: {
            reason,
            ownerAgentKey: WORKER_AGENT_KEY || null,
            ownerHost: WORKER_HOST,
            ownerPid: process.pid,
            expiresAt: updated.expiresAt.toISOString()
          }
        });
      }

      return {
        held: true,
        code,
        lease: updated,
        reason
      };
    }

    return {
      held: false,
      code: "LEASE_HELD_BY_ACTIVE_OWNER",
      lease,
      reason,
      message: `Competing orchestrator writer rejected: lease held by ${describeLeaseState(
        lease
      )}.`
    };
  });
}

async function releaseOrchestratorLease(reason) {
  return prisma.$transaction(async (tx) => {
    await ensureLeaseRow(tx);
    const lease = await lockLeaseRow(tx);
    const now = new Date();
    if (!lease || lease.ownerId !== ORCHESTRATOR_OWNER_ID) {
      return { released: false, lease };
    }
    const updated = await tx.orchestratorLease.update({
      where: { id: ORCHESTRATOR_LEASE_ID },
      data: {
        ownerId: null,
        ownerHost: null,
        ownerPid: null,
        ownerAgentKey: null,
        expiresAt: now,
        lastHeartbeatAt: now
      }
    });
    await writeLeaseAudit(tx, {
      code: "LEASE_RELEASED",
      message: `Orchestrator lease released by ${ORCHESTRATOR_OWNER_ID}.`,
      ownerId: ORCHESTRATOR_OWNER_ID,
      metadata: {
        reason,
        ownerHost: WORKER_HOST,
        ownerPid: process.pid
      }
    });
    return { released: true, lease: updated };
  });
}

async function withLeaseAuthority(operation, mutation) {
  return prisma.$transaction(async (tx) => {
    await ensureLeaseRow(tx);
    const lease = await lockLeaseRow(tx);
    const now = new Date();
    const active = Boolean(
      lease?.ownerId === ORCHESTRATOR_OWNER_ID &&
        lease?.expiresAt &&
        lease.expiresAt.getTime() > now.getTime()
    );
    if (!active) {
      const message = `Blocked task lifecycle write (${operation}): lease held by ${describeLeaseState(
        lease
      )}.`;
      await writeLeaseAudit(tx, {
        code: "LEASE_WRITE_REJECTED",
        message,
        ownerId: ORCHESTRATOR_OWNER_ID,
        previousOwnerId: lease?.ownerId || null,
        metadata: {
          operation,
          ownerHost: WORKER_HOST,
          ownerPid: process.pid
        }
      });
      throw new WorkerTaskError("LEASE_NOT_HELD", message, true);
    }
    return mutation(tx);
  });
}

async function maintainOrchestratorLease(reason) {
  const outcome = await acquireOrRenewOrchestratorLease(reason);
  if (outcome.held) {
    const becameHolder = !leaseHeld;
    leaseHeld = true;
    if (becameHolder || outcome.code !== "LEASE_RENEWED") {
      console.log(
        `[sovereign-worker] lease ${outcome.code.toLowerCase()} owner=${ORCHESTRATOR_OWNER_ID} ttlMs=${ORCHESTRATOR_LEASE_TTL_MS}`
      );
    }
    return true;
  }

  leaseHeld = false;
  const conflictKey = `${outcome?.lease?.ownerId || ""}:${isoOrNull(outcome?.lease?.expiresAt) || ""}`;
  const now = Date.now();
  if (
    conflictKey !== lastLeaseConflictKey ||
    now - lastLeaseConflictAt >= Math.max(POLL_MS * 5, 5000)
  ) {
    lastLeaseConflictKey = conflictKey;
    lastLeaseConflictAt = now;
    console.log(`[sovereign-worker] ${outcome.message}`);
  }
  return false;
}

async function recoverStaleRunningTasks() {
  const cutoff = new Date(Date.now() - ORCHESTRATOR_STALE_RUNNING_MS);
  const result = await withLeaseAuthority("recover-stale-running", async (tx) => {
    const decision = evaluateOrchestratorTaskTransition(
      "RECOVER_STALE_RUNNING",
      "RUNNING",
      "QUEUED"
    );
    if (!decision.allowed) {
      await recordLifecycleAudit(
        {
          entityType: "TASK",
          actorRole: "ORCHESTRATOR",
          action: "RECOVER_STALE_RUNNING",
          fromState: "RUNNING",
          toState: "QUEUED",
          allowed: false,
          reason: decision.reason
        },
        tx
      );
      throw new WorkerTaskError("TRANSITION_DENIED", decision.reason, false);
    }

    const updated = await tx.agentTask.updateMany({
      where: {
        status: "RUNNING",
        startedAt: { lt: cutoff }
      },
      data: {
        status: "QUEUED",
        startedAt: null,
        error:
          "Recovered by orchestrator after stale running timeout (previous owner lost lease).",
        nextAttemptAt: new Date()
      }
    });
    if (updated.count > 0) {
      await recordLifecycleAudit(
        {
          entityType: "TASK",
          actorRole: "ORCHESTRATOR",
          action: "RECOVER_STALE_RUNNING",
          fromState: "RUNNING",
          toState: "QUEUED",
          allowed: true,
          reason: decision.reason,
          metadata: {
            count: updated.count,
            cutoff: cutoff.toISOString()
          }
        },
        tx
      );
      await recordAlphaFailureEvent(
        {
          failureClass: "STALE_RUNNING_DETECTED",
          issueNumber: null,
          leaseHealth: "STALE",
          metadata: {
            count: updated.count,
            cutoff: cutoff.toISOString(),
            staleRunningMs: ORCHESTRATOR_STALE_RUNNING_MS
          }
        },
        tx
      );
      await writeLeaseAudit(tx, {
        code: "STALE_RUNNING_TASKS_RECOVERED",
        message: `Recovered ${updated.count} stale RUNNING task(s) back to QUEUED.`,
        ownerId: ORCHESTRATOR_OWNER_ID,
        metadata: {
          cutoff: cutoff.toISOString(),
          staleRunningMs: ORCHESTRATOR_STALE_RUNNING_MS
        }
      });
    }
    return updated.count;
  });
  return result;
}

async function claimNextTask(agentKey) {
  return withLeaseAuthority("claim-next-task", async (tx) => {
    const now = new Date();
    const where = {
      status: "QUEUED",
      nextAttemptAt: { lte: now },
      ...(agentKey ? { agentKey } : {}),
      agent: {
        is: {
          enabled: true,
          readiness: "READY",
          runtime: { in: ["LOCAL", "CLOUD"] }
        }
      }
    };

    const next = await tx.agentTask.findFirst({
      where,
      orderBy: [{ nextAttemptAt: "asc" }, { createdAt: "asc" }],
      include: {
        agent: {
          select: { key: true, displayName: true, runtime: true, model: true, controlRole: true }
        }
      }
    });
    if (!next) return null;

    const claimed = await tx.agentTask.updateMany({
      where: { id: next.id, status: "QUEUED", nextAttemptAt: { lte: now } },
      data: { status: "RUNNING", startedAt: new Date() }
    });
    if (claimed.count !== 1) return null;

    const decision = evaluateOrchestratorTaskTransition(
      "CLAIM_TASK",
      next.status,
      "RUNNING"
    );
    if (!decision.allowed) {
      await recordLifecycleAudit(
        {
          entityType: "TASK",
          entityId: next.id,
          actorRole: "ORCHESTRATOR",
          action: "CLAIM_TASK",
          fromState: next.status,
          toState: "RUNNING",
          allowed: false,
          reason: decision.reason
        },
        tx
      );
      throw new WorkerTaskError("TRANSITION_DENIED", decision.reason, false);
    }

    await recordLifecycleAudit(
      {
        entityType: "TASK",
        entityId: next.id,
        actorRole: "ORCHESTRATOR",
        action: "CLAIM_TASK",
        fromState: next.status,
        toState: "RUNNING",
        allowed: true,
        reason: decision.reason
      },
      tx
    );

    return tx.agentTask.findUnique({
      where: { id: next.id },
      include: {
        agent: {
          select: { key: true, displayName: true, runtime: true, model: true, controlRole: true }
        }
      }
    });
  });
}

async function taskIntakeDecision(agentKey, db = prisma) {
  const agent = await db.agent.findUnique({
    where: { key: agentKey },
    select: { enabled: true, runtime: true, readiness: true }
  });
  if (!agent) {
    return {
      status: "MANUAL_REQUIRED",
      error: `Agent @${agentKey} is not registered in Sovereign.`
    };
  }
  if (!agent.enabled) {
    return {
      status: "MANUAL_REQUIRED",
      error: `Agent @${agentKey} is disabled.`
    };
  }
  if (agent.runtime === "MANUAL") {
    return {
      status: "MANUAL_REQUIRED",
      error: `Agent @${agentKey} uses MANUAL runtime and cannot execute automatically.`
    };
  }
  if (agent.readiness === "NOT_READY") {
    return {
      status: "MANUAL_REQUIRED",
      error: NOT_READY_REASON
    };
  }
  if (agent.readiness === "PAUSED") {
    return {
      status: "QUEUED",
      error: PAUSED_REASON
    };
  }
  return { status: "QUEUED", error: null };
}

async function postMessage(threadId, authorType, authorKey, content, meta, db = prisma) {
  if (!threadId) return;
  const dlpGuard = redactSensitiveOutput(content, "chat_message");
  const safeMetaBase = asRecord(meta) ? { ...meta } : {};
  if (dlpGuard.redacted) {
    safeMetaBase.dlp = {
      mode: dlpGuard.dlp.mode,
      action: dlpGuard.dlp.action,
      matchCount: dlpGuard.dlp.matchCount,
      ruleIds: dlpGuard.dlp.ruleIds,
      blocked: dlpGuard.blocked
    };
    const taskId = normalizeText(safeMetaBase.taskId) || null;
    if (taskId) {
      await recordLifecycleAudit(
        {
          entityType: "TASK",
          entityId: taskId,
          actorRole: "ORCHESTRATOR",
          action: "DLP_OUTPUT_FILTER",
          fromState: null,
          toState: null,
          allowed: true,
          reason:
            dlpGuard.dlp.action === "BLOCK"
              ? "DLP guard blocked sensitive content before chat persistence."
              : "DLP guard redacted sensitive content before chat persistence.",
          metadata: {
            channel: "chat_message",
            mode: dlpGuard.dlp.mode,
            action: dlpGuard.dlp.action,
            matchCount: dlpGuard.dlp.matchCount,
            ruleIds: dlpGuard.dlp.ruleIds,
            messageKind: normalizeText(safeMetaBase.kind) || null,
            callId: normalizeText(safeMetaBase.callId) || null,
            artifactId: normalizeText(safeMetaBase.artifactId) || null
          }
        },
        db
      );
    }
  }
  return db.chatMessage.create({
    data: {
      threadId,
      authorType,
      authorKey: authorKey || null,
      content: dlpGuard.text,
      meta: Object.keys(safeMetaBase).length ? safeMetaBase : undefined
    }
  });
}

function buildRunJudgementMeta(params) {
  return {
    kind: "worker_judgement",
    taskId: params.taskId,
    outcome: params.outcome,
    agentKey: params.agentKey,
    provider: params.provider || null,
    model: params.model || null,
    durationMs:
      typeof params.durationMs === "number" && Number.isFinite(params.durationMs)
        ? params.durationMs
        : null,
    doneReason: params.doneReason || null,
    code: params.code || null,
    grounded: params.grounded === true,
    memoryCaptured: params.memoryCaptured === true
  };
}

function buildRunJudgementContent(params) {
  const parts = [`Verdict: ${params.outcome}`];
  if (params.agentKey) parts.push(`agent=@${params.agentKey}`);
  if (params.provider) parts.push(`provider=${params.provider}`);
  if (params.model) parts.push(`model=${params.model}`);
  if (typeof params.durationMs === "number" && Number.isFinite(params.durationMs)) {
    parts.push(`duration=${Math.round(params.durationMs)}ms`);
  }
  if (params.doneReason) parts.push(`reason=${params.doneReason}`);
  if (params.code) parts.push(`code=${params.code}`);
  if (params.grounded === true) parts.push("grounded");
  if (params.memoryCaptured === true) parts.push("memory=captured");
  return parts.join(" · ");
}

const JUDGEMENT_CONFIDENCE_ESCALATE_THRESHOLD = 0.7;

function computeFinalJudgement(params) {
  const { outcome, meta, failure } = params;
  const m = asRecord(meta) || {};
  if (outcome === "DONE") {
    const vote =
      m.judgementVote && ["APPROVE", "REJECT", "ESCALATE"].includes(m.judgementVote)
        ? m.judgementVote
        : "APPROVE";
    const confidence =
      typeof m.judgementConfidence === "number" && m.judgementConfidence >= 0 && m.judgementConfidence <= 1
        ? m.judgementConfidence
        : 1;
    const reason =
      typeof m.judgementReason === "string" && m.judgementReason.trim()
        ? m.judgementReason.trim()
        : "Task completed successfully.";
    return { vote, confidence, reason };
  }
  if (outcome === "DEAD_LETTER" || outcome === "FAILED") {
    const reason =
      failure && typeof failure.message === "string"
        ? failure.message
        : "Task failed after max attempts.";
    return { vote: "REJECT", confidence: 1, reason };
  }
  if (outcome === "CANCELED") {
    return {
      vote: "REJECT",
      confidence: 1,
      reason: "Task was canceled."
    };
  }
  return { vote: "REJECT", confidence: 0, reason: `Unknown outcome: ${outcome}` };
}

async function recordFinalJudgement(task, agentKey, judgement, tx) {
  const { vote, confidence, reason } = judgement;
  const shouldEscalate =
    vote === "ESCALATE" ||
    (typeof confidence === "number" && confidence < JUDGEMENT_CONFIDENCE_ESCALATE_THRESHOLD);
  await postThreadEvent(
    task.threadId,
    "JUDGEMENT",
    {
      taskId: task.id,
      vote,
      confidence: typeof confidence === "number" ? confidence : null,
      reason: reason || null,
      agentKey
    },
    tx
  );
  await tx.agentTask.update({
    where: { id: task.id },
    data: {
      judgementVote: vote,
      judgementConfidence: typeof confidence === "number" ? confidence : null,
      judgementReason: reason || null,
      ...(shouldEscalate ? { escalatedAt: new Date() } : {})
    }
  });
}

async function postThreadEvent(threadId, kind, payload, db = prisma) {
  if (!threadId) return null;
  return db.chatEvent.create({
    data: {
      threadId,
      kind,
      actorKey: normalizeText(payload?.agentKey) || normalizeText(payload?.actorKey) || null,
      taskId: normalizeText(payload?.taskId) || null,
      payload: payload || null
    }
  });
}

async function resolveKnownAgentKey(rawAgentKey, db = prisma) {
  const wanted = normalizeLower(rawAgentKey);
  if (!wanted) return null;

  const local = await db.agent.findFirst({
    where: { key: { equals: wanted, mode: "insensitive" } },
    select: { key: true }
  });
  if (local?.key) return local.key;
  return null;
}

async function routeAgentHandoffs(params) {
  const db = params?.db || prisma;
  const sourceThreadId = params?.sourceThreadId || null;
  if (!sourceThreadId) return 0;
  const knownAgents = await db.agent.findMany({
    where: { enabled: true },
    select: {
      key: true,
      displayName: true
    }
  });
  const parsedHandoffs = parseAgentHandoffs({
    text: params.sourceContent,
    knownAgents,
    requestedByAgent: params?.requestedByAgent || null,
    maxInferred: HANDOFF_INFERRED_MAX
  });
  if (!parsedHandoffs.length) return 0;

  const requestedByRole = String(params?.requestedByRole || "BETA").toUpperCase();
  const sourceProvenance = params?.sourceProvenance || null;
  const sourceChannel =
    normalizeText(sourceProvenance?.channel) || normalizeText(params?.sourceChannel) || "system";
  const sourceNbaApproval = normalizeNbaApproval(params?.sourceNbaApproval);
  let handoffs = parsedHandoffs;
  const strictRole = roleForAgent(params?.requestedByAgent, STRICT_ORCHESTRATION);
  if (strictRole) {
    const strictDecision = enforceStrictOrchestration({
      config: STRICT_ORCHESTRATION,
      requestedByAgent: params?.requestedByAgent,
      sourceContent: params?.sourceContent,
      handoffs
    });
    handoffs = strictDecision.handoffs;
    if (strictDecision.notices.length) {
      for (const notice of strictDecision.notices) {
        // eslint-disable-next-line no-await-in-loop
        await postMessage(
          sourceThreadId,
          "SYSTEM",
          null,
          notice,
          {
            kind: "strict_orchestration_notice",
            requestedByAgent: params?.requestedByAgent || null,
            strictRole
          },
          db
        );
      }
    }
  }
  if (requestedByRole !== "ALPHA") {
    const explicitHandoffs = handoffs.filter(
      (handoff) => normalizeText(handoff?.routeMode).toUpperCase() === "EXPLICIT_AT"
    );
    handoffs = handoffs.filter(
      (handoff) => normalizeText(handoff?.routeMode).toUpperCase() !== "EXPLICIT_AT"
    );

    if (explicitHandoffs.length) {
      const denialReason =
        "Role boundary denied: only ALPHA agents can emit explicit @ handoff actions.";
      await recordLifecycleAudit(
        {
          entityType: "TASK",
          entityId: params?.sourceTaskId || null,
          actorRole: "WORKER",
          action: "BETA_CONTROL_DENIED",
          fromState: "RUNNING",
          toState: null,
          allowed: false,
          reason: denialReason,
          metadata: {
            requestedByAgent: params?.requestedByAgent || null,
            requestedByRole,
            deniedCount: explicitHandoffs.length
          }
        },
        db
      );
      await postMessage(
        sourceThreadId,
        "SYSTEM",
        null,
        `${denialReason} Source=@${params?.requestedByAgent || "unknown"} (${requestedByRole}).`,
        {
          kind: "role_boundary_denied",
          requestedByAgent: params?.requestedByAgent || null,
          requestedByRole,
          deniedCount: explicitHandoffs.length
        },
        db
      );
    }

    if (!handoffs.length) return 0;

    await recordLifecycleAudit(
      {
        entityType: "TASK",
        entityId: params?.sourceTaskId || null,
        actorRole: "WORKER",
        action: "BETA_MECHANICAL_ROUTER_ALLOWED",
        fromState: "RUNNING",
        toState: null,
        allowed: true,
        reason:
          "Non-ALPHA delegation accepted through inferred mechanical routing with NBA policy enforcement.",
        metadata: {
          requestedByAgent: params?.requestedByAgent || null,
          requestedByRole,
          routedCountCandidate: handoffs.length
        }
      },
      db
    );
  }

  let routedCount = 0;

  for (let index = 0; index < handoffs.length; index += 1) {
    const handoff = handoffs[index];
    // eslint-disable-next-line no-await-in-loop
    const targetAgentKey = await resolveKnownAgentKey(handoff.target, db);
    if (!targetAgentKey) continue;

    if (normalizeLower(targetAgentKey) === normalizeLower(params.requestedByAgent)) {
      continue;
    }

    const recommendationKey = `${params?.sourceTaskId || "source"}:${index + 1}:${targetAgentKey}`;
    const nbaDecision = evaluateNbaOrchestrationPolicy({
      sourceChannel,
      command: handoff.command,
      approval: sourceNbaApproval
    });
    const nbaMetadata = buildNbaRoutingMetadata(nbaDecision, {
      recommendationKey,
      requestedByAgent: params.requestedByAgent || null,
      targetAgentKey,
      command: handoff.command
    });

    // eslint-disable-next-line no-await-in-loop
    await recordLifecycleAudit(
      {
        entityType: "TASK",
        entityId: params?.sourceTaskId || null,
        actorRole: "ORCHESTRATOR",
        action: "NBA_RECOMMENDATION_CAPTURED",
        fromState: "RUNNING",
        toState: null,
        allowed: true,
        reason: `Captured NBA recommendation @${params.requestedByAgent} -> @${targetAgentKey}.`,
        metadata: nbaMetadata
      },
      db
    );

    // eslint-disable-next-line no-await-in-loop
    await recordLifecycleAudit(
      {
        entityType: "TASK",
        entityId: params?.sourceTaskId || null,
        actorRole: "ORCHESTRATOR",
        action: "NBA_APPROVAL_EVALUATED",
        fromState: "RUNNING",
        toState: null,
        allowed: nbaDecision.allowed,
        reason: nbaDecision.reason,
        metadata: nbaMetadata
      },
      db
    );

    const trace = {
      requestedByAgent: params.requestedByAgent,
      sourceThreadId,
      sourceMessageId: params.sourceMessageId,
      handoffContext: {
        rawMention: handoff.rawMention,
        routeMode: normalizeText(handoff.routeMode) || "EXPLICIT_AT",
        sourceTaskId: params.sourceTaskId,
        sourceTaskTitle: params.sourceTaskTitle
      },
      omnichannel: nbaMetadata
    };

    // eslint-disable-next-line no-await-in-loop
    const intake = nbaDecision.allowed
      ? // eslint-disable-next-line no-await-in-loop
        await taskIntakeDecision(targetAgentKey, db)
      : {
          status: "MANUAL_REQUIRED",
          error: nbaDecision.reason
        };
    const routeDecision = evaluateOrchestratorTaskTransition(
      "ROUTE_HANDOFF_TASK",
      null,
      intake.status
    );
    if (!routeDecision.allowed) {
      // eslint-disable-next-line no-await-in-loop
      await recordLifecycleAudit(
        {
          entityType: "TASK",
          actorRole: "ORCHESTRATOR",
          action: "ROUTE_HANDOFF_TASK",
          fromState: null,
          toState: intake.status,
          allowed: false,
          reason: routeDecision.reason,
          metadata: {
            targetAgentKey,
            requestedByAgent: params.requestedByAgent,
            ...nbaMetadata
          }
        },
        db
      );
      continue;
    }

    const routedTask = await db.agentTask.create({
      data: {
        agentKey: targetAgentKey,
        status: intake.status,
        issueNumber: params.issueNumber ?? null,
        threadId: sourceThreadId,
        title: handoff.command,
        error: intake.error,
        ...(intake.status === "MANUAL_REQUIRED" ? { finishedAt: new Date() } : {}),
        payload: {
          kind: "agent_handoff",
          command: handoff.command,
          nbaApproval: nbaDecision.approval,
          ...trace
        }
      }
    });
    // eslint-disable-next-line no-await-in-loop
    await recordLifecycleAudit(
      {
        entityType: "TASK",
        entityId: routedTask.id,
        actorRole: "ORCHESTRATOR",
        action: "ROUTE_HANDOFF_TASK",
        fromState: null,
        toState: intake.status,
        allowed: true,
        reason: routeDecision.reason,
        metadata: {
          targetAgentKey,
          requestedByAgent: params.requestedByAgent,
          ...nbaMetadata
        }
      },
      db
    );

    if (sourceProvenance?.chainId) {
      // eslint-disable-next-line no-await-in-loop
      await recordLifecycleAudit(
        {
          entityType: "TASK_PROVENANCE",
          entityId: sourceProvenance.chainId,
          actorRole: "ORCHESTRATOR",
          action: "NBA_EXECUTION_LINKED",
          fromState: "RUNNING",
          toState: intake.status,
          allowed: intake.status !== "MANUAL_REQUIRED",
          reason:
            intake.status === "MANUAL_REQUIRED"
              ? "NBA recommendation linked but execution is pending explicit human approval."
              : "NBA recommendation linked to routed execution task.",
          metadata: withProvenanceMetadata(sourceProvenance, {
            recommendationKey,
            targetAgentKey,
            routedTaskId: routedTask.id,
            ...nbaMetadata
          })
        },
        db
      );
    }

    // eslint-disable-next-line no-await-in-loop
    await postMessage(
      sourceThreadId,
      "SYSTEM",
      null,
      intake.status === "MANUAL_REQUIRED" && !nbaDecision.allowed
        ? `NBA route requires explicit human decision @${params.requestedByAgent} -> @${targetAgentKey}: ${intake.error}`
        : intake.status === "MANUAL_REQUIRED"
        ? `Handoff requires manual handling @${params.requestedByAgent} -> @${targetAgentKey}: ${intake.error}`
        : intake.error
        ? `Routed handoff queued @${params.requestedByAgent} -> @${targetAgentKey}: ${intake.error}`
        : `Routed handoff @${params.requestedByAgent} -> @${targetAgentKey}: ${handoff.command}`,
      {
        kind:
          intake.status === "MANUAL_REQUIRED"
            ? "agent_handoff_manual_required"
            : "agent_handoff_routed",
        taskId: routedTask.id,
        targetAgentKey,
        reason: intake.error,
        routeCode: nbaDecision.code,
        routeClass: nbaDecision.routeClass,
        sourceChannel: nbaDecision.channel,
        nbaImpact: nbaDecision.impact,
        humanGateRequired: nbaDecision.requiresHumanGate,
        humanGateApproved: nbaDecision.approval?.approved === true,
        ...trace
      },
      db
    );

    routedCount += 1;
  }

  return routedCount;
}

function shortError(e) {
  if (!e) return "Unknown error";
  if (typeof e === "string") return e;
  if (e instanceof Error) return e.message;
  return String(e);
}

function trimText(value, maxLen) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen);
}

function httpFailure(provider, status, responseBody) {
  const base = `${provider} HTTP ${status}`;
  const suffix = responseBody ? `: ${trimText(responseBody, 600)}` : "";
  if (status === 401 || status === 403) {
    return new WorkerTaskError("AUTH_REJECTED", `${base}${suffix}`, false);
  }
  if (status === 429) {
    return new WorkerTaskError("RATE_LIMITED", `${base}${suffix}`, true);
  }
  if (status === 408 || status === 504) {
    return new WorkerTaskError("PROVIDER_TIMEOUT", `${base}${suffix}`, true);
  }
  if (status >= 500) {
    return new WorkerTaskError("PROVIDER_UNAVAILABLE", `${base}${suffix}`, true);
  }
  return new WorkerTaskError("PROVIDER_BAD_REQUEST", `${base}${suffix}`, false);
}

function normalizeFailure(e) {
  if (e instanceof WorkerTaskError) {
    return {
      code: e.code || "EXECUTION_ERROR",
      retryable: Boolean(e.retryable),
      kind: e.retryable ? "RETRYABLE" : "NON_RETRYABLE",
      message: shortError(e)
    };
  }

  const message = shortError(e);
  if (/timed?\s*out|timeout/i.test(message)) {
    return {
      code: "PROVIDER_TIMEOUT",
      retryable: true,
      kind: "RETRYABLE",
      message
    };
  }
  if (/fetch failed|econnrefused|enotfound|network/i.test(message)) {
    return {
      code: "PROVIDER_UNAVAILABLE",
      retryable: true,
      kind: "RETRYABLE",
      message
    };
  }
  return {
    code: "EXECUTION_ERROR",
    retryable: true,
    kind: "RETRYABLE",
    message
  };
}

async function fetchWithTimeout(url, init, provider, timeoutOverrideMs) {
  const timeoutMs = clampInt(timeoutOverrideMs ?? REQUEST_TIMEOUT_MS, 60000, 1000, 300000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (e) {
    if (e?.name === "AbortError") {
      throw new WorkerTaskError(
        "PROVIDER_TIMEOUT",
        `${provider} request timed out after ${timeoutMs}ms`,
        true
      );
    }
    throw new WorkerTaskError(
      "PROVIDER_UNAVAILABLE",
      `${provider} request failed: ${shortError(e)}`,
      true
    );
  } finally {
    clearTimeout(timer);
  }
}

async function ghGraphQL(query, variables) {
  if (!GITHUB_TOKEN) {
    throw new Error(
      "Missing GitHub token for board grounding. Set SOVEREIGN_GITHUB_TOKEN or SENTINELSQUAD_GITHUB_TOKEN."
    );
  }
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `bearer ${GITHUB_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ query, variables })
  });
  if (!res.ok) {
    throw new Error(`GitHub GraphQL HTTP ${res.status}`);
  }
  const json = await res.json();
  if (json.errors?.length) {
    throw new Error(`GitHub GraphQL error: ${json.errors[0].message}`);
  }
  return json.data;
}

async function readIssueBoardStatus(issueNumber) {
  const issueNum = Number(issueNumber);
  if (!Number.isInteger(issueNum) || issueNum <= 0) {
    return { ok: false, code: "ISSUE_NUMBER_INVALID", statusName: null, reason: "Task has no linked issue." };
  }
  if (!GITHUB_BOARD_ENABLED) {
    return {
      ok: false,
      code: "BOARD_DISABLED",
      statusName: null,
      reason: "Optional GitHub planning sync is disabled in local-only mode."
    };
  }
  if (!GITHUB_TOKEN) {
    return {
      ok: false,
      code: "TOKEN_MISSING",
      statusName: null,
      reason: "SENTINELSQUAD_GITHUB_TOKEN is required for board/runtime drift checks."
    };
  }

  const cacheKey = String(issueNum);
  const now = Date.now();
  const cached = cachedIssueBoardStatus.get(cacheKey);
  if (cached && now - cached.at <= DRIFT_STATUS_CACHE_TTL_MS) {
    return cached.value;
  }

  try {
    const meta = await getProjectMeta();
    const data = await ghGraphQL(
      `query($owner:String!, $repo:String!, $num:Int!) {
        repository(owner:$owner, name:$repo) {
          issue(number:$num) {
            projectItems(first:20, includeArchived:false) {
              nodes {
                id
                project { id title }
                fieldValueByName(name:"Status") {
                  __typename
                  ... on ProjectV2ItemFieldSingleSelectValue { name }
                }
              }
            }
          }
        }
      }`,
      { owner: GITHUB_REPO_OWNER, repo: GITHUB_REPO_NAME, num: issueNum }
    );

    const items = data?.repository?.issue?.projectItems?.nodes || [];
    const currentProjectItem = items.find((node) => normalizeText(node?.project?.id) === normalizeText(meta?.id));
    if (!currentProjectItem) {
      const value = {
        ok: false,
        code: "PROJECT_ITEM_MISSING",
        statusName: null,
        reason: `Issue #${issueNum} is not linked to Sovereign project ${meta?.title || "(unknown project)"}`
      };
      cachedIssueBoardStatus.set(cacheKey, { at: now, value });
      return value;
    }

    const statusName =
      normalizeText(currentProjectItem?.fieldValueByName?.name) || null;
    if (!statusName) {
      const value = {
        ok: false,
        code: "STATUS_MISSING",
        statusName: null,
        reason: `Issue #${issueNum} has no board Status value.`
      };
      cachedIssueBoardStatus.set(cacheKey, { at: now, value });
      return value;
    }

    const value = {
      ok: true,
      code: "OK",
      statusName,
      reason: `Issue #${issueNum} board Status is ${statusName}.`
    };
    cachedIssueBoardStatus.set(cacheKey, { at: now, value });
    return value;
  } catch (error) {
    const value = {
      ok: false,
      code: "BOARD_READ_FAILED",
      statusName: null,
      reason: `Board status read failed for issue #${issueNum}: ${shortError(error)}`
    };
    cachedIssueBoardStatus.set(cacheKey, { at: now, value });
    return value;
  }
}

function toTitleCaseStatus(value) {
  return normalizeText(value)
    .split(" ")
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}

function evaluateBoardRuntimeDrift(taskStatus, boardStatusName) {
  const normalizedTask = normalizeText(taskStatus).toUpperCase();
  const normalizedBoard = normalizeLower(boardStatusName);
  const expectedBoardStatuses = Array.from(ALLOWED_RUNNING_BOARD_STATUSES).map(toTitleCaseStatus);

  if (normalizedTask === "RUNNING") {
    if (!normalizedBoard) {
      return { drifted: true, expectedBoardStatuses };
    }
    return {
      drifted: !ALLOWED_RUNNING_BOARD_STATUSES.has(normalizedBoard),
      expectedBoardStatuses
    };
  }
  return { drifted: false, expectedBoardStatuses: [] };
}

async function enforceBoardRuntimeDriftGuard(task) {
  const issueNumber = Number(task?.issueNumber);
  if (!Number.isInteger(issueNumber) || issueNumber <= 0) {
    return { allowed: true, reason: "Task has no linked issue number." };
  }

  const boardStatus = await readIssueBoardStatus(issueNumber);
  if (
    boardStatus.code === "BOARD_DISABLED" ||
    boardStatus.code === "TOKEN_MISSING" ||
    boardStatus.code === "BOARD_READ_FAILED"
  ) {
    return {
      allowed: true,
      reason: `Optional planning sync not enforced: ${boardStatus.reason}`
    };
  }
  const drift = evaluateBoardRuntimeDrift(task.status, boardStatus.statusName);
  if (boardStatus.ok && !drift.drifted) {
    return { allowed: true, reason: boardStatus.reason };
  }

  const expectedStatuses = drift.expectedBoardStatuses.length
    ? drift.expectedBoardStatuses
    : ["In Progress", "Ready"];
  const reason = boardStatus.ok
    ? `Board/runtime drift detected: issue #${issueNumber} Status="${boardStatus.statusName}" is incompatible with task state ${task.status}.`
    : `Board/runtime drift check failed for issue #${issueNumber}: ${boardStatus.reason}`;
  const remediation =
    'Set issue Status to "In Progress" (or "Ready"), verify board/runtime alignment, then resume or rerun task manually.';

  await withLeaseAuthority(`drift-block-task:${task.id}`, async (tx) => {
    const current = await tx.agentTask.findUnique({
      where: { id: task.id },
      select: { status: true }
    });
    if (!current || current.status !== "RUNNING") {
      return;
    }

    const decision = evaluateOrchestratorTaskTransition(
      "BLOCK_TASK_ON_DRIFT",
      current.status,
      "MANUAL_REQUIRED"
    );
    if (!decision.allowed) {
      await recordLifecycleAudit(
        {
          entityType: "TASK",
          entityId: task.id,
          actorRole: "ORCHESTRATOR",
          action: "BLOCK_TASK_ON_DRIFT",
          fromState: current.status,
          toState: "MANUAL_REQUIRED",
          allowed: false,
          reason: decision.reason,
          metadata: {
            issueNumber,
            boardStatus: boardStatus.statusName,
            expectedBoardStatuses: expectedStatuses
          }
        },
        tx
      );
      throw new WorkerTaskError("TRANSITION_DENIED", decision.reason, false);
    }

    await postMessage(
      task.threadId,
      "SYSTEM",
      null,
      `Task blocked by board/runtime drift guard for @${task.agentKey}: ${reason} Remediation: ${remediation}`,
      {
        kind: "worker_drift_blocked",
        taskId: task.id,
        issueNumber,
        boardStatus: boardStatus.statusName,
        expectedBoardStatuses: expectedStatuses,
        driftCode: boardStatus.code
      },
      tx
    );
    await tx.agentTask.update({
      where: { id: task.id },
      data: {
        status: "MANUAL_REQUIRED",
        finishedAt: new Date(),
        error: `[BOARD_RUNTIME_DRIFT] ${reason}`,
        nextAttemptAt: new Date()
      }
    });
    await recordLifecycleAudit(
      {
        entityType: "TASK",
        entityId: task.id,
        actorRole: "ORCHESTRATOR",
        action: "BLOCK_TASK_ON_DRIFT",
        fromState: current.status,
        toState: "MANUAL_REQUIRED",
        allowed: true,
        reason,
        metadata: {
          issueNumber,
          boardStatus: boardStatus.statusName,
          expectedBoardStatuses: expectedStatuses,
          driftCode: boardStatus.code,
          remediation
        }
      },
      tx
    );
  });

  const { maxAttempts, attemptCount } = normalizeTaskLimits(task);
  await publishRuntimeIssueEvidence({
    task,
    outcome: "MANUAL_REQUIRED",
    failureMessage: reason,
    attemptCount,
    maxAttempts
  });

  return { allowed: false, reason };
}

function computeIssueEvidenceBackoffMs(attempt) {
  const step = Math.max(attempt - 1, 0);
  const raw = Math.min(ISSUE_EVIDENCE_RETRY_BASE_MS * 2 ** step, ISSUE_EVIDENCE_RETRY_MAX_MS);
  const jitter = Math.floor(Math.random() * 250);
  return Math.min(raw + jitter, ISSUE_EVIDENCE_RETRY_MAX_MS);
}

function isTransientIssueEvidenceStatus(status) {
  if (status === 408 || status === 425 || status === 429) return true;
  return status >= 500;
}

function summarizeIssueEvidenceArtifacts(meta) {
  const toolCalls = Array.isArray(meta?.toolCalls) ? meta.toolCalls : [];
  if (!toolCalls.length) {
    return {
      summary: "none",
      items: []
    };
  }
  const items = toolCalls.slice(0, 8).map((call) => {
    const id = normalizeText(call?.id) || "call";
    const tool = normalizeText(call?.tool) || "tool";
    const exit =
      call?.exitCode == null || Number.isNaN(Number(call.exitCode))
        ? ""
        : ` exit=${Number(call.exitCode)}`;
    const artifact = normalizeText(call?.artifactId);
    return `${id}:${tool}${exit}${artifact ? ` artifact=${artifact}` : ""}`;
  });
  return {
    summary: items.join("; "),
    items
  };
}

function buildIssueEvidenceCommentBody(params) {
  const task = params.task || {};
  const outcome = normalizeText(params.outcome).toUpperCase() || "UNKNOWN";
  const evidenceKey = `${task.id}:${outcome}`;
  const summarySource =
    params.resultAnswer || params.failureMessage || task.error || task.title || "no summary";
  const summary = trimText(redactSensitiveOutput(summarySource, "issue_evidence").text, 320);
  const artifactSummary = summarizeIssueEvidenceArtifacts(params.resultMeta);
  const provenanceChainId = normalizeText(params?.resultMeta?.provenanceChainId) || null;
  const approvalTokenId =
    normalizeText(params?.resultMeta?.approvalTokenId) ||
    normalizeText(params?.resultMeta?.provenanceApprovalTokenId) ||
    null;
  const approverUserId =
    normalizeText(params?.resultMeta?.approverUserId) ||
    normalizeText(params?.resultMeta?.provenanceApproverUserId) ||
    null;
  const provenanceChannel = normalizeText(params?.resultMeta?.provenanceChannel) || null;
  const provenanceSourceKind = normalizeText(params?.resultMeta?.provenanceSourceKind) || null;
  const provenanceSourceRef = normalizeText(params?.resultMeta?.provenanceSourceRef) || null;
  const provenanceActorType = normalizeText(params?.resultMeta?.provenanceActorType) || null;
  const provenanceActorEmail = normalizeText(params?.resultMeta?.provenanceActorEmail) || null;
  const provenanceActorUserId = normalizeText(params?.resultMeta?.provenanceActorUserId) || null;
  const provenanceActorExternalId =
    normalizeText(params?.resultMeta?.provenanceActorExternalId) || null;
  const actorIdentity =
    provenanceActorEmail || provenanceActorUserId || provenanceActorExternalId || "n/a";
  const attempt =
    params.attemptCount == null || Number.isNaN(Number(params.attemptCount))
      ? "n/a"
      : Number(params.attemptCount);
  const maxAttempts =
    params.maxAttempts == null || Number.isNaN(Number(params.maxAttempts))
      ? "n/a"
      : Number(params.maxAttempts);
  return [
    `<!-- sovereign-evidence:${evidenceKey} -->`,
    "Sovereign runtime evidence",
    `- task: \`${task.id}\``,
    `- outcome: \`${outcome}\``,
    `- agent: \`@${task.agentKey}\``,
    `- attempt: \`${attempt}/${maxAttempts}\``,
    `- artifacts: ${artifactSummary.summary}`,
    `- provenance: chain=\`${provenanceChainId || "n/a"}\`, approvalToken=\`${approvalTokenId || "n/a"}\`, approverUser=\`${approverUserId || "n/a"}\``,
    `- provenanceIdentity: channel=\`${provenanceChannel || "n/a"}\`, source=\`${provenanceSourceKind || "n/a"}:${provenanceSourceRef || "n/a"}\`, actor=\`${provenanceActorType || "n/a"}:${actorIdentity}\``,
    `- summary: ${summary}`
  ].join("\n");
}

async function postGitHubIssueComment(issueNumber, body) {
  const response = await fetchWithTimeout(
    `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/issues/${issueNumber}/comments`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28"
      },
      body: JSON.stringify({ body })
    },
    "GitHub issue evidence publisher",
    20_000
  );
  const responseText = await response.text();
  let json = null;
  try {
    json = responseText ? JSON.parse(responseText) : null;
  } catch {
    json = null;
  }
  return {
    ok: response.ok,
    status: response.status,
    json,
    responseText
  };
}

async function publishRuntimeIssueEvidence(params) {
  const task = params?.task;
  const outcome = normalizeText(params?.outcome).toUpperCase() || "UNKNOWN";
  if (!task?.id) return { posted: false, skipped: true, reason: "TASK_MISSING" };
  const evidenceKey = `${task.id}:${outcome}`;
  const issueNumber = Number(task.issueNumber);
  const metadataBase = {
    taskId: task.id,
    issueNumber: Number.isFinite(issueNumber) ? issueNumber : null,
    outcome,
    evidenceKey
  };

  if (!Number.isInteger(issueNumber) || issueNumber <= 0) {
    await recordLifecycleAudit({
      entityType: "TASK_ISSUE_EVIDENCE",
      entityId: evidenceKey,
      actorRole: "ORCHESTRATOR",
      action: "POST_ISSUE_COMMENT",
      fromState: task.status,
      toState: task.status,
      allowed: false,
      reason: "Issue evidence skipped: task has no linked issue number.",
      metadata: {
        ...metadataBase,
        code: "ISSUE_NUMBER_MISSING"
      }
    });
    return { posted: false, skipped: true, reason: "ISSUE_NUMBER_MISSING" };
  }

  const alreadyPosted = await prisma.lifecycleAuditEvent.findFirst({
    where: {
      entityType: "TASK_ISSUE_EVIDENCE",
      entityId: evidenceKey,
      action: "POST_ISSUE_COMMENT",
      allowed: true
    },
    select: { id: true }
  });
  if (alreadyPosted) {
    await recordLifecycleAudit({
      entityType: "TASK_ISSUE_EVIDENCE",
      entityId: evidenceKey,
      actorRole: "ORCHESTRATOR",
      action: "SKIP_ISSUE_COMMENT_DUPLICATE",
      fromState: task.status,
      toState: task.status,
      allowed: true,
      reason: "Issue evidence comment already posted for this task outcome key.",
      metadata: metadataBase
    });
    return { posted: false, skipped: true, reason: "DUPLICATE" };
  }

  if (!GITHUB_TOKEN) {
    await recordLifecycleAudit({
      entityType: "TASK_ISSUE_EVIDENCE",
      entityId: evidenceKey,
      actorRole: "ORCHESTRATOR",
      action: "POST_ISSUE_COMMENT",
      fromState: task.status,
      toState: task.status,
      allowed: false,
      reason: "Issue evidence posting failed: SENTINELSQUAD_GITHUB_TOKEN is missing.",
      metadata: {
        ...metadataBase,
        code: "TOKEN_MISSING"
      }
    });
    return { posted: false, skipped: false, reason: "TOKEN_MISSING" };
  }

  const commentBody = buildIssueEvidenceCommentBody({
    task,
    outcome,
    resultMeta: params?.resultMeta,
    resultAnswer: params?.resultAnswer,
    failureMessage: params?.failureMessage,
    attemptCount: params?.attemptCount,
    maxAttempts: params?.maxAttempts
  });
  const safeCommentBodyResult = redactSensitiveOutput(commentBody, "issue_evidence_comment");
  const safeCommentBody = safeCommentBodyResult.text;
  if (safeCommentBodyResult.redacted) {
    await recordLifecycleAudit({
      entityType: "TASK_ISSUE_EVIDENCE",
      entityId: evidenceKey,
      actorRole: "ORCHESTRATOR",
      action: "DLP_OUTPUT_FILTER",
      fromState: task.status,
      toState: task.status,
      allowed: true,
      reason:
        safeCommentBodyResult.dlp.action === "BLOCK"
          ? "DLP guard blocked sensitive content before issue evidence publication."
          : "DLP guard redacted sensitive content before issue evidence publication.",
      metadata: {
        ...metadataBase,
        mode: safeCommentBodyResult.dlp.mode,
        action: safeCommentBodyResult.dlp.action,
        matchCount: safeCommentBodyResult.dlp.matchCount,
        ruleIds: safeCommentBodyResult.dlp.ruleIds
      }
    });
  }

  let finalErrorReason = "Issue evidence posting failed.";
  for (let attempt = 1; attempt <= ISSUE_EVIDENCE_MAX_ATTEMPTS; attempt += 1) {
    try {
      const posted = await postGitHubIssueComment(issueNumber, safeCommentBody);
      if (posted.ok) {
        await recordLifecycleAudit({
          entityType: "TASK_ISSUE_EVIDENCE",
          entityId: evidenceKey,
          actorRole: "ORCHESTRATOR",
          action: "POST_ISSUE_COMMENT",
          fromState: task.status,
          toState: task.status,
          allowed: true,
          reason: "Issue evidence comment posted successfully.",
          metadata: {
            ...metadataBase,
            attempt,
            commentId: posted.json?.id || null,
            commentUrl: posted.json?.html_url || null
          }
        });
        return { posted: true, skipped: false, reason: null };
      }

      const bodyText = trimText(redactSensitiveOutput(posted.responseText, "issue_evidence").text, 500);
      const transient = isTransientIssueEvidenceStatus(posted.status);
      finalErrorReason = `Issue evidence comment HTTP ${posted.status}${
        bodyText ? `: ${bodyText}` : ""
      }`;
      await recordLifecycleAudit({
        entityType: "TASK_ISSUE_EVIDENCE",
        entityId: evidenceKey,
        actorRole: "ORCHESTRATOR",
        action: "POST_ISSUE_COMMENT_ATTEMPT",
        fromState: task.status,
        toState: task.status,
        allowed: false,
        reason: finalErrorReason,
        metadata: {
          ...metadataBase,
          attempt,
          status: posted.status,
          transient
        }
      });
      if (!transient || attempt >= ISSUE_EVIDENCE_MAX_ATTEMPTS) break;
      await sleep(computeIssueEvidenceBackoffMs(attempt));
      continue;
    } catch (error) {
      const normalized = normalizeFailure(error);
      const transient = normalized.retryable;
      finalErrorReason = `Issue evidence posting error: ${normalized.message}`;
      await recordLifecycleAudit({
        entityType: "TASK_ISSUE_EVIDENCE",
        entityId: evidenceKey,
        actorRole: "ORCHESTRATOR",
        action: "POST_ISSUE_COMMENT_ATTEMPT",
        fromState: task.status,
        toState: task.status,
        allowed: false,
        reason: finalErrorReason,
        metadata: {
          ...metadataBase,
          attempt,
          code: normalized.code,
          transient
        }
      });
      if (!transient || attempt >= ISSUE_EVIDENCE_MAX_ATTEMPTS) break;
      await sleep(computeIssueEvidenceBackoffMs(attempt));
    }
  }

  await recordLifecycleAudit({
    entityType: "TASK_ISSUE_EVIDENCE",
    entityId: evidenceKey,
    actorRole: "ORCHESTRATOR",
    action: "POST_ISSUE_COMMENT",
    fromState: task.status,
    toState: task.status,
    allowed: false,
    reason: finalErrorReason,
    metadata: {
      ...metadataBase,
      attempts: ISSUE_EVIDENCE_MAX_ATTEMPTS
    }
  });
  return { posted: false, skipped: false, reason: finalErrorReason };
}

async function getProjectMeta() {
  if (cachedProjectMeta) return cachedProjectMeta;
  const data = await ghGraphQL(
    `query($owner:String!, $num:Int!) {
      user(login:$owner) {
        projectV2(number:$num) {
          id
          title
          fields(first:50) {
            nodes {
              __typename
              ... on ProjectV2SingleSelectField { id name options { id name } }
            }
          }
        }
      }
    }`,
    { owner: GITHUB_PROJECT_OWNER, num: GITHUB_PROJECT_NUMBER }
  );
  const project = data?.user?.projectV2;
  if (!project?.id) throw new Error("Unable to load project metadata.");
  cachedProjectMeta = project;
  return cachedProjectMeta;
}

function detectProduct(prompt, productOptions) {
  const lower = (prompt || "").toLowerCase();
  const found = productOptions.find((p) => lower.includes(p.toLowerCase()));
  return found || null;
}

async function listProjectItemsForProduct(product, limit = 200) {
  const meta = await getProjectMeta();
  const items = [];
  let after = null;

  while (items.length < limit) {
    const data = await ghGraphQL(
      `query($projectId:ID!, $after:String) {
        node(id:$projectId) {
          ... on ProjectV2 {
            items(first:50, after:$after) {
              pageInfo { hasNextPage endCursor }
              nodes {
                id
                content {
                  __typename
                  ... on Issue { number title url }
                }
                fieldValues(first:30) {
                  nodes {
                    __typename
                    ... on ProjectV2ItemFieldSingleSelectValue {
                      name
                      field { ... on ProjectV2FieldCommon { name } }
                    }
                  }
                }
              }
            }
          }
        }
      }`,
      { projectId: meta.id, after }
    );

    const batch = data?.node?.items?.nodes || [];
    for (const node of batch) {
      if (!node?.content || node.content.__typename !== "Issue") continue;
      const fields = {};
      for (const fv of node.fieldValues?.nodes || []) {
        if (
          fv?.__typename === "ProjectV2ItemFieldSingleSelectValue" &&
          fv.field?.name &&
          fv.name
        ) {
          fields[fv.field.name] = fv.name;
        }
      }
      if (fields.Product !== product) continue;
      items.push({
        number: node.content.number,
        title: node.content.title,
        url: node.content.url,
        fields
      });
      if (items.length >= limit) break;
    }

    const pageInfo = data?.node?.items?.pageInfo;
    if (!pageInfo?.hasNextPage || !pageInfo?.endCursor) break;
    after = pageInfo.endCursor;
  }

  return items;
}

function countBy(items, field) {
  const out = {};
  for (const it of items) {
    const key = it.fields?.[field] || "(unset)";
    out[key] = (out[key] || 0) + 1;
  }
  return out;
}

function topEntries(mapObj, n = 3) {
  return Object.entries(mapObj)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);
}

function formatThreeLineStatus(grounding) {
  const status = topEntries(grounding.statusCounts, 4)
    .map(([k, v]) => `${k}:${v}`)
    .join(", ");
  const priority = topEntries(grounding.priorityCounts, 3)
    .map(([k, v]) => `${k}:${v}`)
    .join(", ");
  const owners = topEntries(grounding.agentCounts, 3)
    .map(([k, v]) => `${k}:${v}`)
    .join(", ");
  return [
    `${grounding.product}: ${grounding.total} tasks total. Status => ${status || "n/a"}.`,
    `Priority mix => ${priority || "n/a"}.`,
    `Top owners => ${owners || "n/a"}.`
  ].join("\n");
}

async function maybeBuildBoardGrounding(prompt) {
  try {
    const meta = await getProjectMeta();
    const productField = (meta.fields?.nodes || []).find(
      (f) => f.__typename === "ProjectV2SingleSelectField" && f.name === "Product"
    );
    const productOptions = (productField?.options || []).map((o) => o.name);
    if (!productOptions.length) return null;

    const product = detectProduct(prompt, productOptions);
    if (!product) return null;

    const items = await listProjectItemsForProduct(product, 200);
    return {
      product,
      total: items.length,
      statusCounts: countBy(items, "Status"),
      priorityCounts: countBy(items, "Priority"),
      agentCounts: countBy(items, "Agent"),
      sampleTitles: items.slice(0, 5).map((i) => `#${i.number} ${i.title}`)
    };
  } catch (e) {
    // Grounding is best-effort. Worker should continue even if GitHub fetch fails.
    return null;
  }
}

function buildGroundingBlock(grounding) {
  return grounding
    ? `\n\nGrounding data from live board:\n${JSON.stringify(
        {
          product: grounding.product,
          total: grounding.total,
          statusCounts: grounding.statusCounts,
          priorityCounts: grounding.priorityCounts,
          agentCounts: grounding.agentCounts,
          sampleTitles: grounding.sampleTitles
        },
        null,
        2
      )}`
    : "";
}

function composePromptWithMemory(basePrompt, memoryPromptBlock) {
  const prompt = normalizeText(basePrompt);
  const memoryBlock = normalizeText(memoryPromptBlock);
  if (!memoryBlock) return prompt;
  return `${prompt}\n\n${memoryBlock}`;
}

function buildFullThreadHistoryBlock(messages) {
  const source = Array.isArray(messages)
    ? messages.filter((message) => message?.authorType === "HUMAN" || message?.authorType === "AGENT")
    : [];
  if (!source.length) return "";
  const lines = source.slice(-20).map((m) => {
    const author =
      m?.authorType === "AGENT"
        ? `@${normalizeText(m?.authorKey) || "Agent"}`
        : m?.authorType === "HUMAN"
        ? "Human"
        : "System";
    const content = String(m?.content || "").trim();
    const stamped = m?.createdAt ? new Date(m.createdAt).toISOString() : "unknown-time";
    return `[${stamped}] ${author}: ${content}`;
  });
  return `Full chat history (mandatory context, read all before responding):\n${lines.join("\n")}`;
}

async function runLocalRuntime(
  task,
  config,
  promptOverride = null,
  memoryPromptBlock = null,
  fullHistoryBlock = null
) {
  const requestedModel = String(config.model || "").trim();
  if (!requestedModel) {
    throw new WorkerTaskError("CONFIG_MISSING", `No model configured for @${task.agentKey}.`, false);
  }
  const resolvedModel = await resolveInstalledLocalModel(
    config.endpoint,
    requestedModel,
    config.requestTimeoutMs
  );
  const basePrompt = normalizeText(promptOverride) || task.title;
  let userPrompt = composePromptWithMemory(basePrompt, memoryPromptBlock);
  if (normalizeText(fullHistoryBlock)) {
    userPrompt = `${userPrompt}\n\n${fullHistoryBlock}`;
  }
  const grounding = await maybeBuildBoardGrounding(basePrompt);

  if (grounding && /status/i.test(basePrompt) && /3[- ]?line/i.test(basePrompt)) {
    return {
      answer: formatThreeLineStatus(grounding),
      meta: {
        provider: "grounded-summary",
        source: "github-project-v2",
        product: grounding.product,
        total: grounding.total
      }
    };
  }

  const startedAt = Date.now();
  const groundingBlock = buildGroundingBlock(grounding);

  const res = await fetchWithTimeout(
    `${config.endpoint}/api/chat`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: resolvedModel,
        stream: false,
        messages: [
          {
            role: "system",
            content:
              `You are ${config.displayName}, a pragmatic coding agent in Sovereign. Reply with concise, actionable output. If grounding data is provided, use only that data for status claims and explicitly avoid guessing.`
          },
          { role: "user", content: `${userPrompt}${groundingBlock}` }
        ]
      })
    },
    "Ollama",
    config.requestTimeoutMs
  );

  if (!res.ok) {
    const txt = await res.text();
    throw httpFailure("Ollama", res.status, txt);
  }

  const data = await res.json();
  const content = data?.message?.content || data?.response || "";
  const answer = String(content || "").trim();
  if (!answer) {
    throw new WorkerTaskError("EMPTY_RESPONSE", "Ollama returned empty response.", false);
  }

  return {
    answer,
    meta: {
      provider: config.provider,
      baseUrl: config.endpoint,
      model: resolvedModel,
      requestedModel,
      grounded: Boolean(grounding),
      product: grounding?.product || null,
      durationMs: Date.now() - startedAt,
      doneReason: data?.done_reason || null,
      evalCount: data?.eval_count || null,
      promptEvalCount: data?.prompt_eval_count || null,
      runtimeConfigDigest: config.runtimeConfigDigest || null
    }
  };
}

async function runCloudRuntime(
  task,
  config,
  promptOverride = null,
  memoryPromptBlock = null,
  fullHistoryBlock = null
) {
  if (!config.apiKey) {
    throw new WorkerTaskError(
      "AUTH_MISSING",
      `API key missing for @${task.agentKey}. Set env ${config.apiKeyEnv}.`,
      false
    );
  }
  if (!config.model) {
    throw new WorkerTaskError("CONFIG_MISSING", `No model configured for @${task.agentKey}.`, false);
  }
  const basePrompt = normalizeText(promptOverride) || task.title;
  let userPrompt = composePromptWithMemory(basePrompt, memoryPromptBlock);
  if (normalizeText(fullHistoryBlock)) {
    userPrompt = `${userPrompt}\n\n${fullHistoryBlock}`;
  }
  const grounding = await maybeBuildBoardGrounding(basePrompt);

  if (grounding && /status/i.test(basePrompt) && /3[- ]?line/i.test(basePrompt)) {
    return {
      answer: formatThreeLineStatus(grounding),
      meta: {
        provider: "grounded-summary",
        source: "github-project-v2",
        product: grounding.product,
        total: grounding.total,
        model: config.model
      }
    };
  }

  const groundingBlock = buildGroundingBlock(grounding);

  const startedAt = Date.now();
  const res = await fetchWithTimeout(
    `${config.endpoint}/chat/completions`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content:
              `You are ${config.displayName}, a pragmatic operations agent in Sovereign. Be concise and actionable. If grounding data is provided, use only that data for status claims and do not guess.`
          },
          { role: "user", content: `${userPrompt}${groundingBlock}` }
        ]
      })
    },
    "OpenAI-compatible",
    config.requestTimeoutMs
  );

  if (!res.ok) {
    const txt = await res.text();
    throw httpFailure("OpenAI-compatible", res.status, txt);
  }
  const data = await res.json();
  const raw = data?.choices?.[0]?.message?.content;
  const answer =
    typeof raw === "string"
      ? raw.trim()
      : Array.isArray(raw)
      ? raw
          .map((p) => (typeof p?.text === "string" ? p.text : ""))
          .join("")
          .trim()
      : "";
  if (!answer) {
    throw new WorkerTaskError("EMPTY_RESPONSE", "OpenAI returned empty response.", false);
  }

  return {
    answer,
    meta: {
      provider: config.provider,
      baseUrl: config.endpoint,
      model: config.model,
      grounded: Boolean(grounding),
      product: grounding?.product || null,
      durationMs: Date.now() - startedAt,
      promptTokens: data?.usage?.prompt_tokens || null,
      completionTokens: data?.usage?.completion_tokens || null,
      totalTokens: data?.usage?.total_tokens || null,
      runtimeConfigDigest: config.runtimeConfigDigest || null
    }
  };
}

function readToolPromptFromCallArgs(call) {
  const args = asRecord(call?.args);
  if (!args) return "";
  const prompt = normalizeText(args.prompt);
  if (prompt) return prompt;
  const command = normalizeText(args.command);
  if (command) return command;
  const input = normalizeText(args.input);
  if (input) return input;
  return "";
}

async function executeToolCallProtocol(
  task,
  config,
  envelope,
  policyEvaluation,
  dryRun,
  provenanceContext = null,
  resolveMemoryPromptForQuery = null
) {
  const responses = [];
  const callMeta = [];
  const provenance = provenanceContext || readTaskProvenance(task?.payload, task);
  const policyByCallId = new Map(
    (policyEvaluation.decisions || []).map((decision) => [decision.callId, decision])
  );
  let filesystemContext = null;
  let gitContext = null;
  let shellContext = null;
  let projectSessionContext = null;

  async function resolveProjectSessionExecutionContext() {
    if (projectSessionContext) return projectSessionContext;

    const payloadRecord = asRecord(task?.payload);
    const requestedSessionId = normalizeText(payloadRecord?.projectSessionId) || null;
    const requestedSessionRelPath = normalizeText(payloadRecord?.projectSessionRelPath) || null;

    const session =
      requestedSessionId
        ? await prisma.projectSession.findUnique({
            where: { id: requestedSessionId },
            select: { id: true, rootPath: true, relPath: true, displayName: true }
          })
        : null;

    const rootPath = normalizeText(session?.rootPath) || process.cwd();
    const relPath = normalizeText(session?.relPath) || requestedSessionRelPath || "";
    const sessionPath = path.resolve(rootPath, relPath || ".");
    projectSessionContext = {
      id: normalizeText(session?.id) || null,
      displayName: normalizeText(session?.displayName) || null,
      relPath,
      rootPath,
      sessionPath
    };
    return projectSessionContext;
  }

  async function emitToolCallThreadEvent(kind, call, payload = {}) {
    const sessionContext = await resolveProjectSessionExecutionContext();
    await postThreadEvent(task.threadId, kind, {
      taskId: task.id,
      callId: call.id,
      tool: call.tool,
      agentKey: task.agentKey,
      projectSessionId: sessionContext.id,
      projectSessionRelPath: sessionContext.relPath || null,
      projectSessionPath: sessionContext.sessionPath,
      ...payload
    });
  }

  async function enforceStrictExecutionRoleBoundary(call, policyDecision) {
    const roleDecision = evaluateExecutionRolePolicy({
      config: STRICT_ORCHESTRATION,
      agentKey: task.agentKey,
      requestedByAgent: task.agentKey,
      tool: call.tool
    });
    if (!roleDecision.strictApplied || roleDecision.allowed) return;

    const reason = roleDecision.reason;
    await recordLifecycleAudit({
      entityType: "TASK",
      entityId: task.id,
      actorRole: "ORCHESTRATOR",
      action: "STRICT_ROLE_GATE",
      fromState: task.status,
      toState: task.status,
      allowed: false,
      reason,
      metadata: {
        callId: call.id,
        tool: call.tool,
        strictRole: roleDecision.role,
        accessFamily: roleDecision.access?.family || null,
        accessClass: roleDecision.access?.access || null,
        policyClass: policyDecision?.policyClass || null
      }
    });
    await emitToolCallThreadEvent("TOOL_CALL_FAILED", call, {
      status: "FAILED",
      policyClass: policyDecision?.policyClass || null,
      code: "STRICT_ROLE_VIOLATION",
      strictRole: roleDecision.role,
      accessFamily: roleDecision.access?.family || null,
      accessClass: roleDecision.access?.access || null,
      reason
    });
    if (roleDecision.role === "CONTROLLER") {
      await recordAlphaFailureEvent({
        failureClass: "STRICT_ROLE_VIOLATION",
        issueNumber: task.issueNumber ?? null,
        taskId: task.id,
        threadId: task.threadId || null,
        metadata: {
          agentKey: task.agentKey,
          tool: call.tool,
          reason,
          strictRole: roleDecision.role
        }
      });
    }
    throw new WorkerTaskError("STRICT_ROLE_VIOLATION", reason, false);
  }

  async function ensureWorkspaceContext() {
    if (!filesystemContext) {
      const sessionContext = await resolveProjectSessionExecutionContext();
      filesystemContext = await resolveFilesystemToolContext({
        settingsFile: SETTINGS_FILE,
        cwd: sessionContext.sessionPath,
        env: process.env
      });
      filesystemContext.projectSession = sessionContext;
    }
    return filesystemContext;
  }

  async function ensureGitContext() {
    if (!gitContext) {
      const workspaceContext = await ensureWorkspaceContext();
      gitContext = await resolveGitToolContext({
        workspaceRoots: workspaceContext.workspaceRoots,
        primaryWorkspaceRoot: workspaceContext.primaryWorkspaceRoot,
        env: process.env
      });
      gitContext.projectSession = workspaceContext.projectSession || null;
    }
    return gitContext;
  }

  async function recordDlpDecisionForCall(call, dlpResult, channel, extra = {}) {
    if (!dlpResult?.redacted) return;
    await recordLifecycleAudit({
      entityType: "TASK",
      entityId: task.id,
      actorRole: "ORCHESTRATOR",
      action: "DLP_OUTPUT_FILTER",
      fromState: task.status,
      toState: task.status,
      allowed: true,
      reason:
        dlpResult.dlp.action === "BLOCK"
          ? `DLP guard blocked sensitive ${channel} output.`
          : `DLP guard redacted sensitive ${channel} output.`,
      metadata: {
        callId: call.id,
        tool: call.tool,
        channel,
        mode: dlpResult.dlp.mode,
        action: dlpResult.dlp.action,
        matchCount: dlpResult.dlp.matchCount,
        ruleIds: dlpResult.dlp.ruleIds,
        ...extra
      }
    });
  }

  for (let index = 0; index < envelope.calls.length; index += 1) {
    const call = envelope.calls[index];
    const callPrefix = `tool-call ${call.id} (${call.tool})`;
    const policyDecision = policyByCallId.get(call.id) || null;
    if (!policyDecision || !policyDecision.allowed) {
      const reason =
        policyDecision?.reason || `${callPrefix} denied: no allow policy decision is available.`;
      await recordLifecycleAudit({
        entityType: "TASK",
        entityId: task.id,
        actorRole: "ORCHESTRATOR",
        action: "TOOL_CALL_PROTOCOL_EXECUTE",
        fromState: task.status,
        toState: task.status,
        allowed: true,
        reason,
        metadata: {
          callId: call.id,
          tool: call.tool,
          riskClass: call.riskClass,
          approval: call.approval
        }
      });
      throw new WorkerTaskError("TOOL_CALL_POLICY_DENIED", reason, false);
    }

    if (dryRun) {
      const reason = `${callPrefix} dry-run accepted: execution skipped by policy flag.`;
      await recordLifecycleAudit({
        entityType: "TASK",
        entityId: task.id,
        actorRole: "ORCHESTRATOR",
        action: "TOOL_CALL_PROTOCOL_EXECUTE",
        fromState: task.status,
        toState: task.status,
        allowed: false,
        reason,
        metadata: {
          callId: call.id,
          tool: call.tool,
          riskClass: call.riskClass,
          approval: call.approval,
          policyClass: policyDecision.policyClass,
          dryRun: true
        }
      });
      responses.push(
        `[dry-run ${call.id}] ${call.tool} blocked from execution; policy class=${policyDecision.policyClass}.`
      );
      callMeta.push({
        id: call.id,
        tool: call.tool,
        dryRun: true,
        policyClass: policyDecision.policyClass
      });
      continue;
    }

    await enforceStrictExecutionRoleBoundary(call, policyDecision);

    if (call.tool.startsWith("backlog.")) {
      try {
        const backlogResult = await executeBacklogToolCall(call, prisma);
        await recordLifecycleAudit({
          entityType: "TASK",
          entityId: task.id,
          actorRole: "ORCHESTRATOR",
          action: "TOOL_BACKLOG_INVOKE",
          fromState: task.status,
          toState: task.status,
          allowed: true,
          reason: `${callPrefix} backlog operation executed.`,
          metadata: {
            callId: call.id,
            tool: call.tool,
            riskClass: call.riskClass,
            approval: call.approval,
            policyClass: policyDecision.policyClass,
            ...(backlogResult.audit || {})
          }
        });
        await recordLifecycleAudit({
          entityType: "TASK",
          entityId: task.id,
          actorRole: "ORCHESTRATOR",
          action: "TOOL_CALL_PROTOCOL_EXECUTE",
          fromState: task.status,
          toState: task.status,
          allowed: true,
          reason: `${callPrefix} executed.`,
          metadata: {
            callId: call.id,
            tool: call.tool,
            riskClass: call.riskClass,
            approval: call.approval,
            policyClass: policyDecision.policyClass,
            dryRun: false
          }
        });
        await emitToolCallThreadEvent("TOOL_CALL_EXECUTED", call, {
          status: "SUCCESS",
          policyClass: policyDecision.policyClass
        });
        responses.push(
          envelope.calls.length === 1 ? backlogResult.answer : `[${call.id}] ${backlogResult.answer}`
        );
        callMeta.push({
          id: call.id,
          tool: call.tool,
          policyClass: policyDecision.policyClass
        });
        continue;
      } catch (error) {
        const reason = `${callPrefix} backlog tool failed: ${error?.message || String(error)}.`;
        await recordLifecycleAudit({
          entityType: "TASK",
          entityId: task.id,
          actorRole: "ORCHESTRATOR",
          action: "TOOL_BACKLOG_INVOKE",
          fromState: task.status,
          toState: task.status,
          allowed: false,
          reason,
          metadata: {
            callId: call.id,
            tool: call.tool,
            riskClass: call.riskClass,
            approval: call.approval,
            policyClass: policyDecision.policyClass
          }
        });
        await recordLifecycleAudit({
          entityType: "TASK",
          entityId: task.id,
          actorRole: "ORCHESTRATOR",
          action: "TOOL_CALL_PROTOCOL_EXECUTE",
          fromState: task.status,
          toState: task.status,
          allowed: false,
          reason,
          metadata: {
            callId: call.id,
            tool: call.tool,
            policyClass: policyDecision.policyClass,
            dryRun: false
          }
        });
        await emitToolCallThreadEvent("TOOL_CALL_FAILED", call, {
          status: "FAILED",
          policyClass: policyDecision.policyClass,
          reason
        });
        throw new WorkerTaskError("TOOL_BACKLOG_FAILED", reason, false);
      }
    }

    if (call.tool.startsWith("memory.")) {
      const sessionContext = await resolveProjectSessionExecutionContext();
      const baseArgs = asRecord(call.args) || {};
      const existingSid = normalizeText(baseArgs.projectSessionId);
      const defaultSid = sessionContext?.id || null;
      const mergedArgs =
        !existingSid && defaultSid ? { ...baseArgs, projectSessionId: defaultSid } : baseArgs;
      const memoryCall = { ...call, args: mergedArgs };
      try {
        const memoryResult = await executeMemoryToolCall(memoryCall, prisma);
        await recordLifecycleAudit({
          entityType: "TASK",
          entityId: task.id,
          actorRole: "ORCHESTRATOR",
          action: "TOOL_MEMORY_INVOKE",
          fromState: task.status,
          toState: task.status,
          allowed: true,
          reason: `${callPrefix} memory operation executed.`,
          metadata: {
            callId: call.id,
            tool: call.tool,
            riskClass: call.riskClass,
            approval: call.approval,
            policyClass: policyDecision.policyClass,
            ...(memoryResult.audit || {})
          }
        });
        await recordLifecycleAudit({
          entityType: "TASK",
          entityId: task.id,
          actorRole: "ORCHESTRATOR",
          action: "TOOL_CALL_PROTOCOL_EXECUTE",
          fromState: task.status,
          toState: task.status,
          allowed: true,
          reason: `${callPrefix} executed.`,
          metadata: {
            callId: call.id,
            tool: call.tool,
            riskClass: call.riskClass,
            approval: call.approval,
            policyClass: policyDecision.policyClass,
            dryRun: false
          }
        });
        await emitToolCallThreadEvent("TOOL_CALL_EXECUTED", call, {
          status: "SUCCESS",
          policyClass: policyDecision.policyClass
        });
        responses.push(
          envelope.calls.length === 1 ? memoryResult.answer : `[${call.id}] ${memoryResult.answer}`
        );
        callMeta.push({
          id: call.id,
          tool: call.tool,
          policyClass: policyDecision.policyClass
        });
        continue;
      } catch (error) {
        const reason = `${callPrefix} memory tool failed: ${error?.message || String(error)}.`;
        await recordLifecycleAudit({
          entityType: "TASK",
          entityId: task.id,
          actorRole: "ORCHESTRATOR",
          action: "TOOL_MEMORY_INVOKE",
          fromState: task.status,
          toState: task.status,
          allowed: false,
          reason,
          metadata: {
            callId: call.id,
            tool: call.tool,
            riskClass: call.riskClass,
            approval: call.approval,
            policyClass: policyDecision.policyClass
          }
        });
        await recordLifecycleAudit({
          entityType: "TASK",
          entityId: task.id,
          actorRole: "ORCHESTRATOR",
          action: "TOOL_CALL_PROTOCOL_EXECUTE",
          fromState: task.status,
          toState: task.status,
          allowed: false,
          reason,
          metadata: {
            callId: call.id,
            tool: call.tool,
            policyClass: policyDecision.policyClass,
            dryRun: false
          }
        });
        await emitToolCallThreadEvent("TOOL_CALL_FAILED", call, {
          status: "FAILED",
          policyClass: policyDecision.policyClass,
          reason
        });
        throw new WorkerTaskError("TOOL_MEMORY_FAILED", reason, false);
      }
    }

    if (call.tool.startsWith("git.")) {
      const resolvedGitContext = await ensureGitContext();
      try {
        const gitResult = await executeGitToolCall(call, resolvedGitContext);
        await recordLifecycleAudit({
          entityType: "TASK",
          entityId: task.id,
          actorRole: "ORCHESTRATOR",
          action: "TOOL_GIT_INVOKE",
          fromState: task.status,
          toState: task.status,
          allowed: true,
          reason: `${callPrefix} git operation executed.`,
          metadata: {
            callId: call.id,
            tool: call.tool,
            riskClass: call.riskClass,
            approval: call.approval,
            policyClass: policyDecision.policyClass,
            ...(gitResult.audit || {})
          }
        });
        await recordLifecycleAudit({
          entityType: "TASK",
          entityId: task.id,
          actorRole: "ORCHESTRATOR",
          action: "TOOL_CALL_PROTOCOL_EXECUTE",
          fromState: task.status,
          toState: task.status,
          allowed: true,
          reason: `${callPrefix} executed.`,
          metadata: {
            callId: call.id,
            tool: call.tool,
            riskClass: call.riskClass,
            approval: call.approval,
            policyClass: policyDecision.policyClass,
            dryRun: false
          }
        });
        await emitToolCallThreadEvent("TOOL_CALL_EXECUTED", call, {
          status: "SUCCESS",
          policyClass: policyDecision.policyClass,
          repoRoot: gitResult.audit?.repoRoot || null,
          branch: gitResult.audit?.branch || null,
          commitSha: gitResult.audit?.commitSha || null,
          prNumber: gitResult.audit?.prNumber || null
        });

        responses.push(
          envelope.calls.length === 1 ? gitResult.answer : `[${call.id}] ${gitResult.answer}`
        );
        callMeta.push({
          id: call.id,
          tool: call.tool,
          policyClass: policyDecision.policyClass,
          repoRoot: gitResult.audit?.repoRoot || null,
          branch: gitResult.audit?.branch || null,
          commitSha: gitResult.audit?.commitSha || null,
          prNumber: gitResult.audit?.prNumber || null
        });
        if (provenance?.chainId) {
          await recordLifecycleAudit({
            entityType: "TASK_PROVENANCE",
            entityId: provenance.chainId,
            actorRole: "ORCHESTRATOR",
            action: "EMIT_GIT_ARTIFACT",
            fromState: task.status,
            toState: task.status,
            allowed: true,
            reason: `${callPrefix} emitted git-linked provenance artifact.`,
            metadata: withProvenanceMetadata(provenance, {
              callId: call.id,
              tool: call.tool,
              branch: gitResult.audit?.branch || null,
              commitSha: gitResult.audit?.commitSha || null,
              prNumber: gitResult.audit?.prNumber || null,
              pushRemote: gitResult.audit?.pushRemote || null
            })
          });
        }
        continue;
      } catch (error) {
        const reason =
          error instanceof ToolGitError
            ? redactSensitiveOutput(error.message, "git_error").text
            : `${callPrefix} failed with unexpected git runtime error.`;
        await recordLifecycleAudit({
          entityType: "TASK",
          entityId: task.id,
          actorRole: "ORCHESTRATOR",
          action: "TOOL_GIT_INVOKE",
          fromState: task.status,
          toState: task.status,
          allowed: false,
          reason,
          metadata: {
            callId: call.id,
            tool: call.tool,
            riskClass: call.riskClass,
            approval: call.approval,
            policyClass: policyDecision.policyClass,
            code: error instanceof ToolGitError ? error.code : "UNKNOWN",
            details: error instanceof ToolGitError ? sanitizeShellMetadata(error.metadata) : null
          }
        });
        await recordLifecycleAudit({
          entityType: "TASK",
          entityId: task.id,
          actorRole: "ORCHESTRATOR",
          action: "TOOL_CALL_PROTOCOL_EXECUTE",
          fromState: task.status,
          toState: task.status,
          allowed: false,
          reason,
          metadata: {
            callId: call.id,
            tool: call.tool,
            riskClass: call.riskClass,
            approval: call.approval,
            policyClass: policyDecision.policyClass,
            dryRun: false,
            code: error instanceof ToolGitError ? error.code : "UNKNOWN"
          }
        });
        await emitToolCallThreadEvent("TOOL_CALL_FAILED", call, {
          status: "FAILED",
          policyClass: policyDecision.policyClass,
          code: error instanceof ToolGitError ? error.code : "UNKNOWN",
          reason
        });
        throw new WorkerTaskError("TOOL_GIT_DENIED", reason, false);
      }
    }

    if (call.tool === "shell.exec") {
      const workspaceContext = await ensureWorkspaceContext();
      if (!shellContext) {
        const sessionContext = await resolveProjectSessionExecutionContext();
        shellContext = await resolveShellToolContext({
          sessionId: `task-${task.id}`,
          workspaceRoots: workspaceContext.workspaceRoots,
          defaultCwd: sessionContext.sessionPath,
          inheritFullProcessEnv: readShellAccessSettings().inheritFullProcessEnv,
          env: process.env
        });
        shellContext.projectSession = sessionContext;
      }
      const artifactId = `${task.id}:${call.id}:${Date.now().toString(36)}`;
      const streamState = {
        queue: Promise.resolve(),
        pendingBuffer: "",
        pendingRedacted: false,
        pendingBlocked: false,
        pendingDlpMatchCount: 0,
        pendingDlpRuleIds: new Set(),
        pendingStreams: new Set(),
        streamSequence: 0
      };
      const artifactState = {
        id: artifactId,
        chunkCount: 0,
        streamMessageCount: 0,
        redactedChunkCount: 0,
        blockedChunkCount: 0,
        dlpMatchCount: 0,
        dlpRuleIds: new Set(),
        stdoutSnippet: "",
        stderrSnippet: "",
        stdoutSnippetTruncated: false,
        stderrSnippetTruncated: false
      };

      const enqueueStreamOp = (op) => {
        streamState.queue = streamState.queue
          .then(() => op())
          .catch((err) => {
            console.warn(
              `[sovereign-worker] shell stream publish failed task=${task.id} call=${call.id}`,
              shortError(err)
            );
          });
        return streamState.queue;
      };

      const flushStreamBuffer = (force = false) => {
        if (!streamState.pendingBuffer) return;
        if (!force && streamState.pendingBuffer.length < SHELL_STREAM_FLUSH_CHARS) return;
        const text = streamState.pendingBuffer.slice(0, SHELL_STREAM_MESSAGE_MAX_CHARS);
        const truncated = streamState.pendingBuffer.length > SHELL_STREAM_MESSAGE_MAX_CHARS;
        const body = truncated ? `${text}\n[TRUNCATED]` : text;
        const redacted = streamState.pendingRedacted;
        const blocked = streamState.pendingBlocked;
        const dlpMatchCount = streamState.pendingDlpMatchCount;
        const dlpRuleIds = Array.from(streamState.pendingDlpRuleIds);
        const streams = Array.from(streamState.pendingStreams);
        const seq = streamState.streamSequence + 1;
        streamState.streamSequence = seq;
        streamState.pendingBuffer = "";
        streamState.pendingRedacted = false;
        streamState.pendingBlocked = false;
        streamState.pendingDlpMatchCount = 0;
        streamState.pendingDlpRuleIds = new Set();
        streamState.pendingStreams = new Set();
        artifactState.streamMessageCount += 1;

        enqueueStreamOp(async () => {
          await postMessage(
            task.threadId,
            "SYSTEM",
            null,
            `[stream ${call.id}#${seq}]\n${body}`,
            {
              kind: "worker_tool_stream",
              taskId: task.id,
              callId: call.id,
              artifactId,
              sequence: seq,
              streams,
              redacted,
              blocked,
              dlpMatchCount,
              dlpRuleIds,
              truncated
            }
          );
          await recordLifecycleAudit({
            entityType: "TASK_ARTIFACT",
            entityId: artifactId,
            actorRole: "ORCHESTRATOR",
            action: "TOOL_SHELL_STREAM",
            fromState: task.status,
            toState: task.status,
            allowed: true,
            reason: `${callPrefix} streamed output to issue thread.`,
            metadata: {
              taskId: task.id,
              callId: call.id,
              sequence: seq,
              streams,
              redacted,
              blocked,
              dlpMatchCount,
              dlpRuleIds,
              truncated,
              chars: body.length
            }
          });
        });
      };

      try {
        const shellResult = await executeShellToolCall(call, shellContext, {
          onOutput: (event) => {
            const streamName = normalizeText(event?.stream).toLowerCase() || "stdout";
            const safe = redactSensitiveOutput(event?.text || "", "shell_stream");
            const boundedChunk = appendBoundedText("", safe.text, SHELL_STREAM_MESSAGE_MAX_CHARS);
            const chunkBody = boundedChunk.text || "";
            if (!chunkBody) return;

            artifactState.chunkCount += 1;
            if (safe.redacted) artifactState.redactedChunkCount += 1;
            if (safe.blocked) artifactState.blockedChunkCount += 1;
            artifactState.dlpMatchCount += safe.dlp.matchCount;
            for (const ruleId of safe.dlp.ruleIds || []) {
              artifactState.dlpRuleIds.add(ruleId);
            }
            if (streamName === "stderr") {
              const next = appendBoundedText(
                artifactState.stderrSnippet,
                chunkBody,
                SHELL_ARTIFACT_SNIPPET_MAX_CHARS
              );
              artifactState.stderrSnippet = next.text;
              artifactState.stderrSnippetTruncated =
                artifactState.stderrSnippetTruncated || next.truncated;
            } else {
              const next = appendBoundedText(
                artifactState.stdoutSnippet,
                chunkBody,
                SHELL_ARTIFACT_SNIPPET_MAX_CHARS
              );
              artifactState.stdoutSnippet = next.text;
              artifactState.stdoutSnippetTruncated =
                artifactState.stdoutSnippetTruncated || next.truncated;
            }

            streamState.pendingBuffer += `[${streamName}] ${chunkBody}\n`;
            streamState.pendingRedacted =
              streamState.pendingRedacted || safe.redacted || Boolean(event?.truncated);
            streamState.pendingBlocked = streamState.pendingBlocked || safe.blocked;
            streamState.pendingDlpMatchCount += safe.dlp.matchCount;
            for (const ruleId of safe.dlp.ruleIds || []) {
              streamState.pendingDlpRuleIds.add(ruleId);
            }
            streamState.pendingStreams.add(streamName);
            flushStreamBuffer(false);
          },
          shouldCancel: async () => {
            const current = await prisma.agentTask.findUnique({
              where: { id: task.id },
              select: { status: true }
            });
            return current?.status === "CANCELED";
          }
        });
        flushStreamBuffer(true);
        await streamState.queue;
        const shellAudit = sanitizeShellMetadata(shellResult.audit) || {};
        const sanitizedAnswerResult = redactSensitiveOutput(shellResult.answer, "shell_answer");
        const sanitizedAnswer = sanitizedAnswerResult.text;
        await recordDlpDecisionForCall(call, sanitizedAnswerResult, "shell_answer", {
          artifactId
        });

        await recordLifecycleAudit({
          entityType: "TASK",
          entityId: task.id,
          actorRole: "ORCHESTRATOR",
          action: "TOOL_SHELL_EXECUTE",
          fromState: task.status,
          toState: task.status,
          allowed: true,
          reason: `${callPrefix} shell command executed.`,
          metadata: {
            callId: call.id,
            tool: call.tool,
            riskClass: call.riskClass,
            approval: call.approval,
            policyClass: policyDecision.policyClass,
            ...shellAudit
          }
        });
        await recordLifecycleAudit({
          entityType: "TASK_ARTIFACT",
          entityId: artifactId,
          actorRole: "ORCHESTRATOR",
          action: "TOOL_SHELL_ARTIFACT",
          fromState: task.status,
          toState: task.status,
          allowed: true,
          reason: `${callPrefix} persisted shell artifact snapshot.`,
          metadata: {
            taskId: task.id,
            callId: call.id,
            artifactId,
            status: "SUCCESS",
            chunkCount: artifactState.chunkCount,
            streamMessageCount: artifactState.streamMessageCount,
            redactedChunkCount: artifactState.redactedChunkCount,
            blockedChunkCount: artifactState.blockedChunkCount,
            dlpMatchCount: artifactState.dlpMatchCount,
            dlpRuleIds: Array.from(artifactState.dlpRuleIds),
            dlpMode: OUTPUT_DLP_MODE,
            stdoutSnippet: artifactState.stdoutSnippet || null,
            stderrSnippet: artifactState.stderrSnippet || null,
            stdoutSnippetTruncated: artifactState.stdoutSnippetTruncated,
            stderrSnippetTruncated: artifactState.stderrSnippetTruncated,
            ...shellAudit
          }
        });
        await recordLifecycleAudit({
          entityType: "TASK",
          entityId: task.id,
          actorRole: "ORCHESTRATOR",
          action: "TOOL_CALL_PROTOCOL_EXECUTE",
          fromState: task.status,
          toState: task.status,
          allowed: true,
          reason: `${callPrefix} executed.`,
          metadata: {
            callId: call.id,
            tool: call.tool,
            riskClass: call.riskClass,
            approval: call.approval,
            policyClass: policyDecision.policyClass,
            dryRun: false
          }
        });

        const artifactSummary =
          `artifact=${artifactId} chunks=${artifactState.chunkCount} ` +
          `streamMessages=${artifactState.streamMessageCount} ` +
          `redacted=${artifactState.redactedChunkCount} blocked=${artifactState.blockedChunkCount} ` +
          `exit=${shellAudit.exitCode ?? "unknown"}`;
        const responseText = `${sanitizedAnswer}\n${artifactSummary}`;
        await emitToolCallThreadEvent("TOOL_CALL_EXECUTED", call, {
          status: "SUCCESS",
          policyClass: policyDecision.policyClass,
          exitCode: shellAudit.exitCode ?? null,
          durationMs: shellAudit.durationMs ?? null,
          cwd: shellAudit.relativeCwd || ".",
          artifactId
        });
        responses.push(
          envelope.calls.length === 1 ? responseText : `[${call.id}] ${responseText}`
        );
        callMeta.push({
          id: call.id,
          tool: call.tool,
          policyClass: policyDecision.policyClass,
          sessionId: shellAudit.sessionId || shellContext.sessionId,
          cwd: shellAudit.relativeCwd || ".",
          exitCode: shellAudit.exitCode,
          durationMs: shellAudit.durationMs,
          artifactId,
          streamMessageCount: artifactState.streamMessageCount
        });
        continue;
      } catch (error) {
        flushStreamBuffer(true);
        await streamState.queue;
        const reason =
          error instanceof ToolShellError
            ? error.message
            : `${callPrefix} failed with unexpected shell runtime error.`;
        const safeReason = redactSensitiveOutput(reason, "shell_error").text;
        const errorDetails =
          error instanceof ToolShellError ? sanitizeShellMetadata(error.metadata) : null;
        await recordLifecycleAudit({
          entityType: "TASK_ARTIFACT",
          entityId: artifactId,
          actorRole: "ORCHESTRATOR",
          action: "TOOL_SHELL_ARTIFACT",
          fromState: task.status,
          toState: task.status,
          allowed: false,
          reason: safeReason,
          metadata: {
            taskId: task.id,
            callId: call.id,
            artifactId,
            status: "FAILED",
            chunkCount: artifactState.chunkCount,
            streamMessageCount: artifactState.streamMessageCount,
            redactedChunkCount: artifactState.redactedChunkCount,
            blockedChunkCount: artifactState.blockedChunkCount,
            dlpMatchCount: artifactState.dlpMatchCount,
            dlpRuleIds: Array.from(artifactState.dlpRuleIds),
            dlpMode: OUTPUT_DLP_MODE,
            stdoutSnippet: artifactState.stdoutSnippet || null,
            stderrSnippet: artifactState.stderrSnippet || null,
            stdoutSnippetTruncated: artifactState.stdoutSnippetTruncated,
            stderrSnippetTruncated: artifactState.stderrSnippetTruncated,
            code: error instanceof ToolShellError ? error.code : "UNKNOWN",
            details: errorDetails
          }
        });
        await recordLifecycleAudit({
          entityType: "TASK",
          entityId: task.id,
          actorRole: "ORCHESTRATOR",
          action: "TOOL_SHELL_EXECUTE",
          fromState: task.status,
          toState: task.status,
          allowed: false,
          reason: safeReason,
          metadata: {
            callId: call.id,
            tool: call.tool,
            riskClass: call.riskClass,
            approval: call.approval,
            policyClass: policyDecision.policyClass,
            code: error instanceof ToolShellError ? error.code : "UNKNOWN",
            details: errorDetails
          }
        });
        await recordLifecycleAudit({
          entityType: "TASK",
          entityId: task.id,
          actorRole: "ORCHESTRATOR",
          action: "TOOL_CALL_PROTOCOL_EXECUTE",
          fromState: task.status,
          toState: task.status,
          allowed: false,
          reason: safeReason,
          metadata: {
            callId: call.id,
            tool: call.tool,
            riskClass: call.riskClass,
            approval: call.approval,
            policyClass: policyDecision.policyClass,
            dryRun: false,
            code: error instanceof ToolShellError ? error.code : "UNKNOWN"
          }
        });
        await emitToolCallThreadEvent("TOOL_CALL_FAILED", call, {
          status: "FAILED",
          policyClass: policyDecision.policyClass,
          code: error instanceof ToolShellError ? error.code : "UNKNOWN",
          reason: safeReason,
          artifactId
        });
        if (error instanceof ToolShellError) {
          if (error.code === "TASK_CANCELED") {
            throw new WorkerTaskError("TASK_CANCELED", safeReason, false);
          }
          if (error.code === "TIMEOUT") {
            throw new WorkerTaskError("TOOL_SHELL_TIMEOUT", safeReason, false);
          }
          if (error.code === "OUTPUT_LIMIT_EXCEEDED") {
            throw new WorkerTaskError("TOOL_SHELL_OUTPUT_LIMIT", safeReason, false);
          }
          if (error.code === "EXIT_NON_ZERO") {
            throw new WorkerTaskError("TOOL_SHELL_EXIT_NON_ZERO", safeReason, false);
          }
        }
        throw new WorkerTaskError("TOOL_SHELL_DENIED", safeReason, false);
      }
    }

    if (call.tool.startsWith("filesystem.")) {
      const workspaceContext = await ensureWorkspaceContext();
      try {
        const fsResult = await executeFilesystemToolCall(call, workspaceContext);
        const safeFsAnswerResult = redactSensitiveOutput(fsResult.answer, "filesystem_output");
        const safeFsAnswer = safeFsAnswerResult.text;
        await recordDlpDecisionForCall(call, safeFsAnswerResult, "filesystem_output", {
          workspaceRoot: workspaceContext.primaryWorkspaceRoot
        });
        await recordLifecycleAudit({
          entityType: "TASK",
          entityId: task.id,
          actorRole: "ORCHESTRATOR",
          action: "TOOL_FILESYSTEM_INVOKE",
          fromState: task.status,
          toState: task.status,
          allowed: true,
          reason: `${callPrefix} filesystem operation executed.`,
          metadata: {
            callId: call.id,
            tool: call.tool,
            riskClass: call.riskClass,
            approval: call.approval,
            policyClass: policyDecision.policyClass,
            workspaceRoot: workspaceContext.primaryWorkspaceRoot,
            ...(fsResult.audit || {})
          }
        });
        await recordLifecycleAudit({
          entityType: "TASK",
          entityId: task.id,
          actorRole: "ORCHESTRATOR",
          action: "TOOL_CALL_PROTOCOL_EXECUTE",
          fromState: task.status,
          toState: task.status,
          allowed: true,
          reason: `${callPrefix} executed.`,
          metadata: {
            callId: call.id,
            tool: call.tool,
            riskClass: call.riskClass,
            approval: call.approval,
            policyClass: policyDecision.policyClass,
            dryRun: false
          }
        });
        await emitToolCallThreadEvent("TOOL_CALL_EXECUTED", call, {
          status: "SUCCESS",
          policyClass: policyDecision.policyClass,
          workspaceRoot: workspaceContext.primaryWorkspaceRoot,
          relativePath: fsResult.audit?.relativePath || null,
          operation: fsResult.audit?.operation || call.tool
        });
        responses.push(
          envelope.calls.length === 1 ? safeFsAnswer : `[${call.id}] ${safeFsAnswer}`
        );
        callMeta.push({
          id: call.id,
          tool: call.tool,
          policyClass: policyDecision.policyClass,
          workspaceRoot: workspaceContext.primaryWorkspaceRoot,
          dlpAction: safeFsAnswerResult.dlp.action,
          dlpMatchCount: safeFsAnswerResult.dlp.matchCount
        });
        continue;
      } catch (error) {
        const reason =
          error instanceof ToolFilesystemError
            ? error.message
            : `${callPrefix} failed with unexpected filesystem runtime error.`;
        await recordLifecycleAudit({
          entityType: "TASK",
          entityId: task.id,
          actorRole: "ORCHESTRATOR",
          action: "TOOL_FILESYSTEM_INVOKE",
          fromState: task.status,
          toState: task.status,
          allowed: false,
          reason,
          metadata: {
            callId: call.id,
            tool: call.tool,
            riskClass: call.riskClass,
            approval: call.approval,
            policyClass: policyDecision.policyClass,
            code: error instanceof ToolFilesystemError ? error.code : "UNKNOWN",
            details: error instanceof ToolFilesystemError ? error.metadata : null
          }
        });
        await recordLifecycleAudit({
          entityType: "TASK",
          entityId: task.id,
          actorRole: "ORCHESTRATOR",
          action: "TOOL_CALL_PROTOCOL_EXECUTE",
          fromState: task.status,
          toState: task.status,
          allowed: false,
          reason,
          metadata: {
            callId: call.id,
            tool: call.tool,
            riskClass: call.riskClass,
            approval: call.approval,
            policyClass: policyDecision.policyClass,
            dryRun: false,
            code: error instanceof ToolFilesystemError ? error.code : "UNKNOWN"
          }
        });
        await emitToolCallThreadEvent("TOOL_CALL_FAILED", call, {
          status: "FAILED",
          policyClass: policyDecision.policyClass,
          code: error instanceof ToolFilesystemError ? error.code : "UNKNOWN",
          reason
        });
        throw new WorkerTaskError("TOOL_FILESYSTEM_DENIED", reason, false);
      }
    }

    if (call.tool !== "chat.respond") {
      const reason = `${callPrefix} denied: runtime handler is not enabled for this tool in current phase.`;
      await recordLifecycleAudit({
        entityType: "TASK",
        entityId: task.id,
        actorRole: "ORCHESTRATOR",
        action: "TOOL_CALL_PROTOCOL_EXECUTE",
        fromState: task.status,
        toState: task.status,
        allowed: false,
        reason,
        metadata: {
          callId: call.id,
          tool: call.tool,
          riskClass: call.riskClass,
          approval: call.approval,
          policyClass: policyDecision.policyClass
        }
      });
      throw new WorkerTaskError("TOOL_CALL_UNSUPPORTED", reason, false);
    }

    const prompt = readToolPromptFromCallArgs(call);
    if (!prompt) {
      const reason =
        `${callPrefix} denied: args.prompt (or args.command/args.input) is required for chat.respond.`;
      await recordLifecycleAudit({
        entityType: "TASK",
        entityId: task.id,
        actorRole: "ORCHESTRATOR",
        action: "TOOL_CALL_PROTOCOL_EXECUTE",
        fromState: task.status,
        toState: task.status,
        allowed: false,
        reason,
        metadata: {
          callId: call.id,
          tool: call.tool,
          riskClass: call.riskClass,
          approval: call.approval,
          policyClass: policyDecision.policyClass
        }
      });
      throw new WorkerTaskError("TOOL_CALL_INVALID_ARGS", reason, false);
    }

    const memoryPromptResult =
      typeof resolveMemoryPromptForQuery === "function"
        ? await resolveMemoryPromptForQuery(prompt)
        : null;
    const runtimeResult =
      task.agent.runtime === "LOCAL"
        ? await runLocalRuntime(task, config, prompt, memoryPromptResult?.promptBlock || null)
        : await runCloudRuntime(task, config, prompt, memoryPromptResult?.promptBlock || null);
    const safeRuntimeAnswerResult = redactSensitiveOutput(
      runtimeResult.answer,
      "chat_respond_output"
    );
    const safeRuntimeAnswer = safeRuntimeAnswerResult.text;
    await recordDlpDecisionForCall(call, safeRuntimeAnswerResult, "chat_respond_output");

    await recordLifecycleAudit({
      entityType: "TASK",
      entityId: task.id,
      actorRole: "ORCHESTRATOR",
      action: "TOOL_CALL_PROTOCOL_EXECUTE",
      fromState: task.status,
      toState: task.status,
      allowed: true,
      reason: `${callPrefix} executed.`,
      metadata: {
        callId: call.id,
        tool: call.tool,
        riskClass: call.riskClass,
        approval: call.approval,
        policyClass: policyDecision.policyClass,
        dryRun: false
      }
    });

    responses.push(
      envelope.calls.length === 1
        ? safeRuntimeAnswer
        : `[${call.id}] ${safeRuntimeAnswer}`
    );
    callMeta.push({
      id: call.id,
      tool: call.tool,
      provider: runtimeResult.meta?.provider || null,
      memorySnippets: memoryPromptResult?.snippetCount ?? 0,
      memoryCode: memoryPromptResult?.code || null,
      dlpAction: safeRuntimeAnswerResult.dlp.action,
      dlpMatchCount: safeRuntimeAnswerResult.dlp.matchCount
    });
  }

  return {
    answer: responses.join("\n\n"),
    meta: mergeProvenanceResultMeta(
      {
        provider: config.provider,
        model: config.model,
        toolCallProtocol: true,
        toolCallProtocolVersion: envelope.version,
        toolCallCount: envelope.calls.length,
        toolCalls: callMeta,
        runtimeConfigDigest: config.runtimeConfigDigest || null
      },
      provenance,
      {
        approvalTokenId: provenance?.approvalTokenId || null,
        approverUserId: provenance?.approverUserId || null,
        approverEmail: provenance?.approverEmail || null
      }
    )
  };
}

async function executeTask(task) {
  const agent = task?.agent;
  if (!agent) {
    throw new WorkerTaskError(
      "CONFIG_MISSING",
      `Task ${task?.id || "(unknown)"} is missing agent relation.`,
      false
    );
  }
  const runtimeResolution = readTaskRuntimeConfigResolution(task?.payload);
  if (runtimeResolution) {
    await recordLifecycleAudit({
      entityType: "TASK",
      entityId: task.id,
      actorRole: "ORCHESTRATOR",
      action: "RUNTIME_CONFIG_RESOLUTION",
      fromState: task.status,
      toState: task.status,
      allowed: true,
      reason: "Runtime config resolution applied for execution.",
      metadata: {
        digest: runtimeResolution.digest,
        projectKey: runtimeResolution.projectKey,
        projectName: runtimeResolution.projectName,
        activeContextWindowId: runtimeResolution.activeContextWindowId,
        activeContextOwnerAgentKey: runtimeResolution.activeContextOwnerAgentKey,
        sourceChain: runtimeResolution.sourceChain
      }
    });
  }
  const payloadRecord = asRecord(task?.payload);
  const provenance = readTaskProvenance(payloadRecord, task);
  const policyReplayRequest = buildPolicyReplayRequest({
    task,
    payload: payloadRecord
  });
  if (policyReplayRequest.enabled) {
    await recordLifecycleAudit({
      entityType: "TASK",
      entityId: task.id,
      actorRole: "ORCHESTRATOR",
      action: "POLICY_REPLAY_REQUEST",
      fromState: task.status,
      toState: task.status,
      allowed: true,
      reason: "Read-only policy replay request accepted.",
      metadata: withProvenanceMetadata(provenance, {
        baselineVersion: policyReplayRequest.baselineVersion,
        candidateVersion: policyReplayRequest.candidateVersion,
        mode: policyReplayRequest.mode,
        issueNumber: policyReplayRequest.issueNumber,
        threadId: policyReplayRequest.threadId,
        lookbackHours: policyReplayRequest.lookbackHours,
        sampleLimit: policyReplayRequest.sampleLimit,
        candidatePolicy: policyReplayRequest.candidatePolicy
      })
    });
    const replayWindowStart = new Date(
      Date.now() - policyReplayRequest.lookbackHours * 60 * 60 * 1000
    );
    const replayFetchLimit = Math.min(
      Math.max(policyReplayRequest.sampleLimit * 6, policyReplayRequest.sampleLimit),
      1200
    );
    const replayEvidence = await prisma.lifecycleAuditEvent.findMany({
      where: {
        action: {
          in: ["MEMORY_RETRIEVAL_POLICY", "NBA_APPROVAL_EVALUATED"]
        },
        createdAt: { gte: replayWindowStart }
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: replayFetchLimit,
      select: {
        id: true,
        action: true,
        metadata: true,
        createdAt: true
      }
    });
    const replayReport = runPolicyReplaySimulation({
      request: policyReplayRequest,
      evidenceEvents: replayEvidence,
      env: process.env
    });
    const replaySummary = buildPolicyReplayResultSummary(replayReport);
    const compactReplayReport = {
      mode: replayReport.mode,
      baselineVersion: replayReport.baselineVersion,
      candidateVersion: replayReport.candidateVersion,
      source: replayReport.source,
      totals: replayReport.totals,
      deltas: replayReport.deltas.slice(0, 20),
      skipped: replayReport.skipped.slice(0, 20),
      truncated:
        replayReport.deltas.length > 20 || replayReport.skipped.length > 20
    };
    const replayEntityId = `${task.id}:${replayReport.candidateVersion}`;
    await recordLifecycleAudit({
      entityType: "POLICY_REPLAY",
      entityId: replayEntityId,
      actorRole: "ORCHESTRATOR",
      action: "POLICY_REPLAY_SIMULATE",
      fromState: task.status,
      toState: task.status,
      allowed: true,
      reason: replaySummary,
      metadata: withProvenanceMetadata(provenance, {
        taskId: task.id,
        mode: replayReport.mode,
        baselineVersion: replayReport.baselineVersion,
        candidateVersion: replayReport.candidateVersion,
        source: replayReport.source,
        totals: replayReport.totals,
        candidatePolicy: replayReport.candidatePolicy,
        deltas: compactReplayReport.deltas,
        skipped: compactReplayReport.skipped,
        truncated: compactReplayReport.truncated
      })
    });
    if (replayReport.totals.deltaCount > 0) {
      await recordLifecycleAudit({
        entityType: "POLICY_REPLAY",
        entityId: replayEntityId,
        actorRole: "ORCHESTRATOR",
        action: "POLICY_REPLAY_REGRESSION",
        fromState: task.status,
        toState: task.status,
        allowed: replayReport.totals.regressionCount === 0,
        reason: replaySummary,
        metadata: withProvenanceMetadata(provenance, {
          taskId: task.id,
          baselineVersion: replayReport.baselineVersion,
          candidateVersion: replayReport.candidateVersion,
          totals: replayReport.totals,
          deltas: compactReplayReport.deltas,
          truncated: compactReplayReport.truncated
        })
      });
    }
    return {
      answer: formatPolicyReplayReport(replayReport),
      meta: mergeProvenanceResultMeta(
        {
          provider: "policy-replay",
          policyReplay: true,
          policyReplayMode: replayReport.mode,
          policyReplayBaselineVersion: replayReport.baselineVersion,
          policyReplayCandidateVersion: replayReport.candidateVersion,
          policyReplayTotals: replayReport.totals,
          policyReplaySummary: replaySummary
        },
        provenance,
        {
          policyReplayReport: compactReplayReport
        }
      )
    };
  }

  const config = resolveAgentExecutionConfig(agent, runtimeResolution);
  if (provenance.chainId) {
    await recordLifecycleAudit({
      entityType: "TASK_PROVENANCE",
      entityId: provenance.chainId,
      actorRole: "ORCHESTRATOR",
      action: "LOAD_PROVENANCE_CHAIN",
      fromState: task.status,
      toState: task.status,
      allowed: true,
      reason: "Loaded task provenance chain for execution.",
      metadata: withProvenanceMetadata(provenance, {
        taskId: task.id,
        agentKey: task.agentKey
      })
    });
  }
  const taskMemoryConfig = resolveTaskMemoryConfig(process.env);
  const memoryPromptCache = new Map();

  const resolveMemoryPromptForQuery = async (queryOverride = null) => {
    const cacheKey = normalizeText(queryOverride) || "__TASK_DEFAULT__";
    if (memoryPromptCache.has(cacheKey)) {
      return memoryPromptCache.get(cacheKey);
    }

    const pending = (async () => {
      const sessionContext = await resolveProjectSessionExecutionContext();
      const request = buildTaskMemoryRequest({
        task,
        payload: payloadRecord,
        queryOverride,
        config: taskMemoryConfig,
        projectSessionId: sessionContext?.id || null
      });
      const decision = evaluateTaskMemoryPolicy(request, taskMemoryConfig);
      const policyMetadata = withProvenanceMetadata(
        provenance,
        buildTaskMemoryAuditMetadata(request, taskMemoryConfig, {
          code: decision.code
        })
      );

      await recordLifecycleAudit({
        entityType: "TASK",
        entityId: task.id,
        actorRole: "ORCHESTRATOR",
        action: "MEMORY_RETRIEVAL_POLICY",
        fromState: task.status,
        toState: task.status,
        allowed: decision.allowed,
        reason: decision.reason,
        metadata: policyMetadata
      });
      if (!decision.allowed) {
        return {
          promptBlock: null,
          snippetCount: 0,
          code: decision.code
        };
      }

      try {
        let indexedRows;
        let promptHeader = "Memory snippets (thread-scoped, bounded):";
        if (request.scope === "PROJECT_SESSION") {
          const memories = await prisma.projectMemory.findMany({
            where: {
              projectSessionId: request.projectSessionId,
              status: { in: ["CAPTURED", "REVIEWED"] },
              OR: [
                { title: { contains: request.query, mode: "insensitive" } },
                { summary: { contains: request.query, mode: "insensitive" } },
                { content: { contains: request.query, mode: "insensitive" } }
              ]
            },
            orderBy: [{ updatedAt: "desc" }],
            take: request.documentLimit,
            select: {
              id: true,
              title: true,
              summary: true,
              content: true,
              createdAt: true,
              updatedAt: true
            }
          });
          indexedRows = buildProjectMemoryIndexRows(memories, {
            documentLimit: request.documentLimit,
            indexDocumentMaxChars: taskMemoryConfig.indexDocumentMaxChars
          });
          promptHeader = "Memory snippets (project-session durable memory, bounded):";
        } else {
          const messages = await prisma.chatMessage.findMany({
            where: { threadId: request.threadId },
            orderBy: { createdAt: "desc" },
            take: request.documentLimit,
            select: {
              id: true,
              authorType: true,
              content: true,
              createdAt: true
            }
          });
          indexedRows = buildTaskMemoryIndexRows(messages, {
            documentLimit: request.documentLimit,
            indexDocumentMaxChars: taskMemoryConfig.indexDocumentMaxChars
          });
        }
        const retrieval = retrieveTaskMemorySnippets({
          documents: indexedRows,
          query: request.query,
          maxSnippets: request.maxSnippets,
          snippetMaxChars: request.snippetMaxChars
        });
        const promptBlock = buildTaskMemoryPromptBlock(retrieval.snippets, promptHeader);
        const retrievalCode = retrieval.snippets.length
          ? "MEMORY_SNIPPETS_READY"
          : "MEMORY_NO_MATCH";

        await recordLifecycleAudit({
          entityType: "TASK",
          entityId: task.id,
          actorRole: "ORCHESTRATOR",
          action: "MEMORY_RETRIEVAL_EXECUTE",
          fromState: task.status,
          toState: task.status,
          allowed: true,
          reason:
            retrieval.snippets.length > 0
              ? `Retrieved ${retrieval.snippets.length} bounded memory snippet(s).`
              : "Memory retrieval completed with zero matches.",
          metadata: withProvenanceMetadata(
            provenance,
            buildTaskMemoryAuditMetadata(request, taskMemoryConfig, {
              code: retrievalCode,
              indexedCount: retrieval.indexedCount,
              matchedCount: retrieval.matchedCount,
              snippetCount: retrieval.snippets.length
            })
          )
        });

        return {
          promptBlock: promptBlock || null,
          snippetCount: retrieval.snippets.length,
          code: retrievalCode
        };
      } catch (error) {
        const reason = `Memory retrieval failed: ${shortError(error)}`;
        await recordLifecycleAudit({
          entityType: "TASK",
          entityId: task.id,
          actorRole: "ORCHESTRATOR",
          action: "MEMORY_RETRIEVAL_EXECUTE",
          fromState: task.status,
          toState: task.status,
          allowed: false,
          reason,
          metadata: withProvenanceMetadata(
            provenance,
            buildTaskMemoryAuditMetadata(request, taskMemoryConfig, {
              code: "MEMORY_RETRIEVAL_ERROR",
              error: shortError(error)
            })
          )
        });
        return {
          promptBlock: null,
          snippetCount: 0,
          code: "MEMORY_RETRIEVAL_ERROR"
        };
      }
    })();

    memoryPromptCache.set(cacheKey, pending);
    return pending;
  };

  const toolCallPolicyInput = readTaskToolCallPolicy(payloadRecord);
  const toolCallProtocolValidation = validateToolCallProtocolEnvelope(
    payloadRecord?.toolCallProtocol
  );
  if (toolCallProtocolValidation.present) {
    await recordLifecycleAudit({
      entityType: "TASK",
      entityId: task.id,
      actorRole: "ORCHESTRATOR",
      action: "TOOL_CALL_PROTOCOL_CONSUME",
      fromState: task.status,
      toState: task.status,
      allowed: toolCallProtocolValidation.ok,
      reason: toolCallProtocolValidation.reason,
      metadata: toolCallProtocolValidation.ok
        ? summarizeToolCallProtocolEnvelope(toolCallProtocolValidation.envelope)
        : { code: toolCallProtocolValidation.code }
    });
    if (!toolCallProtocolValidation.ok) {
      throw new WorkerTaskError("TOOL_CALL_INVALID", toolCallProtocolValidation.reason, false);
    }

    const policyEvaluation = evaluateToolCommandPolicy(toolCallProtocolValidation.envelope, {
      commandAccessEntries: readCommandAccessEntries()
    });
    await recordLifecycleAudit({
      entityType: "TASK",
      entityId: task.id,
      actorRole: "ORCHESTRATOR",
      action: "TOOL_COMMAND_POLICY_EVALUATE",
      fromState: task.status,
      toState: task.status,
      allowed: policyEvaluation.allowed,
      reason:
        policyEvaluation.denyReason ||
        policyEvaluation.approvalReason ||
        "Tool command policy evaluation passed.",
      metadata: {
        approvalTokenPresent: Boolean(readTaskToolCallApprovalToken(payloadRecord)),
        dryRun: toolCallPolicyInput.dryRun,
        ...summarizeToolCommandPolicyEvaluation(policyEvaluation)
      }
    });

    if (!policyEvaluation.allowed) {
      throw new WorkerTaskError(
        "TOOL_CALL_POLICY_DENIED",
        policyEvaluation.denyReason || "Tool command policy denied the action.",
        false
      );
    }

    const approvalPayload = await verifyAndConsumeToolCallApproval({
      task,
      envelope: toolCallProtocolValidation.envelope,
      policyEvaluation,
      payload: payloadRecord
    });
    const executionProvenance = {
      ...provenance,
      approvalTokenId: approvalPayload?.tokenId || null,
      approverUserId: approvalPayload?.approverUserId || null,
      approverEmail: approvalPayload?.approverEmail || null
    };

    return executeToolCallProtocol(
      task,
      config,
      toolCallProtocolValidation.envelope,
      policyEvaluation,
      toolCallPolicyInput.dryRun,
      executionProvenance,
      resolveMemoryPromptForQuery
    );
  }

  const fullThreadHistoryBlockPromise = (async () => {
    if (!task.threadId) return null;
    const messages = await prisma.chatMessage.findMany({
      where: { threadId: task.threadId },
      orderBy: { createdAt: "asc" },
      select: {
        authorType: true,
        authorKey: true,
        content: true,
        createdAt: true
      }
    });
    return buildFullThreadHistoryBlock(messages);
  })();

  if (agent.runtime === "LOCAL") {
    const memoryPromptResult = await resolveMemoryPromptForQuery();
    const fullHistory = await fullThreadHistoryBlockPromise;
    const runtimeResult = await runLocalRuntime(
      task,
      config,
      null,
      memoryPromptResult.promptBlock || null,
      fullHistory || null
    );
    return {
      ...runtimeResult,
      meta: mergeProvenanceResultMeta(runtimeResult.meta, provenance, {
        memorySnippets: memoryPromptResult.snippetCount,
        memoryCode: memoryPromptResult.code
      })
    };
  }
  if (agent.runtime === "CLOUD") {
    const memoryPromptResult = await resolveMemoryPromptForQuery();
    const fullHistory = await fullThreadHistoryBlockPromise;
    const runtimeResult = await runCloudRuntime(
      task,
      config,
      null,
      memoryPromptResult.promptBlock || null,
      fullHistory || null
    );
    return {
      ...runtimeResult,
      meta: mergeProvenanceResultMeta(runtimeResult.meta, provenance, {
        memorySnippets: memoryPromptResult.snippetCount,
        memoryCode: memoryPromptResult.code
      })
    };
  }
  throw new WorkerTaskError(
    "CONFIG_MISSING",
    `No runtime executor configured for runtime "${agent.runtime}".`,
    false
  );
}

async function processTask(task) {
  const agentKey = task.agentKey;
  const title = task.title;
  const { maxAttempts, attemptCount } = normalizeTaskLimits(task);
  const driftGuard = await enforceBoardRuntimeDriftGuard(task);
  if (!driftGuard.allowed) return;
  const sourcePayloadRecord = asRecord(task.payload);
  const sourceProvenance = readTaskProvenance(sourcePayloadRecord, task);
  const sourceNbaApproval = readTaskNbaApproval(sourcePayloadRecord);

  await postMessage(
    task.threadId,
    "AGENT",
    agentKey,
    `Ack. Working on: ${title}`,
    { kind: "worker_ack", taskId: task.id }
  );

  try {
    const result = await executeTask(task);
    const safeResultAnswer = redactSensitiveOutput(result.answer, "task_result").text;

    let capturedMemoryId = null;
    await withLeaseAuthority(`complete-task:${task.id}`, async (tx) => {
      const current = await tx.agentTask.findUnique({
        where: { id: task.id },
        select: { status: true }
      });
      if (!current) {
        throw new WorkerTaskError(
          "TRANSITION_DENIED",
          `Completion denied: task ${task.id} not found.`,
          false
        );
      }
      const decision = evaluateOrchestratorTaskTransition(
        "COMPLETE_TASK",
        current.status,
        "DONE"
      );
      if (!decision.allowed) {
        await recordLifecycleAudit(
          {
            entityType: "TASK",
            entityId: task.id,
            actorRole: "ORCHESTRATOR",
            action: "COMPLETE_TASK",
            fromState: current.status,
            toState: "DONE",
            allowed: false,
            reason: decision.reason
          },
          tx
        );
        throw new WorkerTaskError("TRANSITION_DENIED", decision.reason, false);
      }

      const doneMessage = await postMessage(task.threadId, "AGENT", agentKey, safeResultAnswer, {
        kind: "worker_done",
        taskId: task.id,
        ...result.meta
      }, tx);

      const payloadRecord = asRecord(task.payload);
      const memoryRecord = await captureProjectMemoryRecord(
        {
          projectSessionId:
            payloadRecord && typeof payloadRecord.projectSessionId === "string"
              ? payloadRecord.projectSessionId
              : null,
          threadId: task.threadId,
          taskId: task.id,
          sourceMessageId: doneMessage?.id || null,
          title: task.title,
          answer: safeResultAnswer,
          agentKey,
          model: result.meta?.model || null
        },
        tx
      );
      if (memoryRecord?.id) {
        capturedMemoryId = memoryRecord.id;
      }

      await routeAgentHandoffs({
        requestedByAgent: agentKey,
        requestedByRole: task.agent?.controlRole || "BETA",
        sourceThreadId: task.threadId,
        sourceMessageId: doneMessage?.id || null,
        sourceContent: safeResultAnswer,
        sourceTaskId: task.id,
        sourceTaskTitle: task.title,
        issueNumber: task.issueNumber,
        sourceProvenance,
        sourceNbaApproval,
        db: tx
      });

      await tx.agentTask.update({
        where: { id: task.id },
        data: {
          status: "DONE",
          finishedAt: new Date(),
          error: null,
          lastFailureCode: null,
          lastFailureKind: null,
          deadLetteredAt: null,
          nextAttemptAt: new Date()
        }
      });
      await recordLifecycleAudit(
        {
          entityType: "TASK",
          entityId: task.id,
          actorRole: "ORCHESTRATOR",
          action: "COMPLETE_TASK",
          fromState: current.status,
          toState: "DONE",
          allowed: true,
          reason: decision.reason,
          metadata: {
            projectSessionId:
              payloadRecord && typeof payloadRecord.projectSessionId === "string"
                ? payloadRecord.projectSessionId
                : null,
            memoryCaptured: Boolean(memoryRecord),
            projectMemoryId: memoryRecord?.id || null
          }
        },
        tx
      );
      await postMessage(
        task.threadId,
        "SYSTEM",
        null,
        buildRunJudgementContent({
          outcome: "DONE",
          agentKey,
          provider: result.meta?.provider || null,
          model: result.meta?.model || null,
          durationMs: result.meta?.durationMs ?? null,
          doneReason: result.meta?.doneReason || null,
          grounded: result.meta?.grounded === true,
          memoryCaptured: Boolean(memoryRecord)
        }),
        buildRunJudgementMeta({
          taskId: task.id,
          outcome: "DONE",
          agentKey,
          provider: result.meta?.provider || null,
          model: result.meta?.model || null,
          durationMs: result.meta?.durationMs ?? null,
          doneReason: result.meta?.doneReason || null,
          grounded: result.meta?.grounded === true,
          memoryCaptured: Boolean(memoryRecord)
        }),
        tx
      );
      const finalJudgement = computeFinalJudgement({
        outcome: "DONE",
        meta: result.meta,
        failure: null
      });
      await recordFinalJudgement(task, agentKey, finalJudgement, tx);
    });
    if (capturedMemoryId) {
      void maybeEmbedProjectMemory(
        capturedMemoryId,
        `${task.title}\n${safeResultAnswer}`
      );
    }
    await publishRuntimeIssueEvidence({
      task,
      outcome: "DONE",
      resultMeta: result.meta,
      resultAnswer: safeResultAnswer,
      attemptCount: attemptCount + 1,
      maxAttempts
    });
  } catch (e) {
    const failure = normalizeFailure(e);
    if (failure.code === "LEASE_NOT_HELD" || failure.code === "TRANSITION_DENIED") {
      console.warn(
        `[sovereign-worker] skipped task completion mutation for ${task.id}: ${failure.message}`
      );
      return;
    }
    const nextAttemptCount = attemptCount + 1;
    if (failure.code === "TASK_CANCELED") {
      let alreadyCanceled = false;
      let cancellationWasInterrupt = false;
      await withLeaseAuthority(`cancel-task:${task.id}`, async (tx) => {
        const current = await tx.agentTask.findUnique({
          where: { id: task.id },
          select: { status: true, payload: true }
        });
        if (!current) {
          throw new WorkerTaskError(
            "TRANSITION_DENIED",
            `Cancel denied: task ${task.id} not found.`,
            false
          );
        }
        const currentPayload = asRecord(current.payload);
        const taskControl = asRecord(currentPayload?.taskControl);
        const controlState = asRecord(taskControl?.state);
        cancellationWasInterrupt =
          String(controlState?.lastAction || "").toUpperCase() === "INTERRUPT";

        if (current.status === "CANCELED") {
          alreadyCanceled = true;
          await recordLifecycleAudit(
            {
              entityType: "TASK",
              entityId: task.id,
              actorRole: "ORCHESTRATOR",
              action: "CANCEL_TASK",
              fromState: current.status,
              toState: "CANCELED",
              allowed: true,
              reason: "Task was already canceled by operator control path."
            },
            tx
          );
          return;
        }
        const decision = evaluateOrchestratorTaskTransition(
          "CANCEL_TASK",
          current.status,
          "CANCELED"
        );
        if (!decision.allowed) {
          await recordLifecycleAudit(
            {
              entityType: "TASK",
              entityId: task.id,
              actorRole: "ORCHESTRATOR",
              action: "CANCEL_TASK",
              fromState: current.status,
              toState: "CANCELED",
              allowed: false,
              reason: decision.reason
            },
            tx
          );
          throw new WorkerTaskError("TRANSITION_DENIED", decision.reason, false);
        }

        await postMessage(
          task.threadId,
          "SYSTEM",
          null,
          cancellationWasInterrupt
            ? `Task interrupted for @${agentKey}: ${failure.message} (code=${failure.code}). Resume is allowed.`
            : `Task canceled for @${agentKey}: ${failure.message} (code=${failure.code}).`,
          {
            kind: cancellationWasInterrupt ? "worker_interrupted" : "worker_canceled",
            taskId: task.id,
            error: failure.message,
            resumeAllowed: cancellationWasInterrupt,
            ...failureMeta(failure, nextAttemptCount, maxAttempts)
          },
          tx
        );
        await tx.agentTask.update({
          where: { id: task.id },
          data: {
            status: "CANCELED",
            attemptCount: nextAttemptCount,
            finishedAt: new Date(),
            error: formatFailureMessage(failure),
            lastFailureCode: failure.code,
            lastFailureKind: failure.kind,
            deadLetteredAt: null,
            nextAttemptAt: new Date()
          }
        });
        await recordLifecycleAudit(
          {
            entityType: "TASK",
            entityId: task.id,
            actorRole: "ORCHESTRATOR",
            action: "CANCEL_TASK",
            fromState: current.status,
            toState: "CANCELED",
            allowed: true,
            reason: decision.reason
          },
          tx
        );
        const canceledJudgement = computeFinalJudgement({
          outcome: "CANCELED",
          meta: null,
          failure
        });
        await recordFinalJudgement(task, agentKey, canceledJudgement, tx);
      });
      await publishRuntimeIssueEvidence({
        task,
        outcome: "CANCELED",
        failureMessage: cancellationWasInterrupt
          ? `Interrupted: ${failure.message}`
          : failure.message,
        attemptCount: alreadyCanceled ? attemptCount : nextAttemptCount,
        maxAttempts
      });
      return;
    }
    const canRetry = failure.retryable && nextAttemptCount < maxAttempts;
    if (canRetry) {
      const delayMs = computeRetryDelayMs(nextAttemptCount);
      const nextAttemptAt = new Date(Date.now() + delayMs);
      await withLeaseAuthority(`retry-task:${task.id}`, async (tx) => {
        const current = await tx.agentTask.findUnique({
          where: { id: task.id },
          select: { status: true }
        });
        if (!current) {
          throw new WorkerTaskError(
            "TRANSITION_DENIED",
            `Retry denied: task ${task.id} not found.`,
            false
          );
        }
        const decision = evaluateOrchestratorTaskTransition(
          "RETRY_TASK",
          current.status,
          "QUEUED"
        );
        if (!decision.allowed) {
          await recordLifecycleAudit(
            {
              entityType: "TASK",
              entityId: task.id,
              actorRole: "ORCHESTRATOR",
              action: "RETRY_TASK",
              fromState: current.status,
              toState: "QUEUED",
              allowed: false,
              reason: decision.reason
            },
            tx
          );
          throw new WorkerTaskError("TRANSITION_DENIED", decision.reason, false);
        }

        await postMessage(
          task.threadId,
          "SYSTEM",
          null,
          `Task failed for @${agentKey}: ${failure.message} (code=${failure.code}). Retry ${nextAttemptCount}/${maxAttempts} in ${Math.ceil(delayMs / 1000)}s.`,
          {
            kind: "worker_retry_scheduled",
            taskId: task.id,
            error: failure.message,
            ...failureMeta(failure, nextAttemptCount, maxAttempts),
            nextAttemptAt: nextAttemptAt.toISOString()
          },
          tx
        );
        await postMessage(
          task.threadId,
          "SYSTEM",
          null,
          buildRunJudgementContent({
            outcome: "RETRY_SCHEDULED",
            agentKey,
            code: failure.code
          }),
          buildRunJudgementMeta({
            taskId: task.id,
            outcome: "RETRY_SCHEDULED",
            agentKey,
            code: failure.code
          }),
          tx
        );
        await tx.agentTask.update({
          where: { id: task.id },
          data: {
            status: "QUEUED",
            attemptCount: nextAttemptCount,
            error: formatFailureMessage(failure),
            lastFailureCode: failure.code,
            lastFailureKind: failure.kind,
            nextAttemptAt,
            finishedAt: null
          }
        });
        await recordLifecycleAudit(
          {
            entityType: "TASK",
            entityId: task.id,
            actorRole: "ORCHESTRATOR",
            action: "RETRY_TASK",
            fromState: current.status,
            toState: "QUEUED",
            allowed: true,
            reason: decision.reason
          },
          tx
        );
      });
      return;
    }

    await withLeaseAuthority(`dead-letter-task:${task.id}`, async (tx) => {
      const current = await tx.agentTask.findUnique({
        where: { id: task.id },
        select: { status: true }
      });
      if (!current) {
        throw new WorkerTaskError(
          "TRANSITION_DENIED",
          `Dead-letter denied: task ${task.id} not found.`,
          false
        );
      }
      const decision = evaluateOrchestratorTaskTransition(
        "DEAD_LETTER_TASK",
        current.status,
        "DEAD_LETTER"
      );
      if (!decision.allowed) {
        await recordLifecycleAudit(
          {
            entityType: "TASK",
            entityId: task.id,
            actorRole: "ORCHESTRATOR",
            action: "DEAD_LETTER_TASK",
            fromState: current.status,
            toState: "DEAD_LETTER",
            allowed: false,
            reason: decision.reason
          },
          tx
        );
        throw new WorkerTaskError("TRANSITION_DENIED", decision.reason, false);
      }

      await postMessage(
        task.threadId,
        "SYSTEM",
        null,
        `Task moved to dead-letter for @${agentKey}: ${failure.message} (code=${failure.code}, attempts=${nextAttemptCount}/${maxAttempts}).`,
        {
          kind: "worker_dead_letter",
          taskId: task.id,
          error: failure.message,
          ...failureMeta(failure, nextAttemptCount, maxAttempts)
        },
        tx
      );
      await postMessage(
        task.threadId,
        "SYSTEM",
        null,
        buildRunJudgementContent({
          outcome: "DEAD_LETTER",
          agentKey,
          code: failure.code
        }),
        buildRunJudgementMeta({
          taskId: task.id,
          outcome: "DEAD_LETTER",
          agentKey,
          code: failure.code
        }),
        tx
      );
      const deadLetterJudgement = computeFinalJudgement({
        outcome: "DEAD_LETTER",
        meta: null,
        failure
      });
      await recordFinalJudgement(task, agentKey, deadLetterJudgement, tx);
      await tx.agentTask.update({
        where: { id: task.id },
        data: {
          status: "DEAD_LETTER",
          attemptCount: nextAttemptCount,
          finishedAt: new Date(),
          deadLetteredAt: new Date(),
          error: formatFailureMessage(failure),
          lastFailureCode: failure.code,
          lastFailureKind: failure.kind
        }
      });
      await recordLifecycleAudit(
        {
          entityType: "TASK",
          entityId: task.id,
          actorRole: "ORCHESTRATOR",
          action: "DEAD_LETTER_TASK",
          fromState: current.status,
          toState: "DEAD_LETTER",
          allowed: true,
          reason: decision.reason
        },
        tx
      );
      await recordAlphaFailureEvent(
        {
          failureClass: "EXECUTION_RETRY_EXHAUSTED",
          issueNumber: task.issueNumber ?? null,
          taskId: task.id,
          threadId: task.threadId || null,
          metadata: {
            agentKey,
            code: failure.code,
            attempts: {
              current: nextAttemptCount,
              max: maxAttempts
            }
          }
        },
        tx
      );
    });
    await publishRuntimeIssueEvidence({
      task,
      outcome: "DEAD_LETTER",
      failureMessage: failure.message,
      attemptCount: nextAttemptCount,
      maxAttempts
    });
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function requestShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`[sovereign-worker] received ${signal}; draining loop and releasing lease.`);
}

process.on("SIGINT", () => requestShutdown("SIGINT"));
process.on("SIGTERM", () => requestShutdown("SIGTERM"));

async function loop() {
  if (!RAW_AGENT_KEY) {
    throw new Error(
      "SOVEREIGN_WORKER_AGENT_KEY or SENTINELSQUAD_WORKER_AGENT_KEY is required for control-plane worker startup and must reference an ALPHA agent."
    );
  }
  WORKER_AGENT_KEY = await resolveCanonicalAgentKey(RAW_AGENT_KEY);
  const roleRow = await prisma.agent.findUnique({
    where: { key: WORKER_AGENT_KEY },
    select: { controlRole: true }
  });
  WORKER_CONTROL_ROLE = roleRow?.controlRole || null;
  if (WORKER_CONTROL_ROLE !== "ALPHA") {
    throw new Error(
      `Agent @${WORKER_AGENT_KEY} role is ${WORKER_CONTROL_ROLE || "unknown"}. Only ALPHA can run orchestrator worker.`
    );
  }
  CLAIM_ALL_TASKS = true;

  await ensureLeaseRow();
  console.log(
    `[sovereign-worker] started. agent=${WORKER_AGENT_KEY || "ANY"} role=${WORKER_CONTROL_ROLE || "UNSCOPED"} claimScope=${CLAIM_ALL_TASKS ? "ALL" : "FILTERED"} poll=${POLL_MS}ms owner=${ORCHESTRATOR_OWNER_ID} lease=${ORCHESTRATOR_LEASE_ID}`
  );
  let lastRecoveryMs = 0;
  for (; !isShuttingDown;) {
    try {
      const held = await maintainOrchestratorLease("loop-tick");
      await heartbeat(WORKER_AGENT_KEY, {
        leaseId: ORCHESTRATOR_LEASE_ID,
        leaseOwnerId: held ? ORCHESTRATOR_OWNER_ID : null,
        leaseHeld: held
      });

      if (!held) {
        await sleep(POLL_MS);
        continue;
      }

      const nowMs = Date.now();
      if (nowMs - lastRecoveryMs >= Math.max(ORCHESTRATOR_STALE_RUNNING_MS, 5000)) {
        const recovered = await recoverStaleRunningTasks();
        if (recovered > 0) {
          console.log(`[sovereign-worker] recovered ${recovered} stale running task(s).`);
        }
        lastRecoveryMs = nowMs;
      }

      const task = await claimNextTask(CLAIM_ALL_TASKS ? null : WORKER_AGENT_KEY);
      if (!task) {
        await sleep(POLL_MS);
        continue;
      }
      console.log(`[sovereign-worker] claimed ${task.id} agent=${task.agentKey}`);

      const renewIntervalMs = Math.max(Math.floor(ORCHESTRATOR_LEASE_TTL_MS / 3), 1000);
      const renewTimer = setInterval(() => {
        if (isShuttingDown) return;
        void maintainOrchestratorLease("task-heartbeat").catch((err) => {
          console.error("[sovereign-worker] lease heartbeat failed", err);
        });
      }, renewIntervalMs);

      try {
        await processTask(task);
      } finally {
        clearInterval(renewTimer);
      }
    } catch (e) {
      console.error("[sovereign-worker] error", e);
      await sleep(POLL_MS);
    }
  }
}

loop()
  .catch((e) => {
    console.error("[sovereign-worker] fatal", e);
  })
  .finally(async () => {
    try {
      await releaseOrchestratorLease("worker-exit");
    } catch (e) {
      console.error("[sovereign-worker] release failed", e);
    }
    await prisma.$disconnect();
  });
