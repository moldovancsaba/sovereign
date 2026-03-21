const fsp = require("node:fs/promises");
const path = require("node:path");
const { spawn } = require("node:child_process");

const DEFAULT_TIMEOUT_MS = 20_000;
const MAX_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_OUTPUT_BYTES = 256 * 1024;
const MAX_OUTPUT_BYTES = 2 * 1024 * 1024;
const DEFAULT_MAX_COMMAND_CHARS = 8_000;
const MAX_COMMAND_CHARS = 64_000;
const DEFAULT_CANCEL_POLL_MS = 500;
const DEFAULT_KILL_GRACE_MS = 1_500;
const DEFAULT_MAX_CPU_SECONDS = 30;
const DEFAULT_MAX_MEMORY_KB = 1_048_576;
const DEFAULT_MAX_PROCESS_COUNT = 0;
const DEFAULT_SHELL_BINARY = "/bin/sh";
const OUTPUT_PREVIEW_LIMIT = 1200;

const BASE_ENV_ALLOWLIST = [
  "PATH",
  "HOME",
  "USER",
  "LOGNAME",
  "SHELL",
  "TMPDIR",
  "TEMP",
  "TMP",
  "LANG",
  "LC_ALL",
  "TERM",
  "COLORTERM",
  "NO_COLOR",
  "CI",
  "PWD"
];

class ToolShellError extends Error {
  constructor(code, message, metadata = {}) {
    super(message);
    this.name = "ToolShellError";
    this.code = code;
    this.metadata = metadata;
  }
}

function asRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value;
}

function asTrimmed(value) {
  return typeof value === "string" ? value.trim() : "";
}

function clampInt(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(Math.trunc(n), min), max);
}

function unique(values) {
  return Array.from(new Set(values));
}

function parseKeyList(raw) {
  if (!raw || typeof raw !== "string") return [];
  return raw
    .split(/[,\s:]+/)
    .map((entry) => entry.trim().toUpperCase())
    .filter(Boolean);
}

function isWithinPath(candidate, root) {
  const rel = path.relative(root, candidate);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

function trimPreview(text, max = OUTPUT_PREVIEW_LIMIT) {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max)}...`;
}

async function ensureWorkspaceRoots(workspaceRootsInput) {
  if (!Array.isArray(workspaceRootsInput) || !workspaceRootsInput.length) {
    throw new ToolShellError(
      "WORKSPACE_UNAVAILABLE",
      "Shell runtime requires at least one configured workspace root."
    );
  }
  const roots = [];
  for (const root of workspaceRootsInput) {
    const candidate = asTrimmed(root);
    if (!candidate) continue;
    const resolved = path.resolve(candidate);
    const stat = await fsp.stat(resolved).catch(() => null);
    if (!stat || !stat.isDirectory()) continue;
    const real = await fsp.realpath(resolved).catch(() => null);
    if (real) roots.push(real);
  }
  const normalized = unique(roots);
  if (!normalized.length) {
    throw new ToolShellError(
      "WORKSPACE_UNAVAILABLE",
      "Shell runtime could not validate workspace roots."
    );
  }
  return normalized;
}

async function resolveWorkspaceCwd(workspaceRoots, candidatePath, operation) {
  const resolvedCandidate = path.resolve(candidatePath);
  const lexicalRoots = workspaceRoots.filter((root) => isWithinPath(resolvedCandidate, root));
  if (!lexicalRoots.length) {
    throw new ToolShellError(
      "OUTSIDE_WORKSPACE",
      `${operation} denied: cwd resolves outside configured workspace roots.`,
      { candidatePath: resolvedCandidate }
    );
  }

  const stat = await fsp.stat(resolvedCandidate).catch(() => null);
  if (!stat) {
    throw new ToolShellError(
      "CWD_NOT_FOUND",
      `${operation} denied: cwd does not exist.`,
      { candidatePath: resolvedCandidate }
    );
  }
  if (!stat.isDirectory()) {
    throw new ToolShellError(
      "CWD_NOT_DIRECTORY",
      `${operation} denied: cwd must be a directory.`,
      { candidatePath: resolvedCandidate }
    );
  }

  const real = await fsp.realpath(resolvedCandidate).catch(() => null);
  if (!real) {
    throw new ToolShellError(
      "CWD_INVALID",
      `${operation} denied: failed to resolve cwd.`,
      { candidatePath: resolvedCandidate }
    );
  }
  const root = workspaceRoots.find((entry) => isWithinPath(real, entry));
  if (!root) {
    throw new ToolShellError(
      "SYMLINK_ESCAPE",
      `${operation} denied: cwd symlink escapes workspace boundary.`,
      { candidatePath: resolvedCandidate, resolvedPath: real }
    );
  }
  return {
    cwd: real,
    workspaceRoot: root,
    relativeCwd: path.relative(root, real) || "."
  };
}

function buildResourceLimits(env) {
  return {
    defaultTimeoutMs: clampInt(
      env.SENTINELSQUAD_SHELL_DEFAULT_TIMEOUT_MS,
      DEFAULT_TIMEOUT_MS,
      500,
      MAX_TIMEOUT_MS
    ),
    maxTimeoutMs: clampInt(env.SENTINELSQUAD_SHELL_MAX_TIMEOUT_MS, MAX_TIMEOUT_MS, 1_000, 600_000),
    maxOutputBytes: clampInt(
      env.SENTINELSQUAD_SHELL_MAX_OUTPUT_BYTES,
      DEFAULT_MAX_OUTPUT_BYTES,
      4_096,
      MAX_OUTPUT_BYTES
    ),
    maxCommandChars: clampInt(
      env.SENTINELSQUAD_SHELL_MAX_COMMAND_CHARS,
      DEFAULT_MAX_COMMAND_CHARS,
      64,
      MAX_COMMAND_CHARS
    ),
    cancelPollMs: clampInt(env.SENTINELSQUAD_SHELL_CANCEL_POLL_MS, DEFAULT_CANCEL_POLL_MS, 100, 5_000),
    killGraceMs: clampInt(env.SENTINELSQUAD_SHELL_KILL_GRACE_MS, DEFAULT_KILL_GRACE_MS, 200, 10_000),
    maxCpuSeconds: clampInt(env.SENTINELSQUAD_SHELL_MAX_CPU_SECONDS, DEFAULT_MAX_CPU_SECONDS, 1, 3600),
    maxMemoryKb: clampInt(
      env.SENTINELSQUAD_SHELL_MAX_MEMORY_KB,
      DEFAULT_MAX_MEMORY_KB,
      65_536,
      8_388_608
    ),
    maxProcessCount: clampInt(
      env.SENTINELSQUAD_SHELL_MAX_PROCESS_COUNT,
      DEFAULT_MAX_PROCESS_COUNT,
      0,
      4096
    ),
    shellBinary: asTrimmed(env.SENTINELSQUAD_SHELL_BINARY) || DEFAULT_SHELL_BINARY
  };
}

function buildAllowedEnvKeys(env) {
  const extra = parseKeyList(env.SENTINELSQUAD_SHELL_ENV_ALLOWLIST);
  return unique([...BASE_ENV_ALLOWLIST, ...extra]);
}

async function resolveShellToolContext(options = {}) {
  const env = options.env || process.env;
  const workspaceRoots = await ensureWorkspaceRoots(options.workspaceRoots);
  const primaryWorkspaceRoot = workspaceRoots[0];
  const defaultCwdInput = asTrimmed(options.defaultCwd) || primaryWorkspaceRoot;
  const cwdInfo = await resolveWorkspaceCwd(
    workspaceRoots,
    defaultCwdInput,
    "shell.exec context initialization"
  );

  const sessionId = asTrimmed(options.sessionId) || `task-${Date.now().toString(36)}`;
  const sessionRootBase =
    asTrimmed(options.sessionRootBase) ||
    asTrimmed(env.SENTINELSQUAD_SHELL_SESSION_ROOT) ||
    path.join(process.cwd(), ".sentinelsquad", "shell-sessions");
  const sessionRoot = path.resolve(sessionRootBase, sessionId);
  await fsp.mkdir(sessionRoot, { recursive: true });

  return {
    sessionId,
    sessionRoot,
    workspaceRoots,
    primaryWorkspaceRoot,
    currentCwd: cwdInfo.cwd,
    inheritFullProcessEnv: options.inheritFullProcessEnv === true,
    allowedEnvKeys: buildAllowedEnvKeys(env),
    limits: buildResourceLimits(env)
  };
}

function readCommand(call) {
  const args = asRecord(call?.args) || {};
  const command = asTrimmed(args.command) || asTrimmed(args.cmd);
  if (!command) {
    throw new ToolShellError(
      "COMMAND_REQUIRED",
      "shell.exec requires args.command (or args.cmd) to be a non-empty string."
    );
  }
  return command;
}

function readCommandLimits(call, context) {
  const args = asRecord(call?.args) || {};
  const requestedTimeout = args.timeoutMs;
  const timeoutMs = clampInt(
    requestedTimeout,
    context.limits.defaultTimeoutMs,
    500,
    context.limits.maxTimeoutMs
  );
  return {
    timeoutMs,
    maxOutputBytes: context.limits.maxOutputBytes,
    maxCommandChars: context.limits.maxCommandChars
  };
}

function buildChildEnv(call, context, parentEnv) {
  const args = asRecord(call?.args) || {};
  const childEnv = {};
  if (context.inheritFullProcessEnv) {
    for (const [key, value] of Object.entries(parentEnv || {})) {
      if (value != null) childEnv[key] = String(value);
    }
  } else {
    for (const key of context.allowedEnvKeys) {
      if (Object.prototype.hasOwnProperty.call(parentEnv, key) && parentEnv[key] != null) {
        childEnv[key] = String(parentEnv[key]);
      }
    }
  }

  const overrides = asRecord(args.env);
  if (!overrides) return childEnv;
  const keys = Object.keys(overrides);
  if (keys.length > 64) {
    throw new ToolShellError(
      "ENV_LIMIT_EXCEEDED",
      "shell.exec denied: args.env may include at most 64 keys."
    );
  }
  for (const key of keys) {
    if (!/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(key)) {
      throw new ToolShellError(
        "ENV_KEY_INVALID",
        `shell.exec denied: invalid env key "${key}".`
      );
    }
    const value = overrides[key];
    if (value == null) continue;
    childEnv[key] = String(value).slice(0, 4096);
  }
  return childEnv;
}

function buildShellScript(command, limits) {
  const prelude = [];
  if (limits.maxCpuSeconds > 0) {
    prelude.push(`ulimit -t ${limits.maxCpuSeconds} >/dev/null 2>&1 || true`);
  }
  if (limits.maxMemoryKb > 0) {
    prelude.push(`ulimit -v ${limits.maxMemoryKb} >/dev/null 2>&1 || true`);
  }
  if (limits.maxProcessCount > 0) {
    prelude.push(`ulimit -u ${limits.maxProcessCount} >/dev/null 2>&1 || true`);
  }
  prelude.push(command);
  return prelude.join("; ");
}

function finalizeOutput(buffers, truncated) {
  const text = Buffer.concat(buffers).toString("utf8");
  return {
    text,
    preview: trimPreview(text),
    truncated
  };
}

function emitOutputChunk(options, payload) {
  if (typeof options?.onOutput !== "function") return;
  try {
    options.onOutput(payload);
  } catch {
    // Streaming callback errors must not crash shell execution.
  }
}

function mapShellErrorCode(code) {
  if (code === "TASK_CANCELED") return code;
  if (code === "TIMEOUT") return code;
  if (code === "OUTPUT_LIMIT_EXCEEDED") return code;
  if (code === "EXIT_NON_ZERO") return code;
  return "EXECUTION_ERROR";
}

async function executeShellToolCall(call, context, options = {}) {
  if (!context || !Array.isArray(context.workspaceRoots) || !context.workspaceRoots.length) {
    throw new ToolShellError(
      "WORKSPACE_UNAVAILABLE",
      "shell.exec denied: workspace context is unavailable."
    );
  }

  const command = readCommand(call);
  const commandLimits = readCommandLimits(call, context);
  if (command.length > commandLimits.maxCommandChars) {
    throw new ToolShellError(
      "COMMAND_TOO_LONG",
      `shell.exec denied: command length exceeds ${commandLimits.maxCommandChars} characters.`,
      { maxCommandChars: commandLimits.maxCommandChars, commandLength: command.length }
    );
  }

  const args = asRecord(call?.args) || {};
  const cwdInput = asTrimmed(args.cwd);
  const baseCwd = context.currentCwd || context.primaryWorkspaceRoot;
  const requestedCwd = cwdInput
    ? path.isAbsolute(cwdInput)
      ? path.resolve(cwdInput)
      : path.resolve(baseCwd, cwdInput)
    : baseCwd;
  const cwdInfo = await resolveWorkspaceCwd(context.workspaceRoots, requestedCwd, "shell.exec");

  const parentEnv = options.parentEnv || process.env;
  const childEnv = buildChildEnv(call, context, parentEnv);
  const script = buildShellScript(command, context.limits);

  const stdoutBuffers = [];
  const stderrBuffers = [];
  let stdoutBytes = 0;
  let stderrBytes = 0;
  let totalBytes = 0;
  let stdoutTruncated = false;
  let stderrTruncated = false;
  let terminated = false;
  let timedOut = false;
  let canceled = false;
  let outputLimitExceeded = false;
  const startedAt = Date.now();

  const child = spawn(context.limits.shellBinary, ["-lc", script], {
    cwd: cwdInfo.cwd,
    env: childEnv,
    stdio: ["ignore", "pipe", "pipe"]
  });

  const stopProcess = (reasonCode) => {
    if (terminated) return;
    terminated = true;
    if (reasonCode === "TIMEOUT") timedOut = true;
    if (reasonCode === "TASK_CANCELED") canceled = true;
    if (reasonCode === "OUTPUT_LIMIT_EXCEEDED") outputLimitExceeded = true;
    child.kill("SIGTERM");
    setTimeout(() => {
      if (child.exitCode == null && child.signalCode == null) {
        child.kill("SIGKILL");
      }
    }, context.limits.killGraceMs).unref();
  };

  const appendChunk = (streamName, chunk) => {
    if (outputLimitExceeded) return;
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk || ""));
    if (buf.length === 0) return;
    const remaining = commandLimits.maxOutputBytes - totalBytes;
    if (remaining <= 0) {
      if (streamName === "stdout") stdoutTruncated = true;
      if (streamName === "stderr") stderrTruncated = true;
      stopProcess("OUTPUT_LIMIT_EXCEEDED");
      return;
    }
    const accepted = buf.length <= remaining ? buf : buf.subarray(0, remaining);
    if (streamName === "stdout") {
      stdoutBuffers.push(accepted);
      stdoutBytes += accepted.length;
      if (accepted.length < buf.length) stdoutTruncated = true;
    } else {
      stderrBuffers.push(accepted);
      stderrBytes += accepted.length;
      if (accepted.length < buf.length) stderrTruncated = true;
    }
    totalBytes += accepted.length;
    if (accepted.length > 0) {
      emitOutputChunk(options, {
        stream: streamName,
        text: accepted.toString("utf8"),
        bytes: accepted.length,
        totalBytes,
        truncated: accepted.length < buf.length
      });
    }
    if (accepted.length < buf.length) {
      stopProcess("OUTPUT_LIMIT_EXCEEDED");
    }
  };

  child.stdout.on("data", (chunk) => appendChunk("stdout", chunk));
  child.stderr.on("data", (chunk) => appendChunk("stderr", chunk));

  let cancelInterval = null;
  if (typeof options.shouldCancel === "function") {
    let checking = false;
    cancelInterval = setInterval(() => {
      if (checking || terminated) return;
      checking = true;
      Promise.resolve(options.shouldCancel())
        .then((shouldCancel) => {
          if (shouldCancel) stopProcess("TASK_CANCELED");
        })
        .catch(() => {
          // Ignore cancel-check probe failures and continue command execution.
        })
        .finally(() => {
          checking = false;
        });
    }, clampInt(options.cancelPollMs, context.limits.cancelPollMs, 100, 10_000));
    cancelInterval.unref();
  }

  const timeoutTimer = setTimeout(() => {
    stopProcess("TIMEOUT");
  }, commandLimits.timeoutMs);
  timeoutTimer.unref();

  const exitInfo = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => resolve({ code, signal }));
  }).finally(() => {
    clearTimeout(timeoutTimer);
    if (cancelInterval) clearInterval(cancelInterval);
  });

  const stdout = finalizeOutput(stdoutBuffers, stdoutTruncated);
  const stderr = finalizeOutput(stderrBuffers, stderrTruncated);
  const durationMs = Date.now() - startedAt;
  const metadata = {
    sessionId: context.sessionId,
    sessionRoot: context.sessionRoot,
    cwd: cwdInfo.cwd,
    workspaceRoot: cwdInfo.workspaceRoot,
    relativeCwd: cwdInfo.relativeCwd,
    command: trimPreview(command, 4000),
    timeoutMs: commandLimits.timeoutMs,
    durationMs,
    exitCode: Number.isInteger(exitInfo.code) ? exitInfo.code : null,
    signal: exitInfo.signal || null,
    stdoutBytes,
    stderrBytes,
    outputBytes: totalBytes,
    stdoutTruncated: stdout.truncated,
    stderrTruncated: stderr.truncated,
    timedOut,
    canceled,
    outputLimitExceeded,
    resourceLimits: {
      maxCpuSeconds: context.limits.maxCpuSeconds,
      maxMemoryKb: context.limits.maxMemoryKb,
      maxProcessCount: context.limits.maxProcessCount,
      maxOutputBytes: commandLimits.maxOutputBytes
    },
    stdoutPreview: stdout.preview || null,
    stderrPreview: stderr.preview || null
  };

  if (canceled) {
    throw new ToolShellError(
      mapShellErrorCode("TASK_CANCELED"),
      "shell.exec canceled because task status changed to CANCELED.",
      metadata
    );
  }
  if (timedOut) {
    throw new ToolShellError(
      mapShellErrorCode("TIMEOUT"),
      `shell.exec timed out after ${commandLimits.timeoutMs}ms.`,
      metadata
    );
  }
  if (outputLimitExceeded) {
    throw new ToolShellError(
      mapShellErrorCode("OUTPUT_LIMIT_EXCEEDED"),
      `shell.exec output exceeded ${commandLimits.maxOutputBytes} bytes and was terminated.`,
      metadata
    );
  }
  if (!Number.isInteger(exitInfo.code) || exitInfo.code !== 0) {
    const failurePreview = stderr.preview || stdout.preview || "no output";
    throw new ToolShellError(
      mapShellErrorCode("EXIT_NON_ZERO"),
      `shell.exec exited with code ${exitInfo.code ?? "unknown"} (${failurePreview}).`,
      metadata
    );
  }

  context.currentCwd = cwdInfo.cwd;
  return {
    answer:
      `shell.exec cwd=${cwdInfo.relativeCwd} exit=0 stdout=${stdout.preview || "(empty)"} ` +
      `stderr=${stderr.preview || "(empty)"}`,
    audit: metadata,
    output: {
      stdout: stdout.text,
      stderr: stderr.text
    }
  };
}

module.exports = {
  ToolShellError,
  resolveShellToolContext,
  executeShellToolCall
};
