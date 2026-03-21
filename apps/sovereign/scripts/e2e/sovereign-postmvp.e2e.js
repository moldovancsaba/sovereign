#!/usr/bin/env node
/* eslint-disable no-console */
const os = require("node:os");
const path = require("node:path");
const fsp = require("node:fs/promises");
const { spawnSync } = require("node:child_process");
const { validateToolCallProtocolEnvelope } = require("../lib/tool-call-protocol");
const { evaluateToolCommandPolicy } = require("../lib/tool-command-policy");
const { resolveFilesystemToolContext, executeFilesystemToolCall } = require("../lib/tool-filesystem");
const { resolveShellToolContext, executeShellToolCall } = require("../lib/tool-shell");
const { resolveGitToolContext, executeGitToolCall, ToolGitError } = require("../lib/tool-git");
const {
  evaluateNbaOrchestrationPolicy,
  resolveOmnichannelRoute
} = require("../lib/omnichannel-routing");
const {
  resolveTaskMemoryConfig,
  buildTaskMemoryRequest,
  evaluateTaskMemoryPolicy,
  buildTaskMemoryIndexRows,
  retrieveTaskMemorySnippets,
  buildTaskMemoryPromptBlock
} = require("../lib/task-memory");
const {
  buildPolicyReplayRequest,
  runPolicyReplaySimulation
} = require("../lib/policy-replay");
const { parseAgentHandoffs } = require("../lib/agent-handoff-router");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message} (expected=${expected}, actual=${actual})`);
  }
}

function run(cmd, args, cwd) {
  const out = spawnSync(cmd, args, { cwd, encoding: "utf8" });
  if (out.status !== 0) {
    throw new Error(`${cmd} ${args.join(" ")} failed: ${out.stderr || out.stdout}`);
  }
}

async function exists(absPath) {
  const stat = await fsp.stat(absPath).catch(() => null);
  return Boolean(stat);
}

async function stageToolCallProtocol() {
  const envelope = {
    protocol: "sovereign.tool-call",
    version: "1.0",
    mode: "SEQUENTIAL",
    calls: [
      {
        id: "e2e-chat",
        tool: "chat.respond",
        args: { prompt: "status" },
        riskClass: "LOW",
        approval: "NONE"
      },
      {
        id: "e2e-shell",
        tool: "shell.exec",
        args: { command: "echo e2e-shell" },
        riskClass: "CRITICAL",
        approval: "HUMAN_APPROVAL"
      },
      {
        id: "e2e-git",
        tool: "git.status",
        args: {},
        riskClass: "MEDIUM",
        approval: "NONE"
      }
    ]
  };

  const validation = validateToolCallProtocolEnvelope(envelope);
  assert(validation.present && validation.ok, "tool-call protocol validation failed");
  const policy = evaluateToolCommandPolicy(validation.envelope);
  assert(policy.allowed, "tool-command policy denied e2e envelope");
  assert(policy.requiresApproval, "tool-command policy should require approval for shell.exec");
  return {
    protocolOk: validation.ok,
    policyAllowed: policy.allowed,
    policyRequiresApproval: policy.requiresApproval,
    highestRiskClass: policy.highestRiskClass
  };
}

function stageOmnichannelRouting() {
  const routeChat = resolveOmnichannelRoute("chat");
  assert(routeChat.allowed, "chat channel should be routable");
  assertEqual(
    routeChat.routeClass,
    "CHAT_COORDINATION_EXECUTION",
    "chat route class mismatch"
  );

  const unsupported = evaluateNbaOrchestrationPolicy({
    sourceChannel: "sms",
    command: "@Agent sync status",
    approval: null
  });
  assert(!unsupported.allowed, "unsupported channel should be denied");
  assertEqual(
    unsupported.code,
    "OMNICHANNEL_CHANNEL_UNSUPPORTED",
    "unsupported channel deny code mismatch"
  );

  const highImpactDenied = evaluateNbaOrchestrationPolicy({
    sourceChannel: "issue",
    command: "@Agent deploy production now",
    approval: null
  });
  assert(!highImpactDenied.allowed, "high-impact NBA should require human gate");
  assertEqual(
    highImpactDenied.code,
    "NBA_HUMAN_GATE_REQUIRED",
    "high-impact gate deny code mismatch"
  );

  const highImpactApproved = evaluateNbaOrchestrationPolicy({
    sourceChannel: "issue",
    command: "@Agent deploy production now",
    approval: {
      approved: true,
      approverUserId: "user-1",
      approverEmail: "approver@example.com",
      approvedAt: "2026-02-18T13:00:00.000Z",
      decisionRef: "issue:206#decision-1"
    }
  });
  assert(highImpactApproved.allowed, "approved high-impact NBA should be allowed");
  assertEqual(highImpactApproved.code, "NBA_ROUTE_ALLOWED", "approved route code mismatch");

  const lowImpactAllowed = evaluateNbaOrchestrationPolicy({
    sourceChannel: "chat",
    command: "@Agent summarize latest board status",
    approval: null
  });
  assert(lowImpactAllowed.allowed, "low-impact NBA route should be allowed");

  const passOne = JSON.stringify(
    evaluateNbaOrchestrationPolicy({
      sourceChannel: "email",
      command: "@Agent investigate inbox issue",
      approval: null
    })
  );
  const passTwo = JSON.stringify(
    evaluateNbaOrchestrationPolicy({
      sourceChannel: "email",
      command: "@Agent investigate inbox issue",
      approval: null
    })
  );
  assertEqual(passOne, passTwo, "omnichannel policy evaluation should be deterministic");

  return {
    unsupportedCode: unsupported.code,
    highImpactDeniedCode: highImpactDenied.code,
    highImpactApprovedCode: highImpactApproved.code,
    deterministic: true
  };
}

function stageAgentHandoffRouter() {
  const knownAgents = [
    { key: "Chappie", displayName: "Chappie" },
    { key: "Gwen", displayName: "Gwen" },
    { key: "Scout", displayName: "Scout Lead" }
  ];
  const sourceText = [
    "@Gwen sync release checklist",
    "Contact Gwen to confirm deliverables for today in the project blockmass.",
    "Please coordinate with Scout Lead on integration verification.",
    "Contact Gwen to confirm deliverables for today in the project blockmass."
  ].join("\n");

  const parsedOne = parseAgentHandoffs({
    text: sourceText,
    knownAgents,
    requestedByAgent: "Chappie",
    maxInferred: 4
  });
  const parsedTwo = parseAgentHandoffs({
    text: sourceText,
    knownAgents,
    requestedByAgent: "Chappie",
    maxInferred: 4
  });
  assertEqual(
    JSON.stringify(parsedOne),
    JSON.stringify(parsedTwo),
    "agent handoff parsing should be deterministic"
  );

  const explicit = parsedOne.filter((handoff) => handoff.routeMode === "EXPLICIT_AT");
  const inferred = parsedOne.filter((handoff) => handoff.routeMode === "INFERRED_PLAIN");
  assert(explicit.length >= 1, "expected explicit @ handoff parse");
  assert(inferred.length >= 2, "expected inferred plain handoff parse");
  assert(
    inferred.some((handoff) => handoff.target === "Gwen"),
    "plain-text handoff should infer Gwen route"
  );
  assert(
    inferred.some((handoff) => handoff.target === "Scout"),
    "display-name alias should infer Scout route"
  );
  assert(
    !parsedOne.some((handoff) => handoff.target === "Chappie"),
    "handoff parser should not self-route to source agent"
  );
  assertEqual(
    inferred.filter((handoff) => handoff.target === "Gwen").length,
    1,
    "duplicate inferred handoffs should dedupe by target and command"
  );

  return {
    parsedCount: parsedOne.length,
    explicitCount: explicit.length,
    inferredCount: inferred.length,
    deterministic: true
  };
}

function stageMemoryRetrieval() {
  const config = resolveTaskMemoryConfig({
    SENTINELSQUAD_MEMORY_QUERY_MAX_CHARS: "64",
    SENTINELSQUAD_MEMORY_DOCUMENT_LIMIT: "24",
    SENTINELSQUAD_MEMORY_DEFAULT_MAX_SNIPPETS: "2",
    SENTINELSQUAD_MEMORY_DEFAULT_SNIPPET_MAX_CHARS: "120",
    SENTINELSQUAD_MEMORY_INDEX_DOC_MAX_CHARS: "200"
  });
  const task = {
    id: "task-memory-205",
    issueNumber: 205,
    threadId: "thread-205",
    title: "retrieve secure memory controls from latest issue context"
  };

  const deniedScope = evaluateTaskMemoryPolicy(
    buildTaskMemoryRequest({
      task,
      payload: {
        memory: {
          scope: "GLOBAL"
        }
      },
      config
    }),
    config
  );
  assertEqual(deniedScope.code, "MEMORY_SCOPE_DENIED", "memory scope guard mismatch");

  const deniedProjectSessionNoSid = evaluateTaskMemoryPolicy(
    buildTaskMemoryRequest({
      task,
      payload: {
        memory: {
          scope: "PROJECT_SESSION"
        }
      },
      queryOverride: "secure retrieval controls policy",
      projectSessionId: null,
      config
    }),
    config
  );
  assertEqual(
    deniedProjectSessionNoSid.code,
    "MEMORY_PROJECT_SESSION_REQUIRED",
    "project-session scope without session id should deny"
  );

  const allowedProjectSession = evaluateTaskMemoryPolicy(
    buildTaskMemoryRequest({
      task: {
        id: "task-memory-ps",
        title: "use durable memory",
        threadId: null,
        issueNumber: null
      },
      payload: {
        memory: {
          scope: "PROJECT_SESSION"
        }
      },
      queryOverride: "policy decisions",
      projectSessionId: "ps-test-1",
      config
    }),
    config
  );
  assert(allowedProjectSession.allowed, "PROJECT_SESSION with session id should be allowed");

  const deniedOverflow = evaluateTaskMemoryPolicy(
    buildTaskMemoryRequest({
      task,
      queryOverride: "x".repeat(config.queryMaxChars + 5),
      config
    }),
    config
  );
  assertEqual(deniedOverflow.code, "MEMORY_QUERY_TOO_LARGE", "memory query overflow guard mismatch");

  const allowedRequest = buildTaskMemoryRequest({
    task,
    queryOverride: "secure retrieval controls policy",
    config
  });
  const allowed = evaluateTaskMemoryPolicy(allowedRequest, config);
  assert(allowed.allowed, "memory policy unexpectedly denied valid request");

  const docs = buildTaskMemoryIndexRows(
    [
      {
        id: "m-1",
        authorType: "HUMAN",
        content:
          "Need secure retrieval controls with policy decisions and audit-visible deny reasons.",
        createdAt: new Date("2026-02-18T10:00:00.000Z")
      },
      {
        id: "m-2",
        authorType: "AGENT",
        content:
          "Implemented bounded snippets and thread-only retrieval scope for memory indexing.",
        createdAt: new Date("2026-02-18T10:01:00.000Z")
      },
      {
        id: "m-3",
        authorType: "SYSTEM",
        content: "internal stream artifact (should not be indexed).",
        createdAt: new Date("2026-02-18T10:02:00.000Z")
      }
    ],
    {
      documentLimit: allowedRequest.documentLimit,
      indexDocumentMaxChars: config.indexDocumentMaxChars
    }
  );
  assertEqual(docs.length, 2, "memory index should skip non-human/agent artifacts");

  const retrievalOne = retrieveTaskMemorySnippets({
    documents: docs,
    query: allowedRequest.query,
    maxSnippets: allowedRequest.maxSnippets,
    snippetMaxChars: allowedRequest.snippetMaxChars
  });
  const retrievalTwo = retrieveTaskMemorySnippets({
    documents: docs,
    query: allowedRequest.query,
    maxSnippets: allowedRequest.maxSnippets,
    snippetMaxChars: allowedRequest.snippetMaxChars
  });
  assertEqual(
    JSON.stringify(retrievalOne),
    JSON.stringify(retrievalTwo),
    "memory retrieval should be deterministic"
  );
  assert(retrievalOne.snippets.length >= 1, "memory retrieval returned no snippets for valid query");
  assert(
    retrievalOne.snippets.length <= allowedRequest.maxSnippets,
    "memory retrieval exceeded snippet bound"
  );
  const promptBlock = buildTaskMemoryPromptBlock(retrievalOne.snippets);
  assert(promptBlock.includes("Memory snippets"), "memory prompt block missing header");

  return {
    deniedScopeCode: deniedScope.code,
    deniedOverflowCode: deniedOverflow.code,
    snippetCount: retrievalOne.snippets.length,
    deterministic: true
  };
}

function stagePolicyReplay() {
  const request = buildPolicyReplayRequest({
    task: {
      issueNumber: 118,
      threadId: "thread-118"
    },
    payload: {
      policyReplay: {
        enabled: true,
        baselineVersion: "governance-v1",
        candidateVersion: "governance-v2",
        lookbackHours: 24,
        sampleLimit: 20,
        candidatePolicy: {
          memoryQueryMaxChars: 20,
          nbaHumanGateMinImpact: "MEDIUM"
        }
      }
    }
  });

  const evidenceEvents = [
    {
      id: "memory-policy-1",
      action: "MEMORY_RETRIEVAL_POLICY",
      createdAt: new Date("2026-02-18T11:00:00.000Z"),
      metadata: {
        issueNumber: 118,
        threadId: "thread-118",
        scope: "THREAD",
        mode: "READ",
        enabled: true,
        queryLength: 58,
        documentLimit: 24,
        maxSnippets: 2,
        snippetMaxChars: 120
      }
    },
    {
      id: "nba-policy-1",
      action: "NBA_APPROVAL_EVALUATED",
      createdAt: new Date("2026-02-18T11:01:00.000Z"),
      metadata: {
        issueNumber: 118,
        threadId: "thread-118",
        channel: "chat",
        command: "@Agent coordinate release check",
        humanGateApproved: false
      }
    }
  ];

  const replayOne = runPolicyReplaySimulation({
    request,
    evidenceEvents,
    nowIso: "2026-02-18T12:00:00.000Z"
  });
  const replayTwo = runPolicyReplaySimulation({
    request,
    evidenceEvents,
    nowIso: "2026-02-18T12:00:00.000Z"
  });

  assertEqual(
    JSON.stringify(replayOne),
    JSON.stringify(replayTwo),
    "policy replay simulation should be deterministic"
  );
  assertEqual(replayOne.mode, "READ_ONLY", "policy replay must be read-only");
  assert(replayOne.totals.deltaCount >= 2, "policy replay expected at least two decision deltas");
  assert(replayOne.totals.regressionCount >= 2, "policy replay should flag regression risk deltas");
  assert(
    replayOne.deltas.some((delta) => delta.domain === "MEMORY_POLICY"),
    "policy replay missing memory decision delta"
  );
  assert(
    replayOne.deltas.some((delta) => delta.domain === "NBA_ROUTING_POLICY"),
    "policy replay missing nba decision delta"
  );

  return {
    mode: replayOne.mode,
    deltaCount: replayOne.totals.deltaCount,
    regressionCount: replayOne.totals.regressionCount,
    deterministic: true
  };
}

async function stageFilesystemAndShell(workspaceRoot) {
  const fsContext = await resolveFilesystemToolContext({
    cwd: workspaceRoot,
    env: { SOVEREIGN_WORKSPACE_ROOT: workspaceRoot, SENTINELSQUAD_WORKSPACE_ROOT: workspaceRoot }
  });

  await executeFilesystemToolCall(
    {
      tool: "filesystem.write",
      args: { path: "rehearsal/e2e.txt", content: "sovereign-e2e" }
    },
    fsContext
  );
  const readResult = await executeFilesystemToolCall(
    {
      tool: "filesystem.read",
      args: { path: "rehearsal/e2e.txt" }
    },
    fsContext
  );
  assert(readResult.answer.includes("sovereign-e2e"), "filesystem read/write stage failed");

  const streamEvents = [];
  const shellContext = await resolveShellToolContext({
    sessionId: `e2e-${Date.now().toString(36)}`,
    workspaceRoots: fsContext.workspaceRoots,
    defaultCwd: workspaceRoot,
    env: process.env
  });
  const shellResult = await executeShellToolCall(
    {
      tool: "shell.exec",
      args: { command: "printf 'shell-e2e-out\\n'; printf 'shell-e2e-err\\n' 1>&2" }
    },
    shellContext,
    {
      onOutput: (event) => streamEvents.push(event)
    }
  );
  assert(shellResult.audit.exitCode === 0, "shell stage returned non-zero exit");
  assert(streamEvents.length >= 1, "shell streaming callback did not emit output");

  return {
    filesystemOk: true,
    shellExitCode: shellResult.audit.exitCode,
    shellStreamEventCount: streamEvents.length,
    artifactSessionId: shellResult.audit.sessionId
  };
}

async function stageGitFlow(tempRoot) {
  const repo = path.join(tempRoot, "repo");
  const remote = path.join(tempRoot, "remote.git");
  await fsp.mkdir(repo, { recursive: true });
  run("git", ["init"], repo);
  run("git", ["config", "user.name", "SentinelSquad E2E"], repo);
  run("git", ["config", "user.email", "sovereign-e2e@example.com"], repo);

  await fsp.writeFile(path.join(repo, "README.md"), "# sovereign e2e\n", "utf8");

  const gitContext = await resolveGitToolContext({
    workspaceRoots: [tempRoot],
    primaryWorkspaceRoot: tempRoot,
    env: process.env
  });
  const statusResult = await executeGitToolCall(
    { tool: "git.status", args: { repoPath: repo } },
    gitContext
  );
  assert(Boolean(statusResult.audit?.repoRoot), "git.status did not return repo metadata");

  let protectedBranchCode = "none";
  try {
    await executeGitToolCall(
      { tool: "git.checkout", args: { repoPath: repo, branch: "main" } },
      gitContext
    );
  } catch (error) {
    if (error instanceof ToolGitError) {
      protectedBranchCode = error.code;
    } else {
      throw error;
    }
  }
  assert(
    protectedBranchCode === "PROTECTED_BRANCH_DENIED",
    "protected-branch guard was not enforced"
  );

  await executeGitToolCall(
    { tool: "git.checkout", args: { repoPath: repo, branch: "feature/e2e", create: true } },
    gitContext
  );
  await executeGitToolCall(
    { tool: "git.add", args: { repoPath: repo, pathspec: ["README.md"] } },
    gitContext
  );
  const commitResult = await executeGitToolCall(
    {
      tool: "git.commit",
      args: { repoPath: repo, message: "e2e: commit rehearsal file" }
    },
    gitContext
  );
  assert(Boolean(commitResult.audit?.commitSha), "git.commit did not return commit SHA");

  run("git", ["init", "--bare", remote], tempRoot);
  run("git", ["remote", "add", "origin", remote], repo);
  const pushResult = await executeGitToolCall(
    {
      tool: "git.push",
      args: { repoPath: repo, remote: "origin", branch: "feature/e2e", setUpstream: true }
    },
    gitContext
  );
  assert(pushResult.answer.includes("git.push"), "git.push stage failed");

  return {
    gitStatusOk: true,
    protectedBranchGuard: protectedBranchCode,
    commitSha: commitResult.audit.commitSha,
    pushOk: true
  };
}

async function main() {
  const startedAt = Date.now();
  const summary = {
    runId: `sovereign-e2e-${new Date().toISOString()}`,
    stages: {}
  };

  const workspaceRaw = await fsp.mkdtemp(path.join(os.tmpdir(), "sovereign-e2e-workspace-"));
  const gitRaw = await fsp.mkdtemp(path.join(os.tmpdir(), "sovereign-e2e-git-"));
  const workspaceRoot = await fsp.realpath(workspaceRaw);
  const gitRoot = await fsp.realpath(gitRaw);

  try {
    summary.stages.protocol = await stageToolCallProtocol();
    summary.stages.omnichannel = stageOmnichannelRouting();
    summary.stages.handoffRouter = stageAgentHandoffRouter();
    summary.stages.memory = stageMemoryRetrieval();
    summary.stages.policyReplay = stagePolicyReplay();
    summary.stages.filesystemShell = await stageFilesystemAndShell(workspaceRoot);
    summary.stages.git = await stageGitFlow(gitRoot);
  } finally {
    await fsp.rm(workspaceRoot, { recursive: true, force: true });
    await fsp.rm(gitRoot, { recursive: true, force: true });
    summary.stages.rollback = {
      workspaceRemoved: !(await exists(workspaceRoot)),
      gitRootRemoved: !(await exists(gitRoot))
    };
  }

  assert(summary.stages.rollback.workspaceRemoved, "workspace rollback cleanup failed");
  assert(summary.stages.rollback.gitRootRemoved, "git rollback cleanup failed");

  summary.durationMs = Date.now() - startedAt;
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error("[sovereign-e2e] failed:", error.message || error);
  process.exitCode = 1;
});
