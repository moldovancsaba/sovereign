const fsp = require("node:fs/promises");
const path = require("node:path");
const { spawn } = require("node:child_process");

const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_MAX_OUTPUT_BYTES = 256 * 1024;
const DEFAULT_MAX_ARGUMENTS = 32;
const DEFAULT_PROTECTED_BRANCHES = ["main", "master", "production"];
const BRANCH_RE = /^[A-Za-z0-9._/-]{1,120}$/;

class ToolGitError extends Error {
  constructor(code, message, metadata = {}) {
    super(message);
    this.name = "ToolGitError";
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

function asBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const lowered = value.trim().toLowerCase();
    if (lowered === "true" || lowered === "1" || lowered === "yes") return true;
    if (lowered === "false" || lowered === "0" || lowered === "no") return false;
  }
  return fallback;
}

function clampInt(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(Math.trunc(n), min), max);
}

function unique(values) {
  return Array.from(new Set(values));
}

function isWithinPath(candidate, root) {
  const rel = path.relative(root, candidate);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

function parseProtectedBranches(raw) {
  if (!raw || typeof raw !== "string") return DEFAULT_PROTECTED_BRANCHES;
  const parsed = raw
    .split(/[,\s]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
  return parsed.length ? parsed : DEFAULT_PROTECTED_BRANCHES;
}

function trimPreview(text, max = 1200) {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max)}...`;
}

async function ensureWorkspaceRoots(workspaceRootsInput) {
  if (!Array.isArray(workspaceRootsInput) || !workspaceRootsInput.length) {
    throw new ToolGitError(
      "WORKSPACE_UNAVAILABLE",
      "Git runtime requires workspace roots from execution context."
    );
  }
  const roots = [];
  for (const entry of workspaceRootsInput) {
    const candidate = asTrimmed(entry);
    if (!candidate) continue;
    const resolved = path.resolve(candidate);
    const stat = await fsp.stat(resolved).catch(() => null);
    if (!stat || !stat.isDirectory()) continue;
    const real = await fsp.realpath(resolved).catch(() => null);
    if (real) roots.push(real);
  }
  const normalized = unique(roots);
  if (!normalized.length) {
    throw new ToolGitError("WORKSPACE_UNAVAILABLE", "Git runtime could not resolve workspace roots.");
  }
  return normalized;
}

function buildGitEnv(parentEnv) {
  const env = {};
  const keys = [
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
    "GIT_TERMINAL_PROMPT"
  ];
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(parentEnv, key) && parentEnv[key] != null) {
      env[key] = String(parentEnv[key]);
    }
  }
  env.GIT_TERMINAL_PROMPT = "0";
  return env;
}

async function runGitCommand(commandArgs, options) {
  const cwd = options.cwd;
  const timeoutMs = options.timeoutMs;
  const maxOutputBytes = options.maxOutputBytes;
  const parentEnv = options.parentEnv || process.env;
  const env = { ...buildGitEnv(parentEnv), ...(options.envOverrides || {}) };
  const args = Array.isArray(commandArgs) ? commandArgs : [];
  if (!args.length) {
    throw new ToolGitError("ARGS_REQUIRED", "Git command requires at least one argument.");
  }
  if (args.length > DEFAULT_MAX_ARGUMENTS) {
    throw new ToolGitError(
      "ARGS_LIMIT_EXCEEDED",
      `Git command denied: more than ${DEFAULT_MAX_ARGUMENTS} arguments provided.`
    );
  }

  const startedAt = Date.now();
  const stdoutChunks = [];
  const stderrChunks = [];
  let totalBytes = 0;
  let outputTruncated = false;
  let timedOut = false;
  let terminated = false;

  const child = spawn("git", args, {
    cwd,
    env,
    stdio: ["ignore", "pipe", "pipe"]
  });

  const stopProcess = (reason) => {
    if (terminated) return;
    terminated = true;
    if (reason === "TIMEOUT") timedOut = true;
    if (reason === "OUTPUT_LIMIT") outputTruncated = true;
    child.kill("SIGTERM");
    setTimeout(() => {
      if (child.exitCode == null && child.signalCode == null) {
        child.kill("SIGKILL");
      }
    }, 1200).unref();
  };

  const appendChunk = (target, chunk) => {
    if (outputTruncated) return;
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk || ""));
    if (!buf.length) return;
    const remaining = maxOutputBytes - totalBytes;
    if (remaining <= 0) {
      stopProcess("OUTPUT_LIMIT");
      return;
    }
    const accepted = buf.length <= remaining ? buf : buf.subarray(0, remaining);
    if (accepted.length > 0) target.push(accepted);
    totalBytes += accepted.length;
    if (accepted.length < buf.length) stopProcess("OUTPUT_LIMIT");
  };

  child.stdout.on("data", (chunk) => appendChunk(stdoutChunks, chunk));
  child.stderr.on("data", (chunk) => appendChunk(stderrChunks, chunk));

  const timeoutTimer = setTimeout(() => {
    stopProcess("TIMEOUT");
  }, timeoutMs);
  timeoutTimer.unref();

  const exit = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => resolve({ code, signal }));
  }).finally(() => {
    clearTimeout(timeoutTimer);
  });

  const stdout = Buffer.concat(stdoutChunks).toString("utf8");
  const stderr = Buffer.concat(stderrChunks).toString("utf8");
  const durationMs = Date.now() - startedAt;
  const metadata = {
    args,
    cwd,
    timeoutMs,
    durationMs,
    outputBytes: totalBytes,
    outputTruncated,
    timedOut,
    exitCode: Number.isInteger(exit.code) ? exit.code : null,
    signal: exit.signal || null,
    stdoutPreview: trimPreview(stdout),
    stderrPreview: trimPreview(stderr)
  };

  if (timedOut) {
    throw new ToolGitError(
      "TIMEOUT",
      `Git command timed out after ${timeoutMs}ms: git ${args.join(" ")}`,
      metadata
    );
  }
  if (outputTruncated) {
    throw new ToolGitError(
      "OUTPUT_LIMIT_EXCEEDED",
      `Git command output exceeded ${maxOutputBytes} bytes and was terminated.`,
      metadata
    );
  }
  if (!Number.isInteger(exit.code) || exit.code !== 0) {
    const summary = trimPreview(stderr || stdout || "no output", 300);
    throw new ToolGitError(
      "GIT_COMMAND_FAILED",
      `git ${args.join(" ")} failed with exit code ${exit.code ?? "unknown"} (${summary}).`,
      metadata
    );
  }
  return {
    stdout,
    stderr,
    audit: metadata
  };
}

async function resolveRepoRoot(context, call) {
  const args = asRecord(call?.args) || {};
  const repoPathRaw = asTrimmed(args.repoPath) || asTrimmed(args.cwd) || context.primaryWorkspaceRoot;
  const candidate = path.isAbsolute(repoPathRaw)
    ? path.resolve(repoPathRaw)
    : path.resolve(context.primaryWorkspaceRoot, repoPathRaw);
  const candidateReal = await fsp.realpath(candidate).catch(() => null);
  if (!candidateReal) {
    throw new ToolGitError(
      "REPO_PATH_MISSING",
      `Git tool denied: path does not exist (${repoPathRaw}).`,
      { repoPath: repoPathRaw }
    );
  }
  const withinWorkspace = context.workspaceRoots.some((root) => isWithinPath(candidateReal, root));
  if (!withinWorkspace) {
    throw new ToolGitError(
      "OUTSIDE_WORKSPACE",
      "Git tool denied: repo path resolves outside workspace roots.",
      { repoPath: repoPathRaw }
    );
  }

  const resolved = await runGitCommand(["rev-parse", "--show-toplevel"], {
    cwd: candidateReal,
    timeoutMs: context.timeoutMs,
    maxOutputBytes: context.maxOutputBytes,
    parentEnv: context.env
  });
  const repoRootRaw = asTrimmed(resolved.stdout);
  const repoRoot = repoRootRaw ? await fsp.realpath(repoRootRaw).catch(() => null) : null;
  if (!repoRoot) {
    throw new ToolGitError("NOT_A_REPOSITORY", "Git tool denied: could not resolve repository root.");
  }
  const repoWithinWorkspace = context.workspaceRoots.some((root) => isWithinPath(repoRoot, root));
  if (!repoWithinWorkspace) {
    throw new ToolGitError(
      "OUTSIDE_WORKSPACE",
      "Git tool denied: repository root resolves outside workspace roots.",
      { repoRoot }
    );
  }
  return repoRoot;
}

async function getCurrentBranch(repoRoot, context) {
  try {
    const result = await runGitCommand(["rev-parse", "--abbrev-ref", "HEAD"], {
      cwd: repoRoot,
      timeoutMs: context.timeoutMs,
      maxOutputBytes: context.maxOutputBytes,
      parentEnv: context.env
    });
    return asTrimmed(result.stdout) || "unknown";
  } catch (error) {
    if (!(error instanceof ToolGitError) || error.code !== "GIT_COMMAND_FAILED") {
      throw error;
    }
    const fallback = await runGitCommand(["symbolic-ref", "--short", "HEAD"], {
      cwd: repoRoot,
      timeoutMs: context.timeoutMs,
      maxOutputBytes: context.maxOutputBytes,
      parentEnv: context.env
    });
    return asTrimmed(fallback.stdout) || "unknown";
  }
}

function enforceBranchName(branch, operation) {
  if (!branch || !BRANCH_RE.test(branch)) {
    throw new ToolGitError(
      "BRANCH_INVALID",
      `${operation} denied: branch name is missing or invalid.`,
      { branch }
    );
  }
}

function enforceNotProtectedBranch(branch, context, operation) {
  const normalized = asTrimmed(branch);
  if (!normalized) return;
  if (context.protectedBranches.has(normalized)) {
    throw new ToolGitError(
      "PROTECTED_BRANCH_DENIED",
      `${operation} denied: protected branch "${normalized}" is blocked for mutation.`,
      { branch: normalized }
    );
  }
}

function normalizePathspec(args) {
  const raw = args.pathspec ?? args.path ?? ".";
  if (Array.isArray(raw)) {
    const cleaned = raw.map((entry) => asTrimmed(entry)).filter(Boolean);
    if (!cleaned.length) return ["."];
    return cleaned.slice(0, 16);
  }
  const single = asTrimmed(raw);
  return [single || "."];
}

function buildAudit(base, result, extra = {}) {
  return {
    ...extra,
    repoRoot: base.repoRoot,
    branch: base.branch,
    ...(result?.audit || {})
  };
}

function extractGitHubPullInfo(json) {
  return {
    number: json?.number ?? null,
    url: json?.html_url ?? null,
    state: json?.state ?? null
  };
}

async function createPullRequest(context, args, repoRoot, headBranch) {
  if (!context.githubToken) {
    throw new ToolGitError("TOKEN_MISSING", "git.pr.create denied: SENTINELSQUAD_GITHUB_TOKEN is missing.");
  }
  const title = asTrimmed(args.title);
  if (!title) {
    throw new ToolGitError("TITLE_REQUIRED", "git.pr.create requires args.title.");
  }
  const body = asTrimmed(args.body);
  const base = asTrimmed(args.base) || "main";
  const head = asTrimmed(args.head) || headBranch;
  enforceBranchName(base, "git.pr.create");
  enforceBranchName(head, "git.pr.create");
  enforceNotProtectedBranch(head, context, "git.pr.create");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), context.timeoutMs);
  try {
    const res = await fetch(
      `https://api.github.com/repos/${context.repoOwner}/${context.repoName}/pulls`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${context.githubToken}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
          "X-GitHub-Api-Version": "2022-11-28"
        },
        body: JSON.stringify({
          title,
          body: body || undefined,
          base,
          head,
          draft: asBoolean(args.draft, false)
        }),
        signal: controller.signal
      }
    );
    const responseText = await res.text();
    let json = null;
    try {
      json = responseText ? JSON.parse(responseText) : null;
    } catch {
      json = null;
    }
    if (!res.ok) {
      throw new ToolGitError(
        "PR_CREATE_FAILED",
        `git.pr.create failed with HTTP ${res.status}.`,
        {
          status: res.status,
          responsePreview: trimPreview(responseText, 400),
          repoRoot
        }
      );
    }
    return extractGitHubPullInfo(json);
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new ToolGitError(
        "TIMEOUT",
        `git.pr.create timed out after ${context.timeoutMs}ms.`,
        { repoRoot }
      );
    }
    if (error instanceof ToolGitError) throw error;
    throw new ToolGitError("PR_CREATE_FAILED", `git.pr.create failed: ${error.message}`, {
      repoRoot
    });
  } finally {
    clearTimeout(timer);
  }
}

async function runGitStatus(repoRoot, context) {
  const result = await runGitCommand(["status", "--short", "--branch"], {
    cwd: repoRoot,
    timeoutMs: context.timeoutMs,
    maxOutputBytes: context.maxOutputBytes,
    parentEnv: context.env
  });
  const branch = await getCurrentBranch(repoRoot, context);
  return {
    answer: `git.status branch=${branch} ${trimPreview(result.stdout || "clean", 800)}`,
    audit: buildAudit({ repoRoot, branch }, result, {
      operation: "git.status"
    })
  };
}

async function runGitDiff(repoRoot, context, args) {
  const staged = asBoolean(args.staged, false);
  const command = ["diff"];
  if (staged) command.push("--staged");
  const pathspec = asTrimmed(args.path);
  if (pathspec) command.push("--", pathspec);
  const result = await runGitCommand(command, {
    cwd: repoRoot,
    timeoutMs: context.timeoutMs,
    maxOutputBytes: context.maxOutputBytes,
    parentEnv: context.env
  });
  const branch = await getCurrentBranch(repoRoot, context);
  return {
    answer: `git.diff branch=${branch} ${trimPreview(result.stdout || "no diff", 800)}`,
    audit: buildAudit({ repoRoot, branch }, result, {
      operation: "git.diff",
      staged
    })
  };
}

async function runGitLog(repoRoot, context, args) {
  const limit = clampInt(args.limit, 10, 1, 50);
  const result = await runGitCommand(["log", "--oneline", `-${limit}`], {
    cwd: repoRoot,
    timeoutMs: context.timeoutMs,
    maxOutputBytes: context.maxOutputBytes,
    parentEnv: context.env
  });
  const branch = await getCurrentBranch(repoRoot, context);
  return {
    answer: `git.log branch=${branch} limit=${limit}\n${trimPreview(result.stdout, 1500)}`,
    audit: buildAudit({ repoRoot, branch }, result, {
      operation: "git.log",
      limit
    })
  };
}

async function runGitShow(repoRoot, context, args) {
  const ref = asTrimmed(args.ref) || "HEAD";
  const result = await runGitCommand(["show", "--stat", "--oneline", ref], {
    cwd: repoRoot,
    timeoutMs: context.timeoutMs,
    maxOutputBytes: context.maxOutputBytes,
    parentEnv: context.env
  });
  const branch = await getCurrentBranch(repoRoot, context);
  return {
    answer: `git.show ref=${ref}\n${trimPreview(result.stdout, 1500)}`,
    audit: buildAudit({ repoRoot, branch }, result, {
      operation: "git.show",
      ref
    })
  };
}

async function runGitBranchList(repoRoot, context) {
  const result = await runGitCommand(["branch", "--list", "--verbose", "--no-abbrev"], {
    cwd: repoRoot,
    timeoutMs: context.timeoutMs,
    maxOutputBytes: context.maxOutputBytes,
    parentEnv: context.env
  });
  const branch = await getCurrentBranch(repoRoot, context);
  return {
    answer: `git.branch.list current=${branch}\n${trimPreview(result.stdout, 1500)}`,
    audit: buildAudit({ repoRoot, branch }, result, {
      operation: "git.branch.list"
    })
  };
}

async function runGitAdd(repoRoot, context, args) {
  const branch = await getCurrentBranch(repoRoot, context);
  enforceNotProtectedBranch(branch, context, "git.add");
  const pathspec = normalizePathspec(args);
  const command = asBoolean(args.all, false)
    ? ["add", "--all"]
    : ["add", "--", ...pathspec];
  const result = await runGitCommand(command, {
    cwd: repoRoot,
    timeoutMs: context.timeoutMs,
    maxOutputBytes: context.maxOutputBytes,
    parentEnv: context.env
  });
  return {
    answer: `git.add branch=${branch} paths=${pathspec.join(",") || "."}`,
    audit: buildAudit({ repoRoot, branch }, result, {
      operation: "git.add",
      pathspec
    })
  };
}

async function runGitCommit(repoRoot, context, args) {
  const branch = await getCurrentBranch(repoRoot, context);
  enforceNotProtectedBranch(branch, context, "git.commit");
  const message = asTrimmed(args.message);
  if (!message) {
    throw new ToolGitError("COMMIT_MESSAGE_REQUIRED", "git.commit requires args.message.");
  }
  const commitArgs = ["commit", "-m", message];
  const authorName = asTrimmed(args.authorName);
  const authorEmail = asTrimmed(args.authorEmail);
  if (authorName && authorEmail) {
    commitArgs.push("--author", `${authorName} <${authorEmail}>`);
  }
  const commitResult = await runGitCommand(commitArgs, {
    cwd: repoRoot,
    timeoutMs: context.timeoutMs,
    maxOutputBytes: context.maxOutputBytes,
    parentEnv: context.env
  });
  const shaResult = await runGitCommand(["rev-parse", "HEAD"], {
    cwd: repoRoot,
    timeoutMs: context.timeoutMs,
    maxOutputBytes: context.maxOutputBytes,
    parentEnv: context.env
  });
  const commitSha = asTrimmed(shaResult.stdout);
  return {
    answer: `git.commit branch=${branch} sha=${commitSha}`,
    audit: buildAudit({ repoRoot, branch }, commitResult, {
      operation: "git.commit",
      commitSha
    })
  };
}

async function runGitCheckout(repoRoot, context, args) {
  const branch = asTrimmed(args.branch);
  const create = asBoolean(args.create, false);
  enforceBranchName(branch, "git.checkout");
  enforceNotProtectedBranch(branch, context, "git.checkout");
  const command = ["checkout"];
  if (create) {
    command.push("-b", branch);
    const startPoint = asTrimmed(args.startPoint);
    if (startPoint) command.push(startPoint);
  } else {
    command.push(branch);
  }
  const result = await runGitCommand(command, {
    cwd: repoRoot,
    timeoutMs: context.timeoutMs,
    maxOutputBytes: context.maxOutputBytes,
    parentEnv: context.env
  });
  const currentBranch = await getCurrentBranch(repoRoot, context);
  return {
    answer: `git.checkout branch=${currentBranch} create=${create}`,
    audit: buildAudit({ repoRoot, branch: currentBranch }, result, {
      operation: "git.checkout",
      targetBranch: branch,
      create
    })
  };
}

async function runGitPush(repoRoot, context, args) {
  const currentBranch = await getCurrentBranch(repoRoot, context);
  const branch = asTrimmed(args.branch) || currentBranch;
  enforceBranchName(branch, "git.push");
  enforceNotProtectedBranch(branch, context, "git.push");
  const remote = asTrimmed(args.remote) || "origin";
  const command = ["push"];
  if (asBoolean(args.setUpstream, false)) command.push("--set-upstream");
  command.push(remote, branch);
  const result = await runGitCommand(command, {
    cwd: repoRoot,
    timeoutMs: context.timeoutMs,
    maxOutputBytes: context.maxOutputBytes,
    parentEnv: context.env
  });
  return {
    answer: `git.push remote=${remote} branch=${branch}`,
    audit: buildAudit({ repoRoot, branch }, result, {
      operation: "git.push",
      remote
    })
  };
}

async function runGitPrCreate(repoRoot, context, args) {
  const headBranch = await getCurrentBranch(repoRoot, context);
  enforceNotProtectedBranch(headBranch, context, "git.pr.create");
  const pr = await createPullRequest(context, args, repoRoot, headBranch);
  return {
    answer: `git.pr.create number=${pr.number ?? "unknown"} url=${pr.url ?? "n/a"}`,
    audit: {
      operation: "git.pr.create",
      repoRoot,
      branch: headBranch,
      prNumber: pr.number,
      prUrl: pr.url,
      prState: pr.state
    }
  };
}

async function executeGitToolCall(call, context) {
  if (!call || !call.tool) {
    throw new ToolGitError("CALL_REQUIRED", "Git tool call payload is missing.");
  }
  const args = asRecord(call.args) || {};
  const repoRoot = await resolveRepoRoot(context, call);

  if (call.tool === "git.status") return runGitStatus(repoRoot, context);
  if (call.tool === "git.diff") return runGitDiff(repoRoot, context, args);
  if (call.tool === "git.log") return runGitLog(repoRoot, context, args);
  if (call.tool === "git.show") return runGitShow(repoRoot, context, args);
  if (call.tool === "git.branch.list") return runGitBranchList(repoRoot, context);
  if (call.tool === "git.add") return runGitAdd(repoRoot, context, args);
  if (call.tool === "git.commit") return runGitCommit(repoRoot, context, args);
  if (call.tool === "git.checkout") return runGitCheckout(repoRoot, context, args);
  if (call.tool === "git.push") return runGitPush(repoRoot, context, args);
  if (call.tool === "git.pr.create") return runGitPrCreate(repoRoot, context, args);

  throw new ToolGitError(
    "UNSUPPORTED_TOOL",
    `Git runtime does not support ${call.tool} in this phase.`
  );
}

async function resolveGitToolContext(options = {}) {
  const env = options.env || process.env;
  const workspaceRoots = await ensureWorkspaceRoots(options.workspaceRoots);
  return {
    workspaceRoots,
    primaryWorkspaceRoot: options.primaryWorkspaceRoot || workspaceRoots[0],
    timeoutMs: clampInt(env.SENTINELSQUAD_GIT_TIMEOUT_MS, DEFAULT_TIMEOUT_MS, 1_000, 120_000),
    maxOutputBytes: clampInt(
      env.SENTINELSQUAD_GIT_MAX_OUTPUT_BYTES,
      DEFAULT_MAX_OUTPUT_BYTES,
      4_096,
      1_048_576
    ),
    protectedBranches: new Set(parseProtectedBranches(env.SENTINELSQUAD_GIT_PROTECTED_BRANCHES)),
    env,
    repoOwner: asTrimmed(env.SENTINELSQUAD_GITHUB_REPO_OWNER) || "moldovancsaba",
    repoName: asTrimmed(env.SENTINELSQUAD_GITHUB_REPO_NAME) || "sentinelsquad",
    githubToken:
      asTrimmed(env.SENTINELSQUAD_GITHUB_TOKEN) ||
      asTrimmed(env.GITHUB_TOKEN) ||
      asTrimmed(env.MVP_PROJECT_TOKEN)
  };
}

module.exports = {
  ToolGitError,
  resolveGitToolContext,
  executeGitToolCall
};
