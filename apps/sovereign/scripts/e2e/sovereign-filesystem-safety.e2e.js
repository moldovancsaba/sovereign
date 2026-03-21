#!/usr/bin/env node
/* eslint-disable no-console */
const os = require("node:os");
const path = require("node:path");
const fsp = require("node:fs/promises");
const {
  ToolFilesystemError,
  resolveFilesystemToolContext,
  executeFilesystemToolCall
} = require("../lib/tool-filesystem");
const { evaluateToolCommandPolicy } = require("../lib/tool-command-policy");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function exists(absPath) {
  const stat = await fsp.stat(absPath).catch(() => null);
  return Boolean(stat);
}

async function expectFsError(run, expectedCode, label) {
  try {
    await run();
  } catch (error) {
    if (!(error instanceof ToolFilesystemError)) {
      throw new Error(`${label} failed with unexpected error: ${error.message || String(error)}`);
    }
    if (error.code !== expectedCode) {
      throw new Error(`${label} expected ${expectedCode}, got ${error.code}`);
    }
    return error.code;
  }
  throw new Error(`${label} expected ${expectedCode}, but call succeeded`);
}

async function stageHappyPaths(context) {
  await executeFilesystemToolCall(
    {
      tool: "filesystem.mkdir",
      args: { path: "sandbox/notes", recursive: true }
    },
    context
  );
  await executeFilesystemToolCall(
    {
      tool: "filesystem.write",
      args: {
        path: "sandbox/notes/readme.txt",
        content: "sovereign filesystem safety harness\nstatus: ok\n"
      }
    },
    context
  );
  const listResult = await executeFilesystemToolCall(
    {
      tool: "filesystem.list",
      args: { path: "sandbox", recursive: true, includeHidden: true }
    },
    context
  );
  assert(
    listResult.answer.includes("sandbox/notes/readme.txt"),
    "filesystem.list did not include expected file"
  );

  const readResult = await executeFilesystemToolCall(
    {
      tool: "filesystem.read",
      args: { path: "sandbox/notes/readme.txt" }
    },
    context
  );
  assert(
    readResult.answer.includes("filesystem safety harness"),
    "filesystem.read did not return expected content"
  );

  const editResult = await executeFilesystemToolCall(
    {
      tool: "filesystem.edit",
      args: {
        path: "sandbox/notes/readme.txt",
        search: "status: ok",
        replace: "status: hardened"
      }
    },
    context
  );
  assert(editResult.answer.includes("replacements=1"), "filesystem.edit did not report replacement");

  const searchResult = await executeFilesystemToolCall(
    {
      tool: "filesystem.search",
      args: { path: "sandbox", query: "hardened", maxResults: 10 }
    },
    context
  );
  assert(searchResult.answer.includes("matches=1"), "filesystem.search did not find edited content");

  return {
    mkdir: true,
    write: true,
    list: true,
    read: true,
    edit: true,
    search: true
  };
}

async function stageSafetyDenials(context, workspaceRoot, outsideRoot) {
  const imagePath = path.join(workspaceRoot, "sandbox", "notes", "image.png");
  await fsp.writeFile(imagePath, Buffer.from([0, 159, 146, 150, 0, 1, 2, 3]));

  const directSymlinkPath = path.join(workspaceRoot, "sandbox", "notes", "readme-link.txt");
  await fsp.symlink(path.join(workspaceRoot, "sandbox", "notes", "readme.txt"), directSymlinkPath);

  const outsideLinkPath = path.join(workspaceRoot, "sandbox", "outside-link");
  await fsp.symlink(outsideRoot, outsideLinkPath);

  const traversalDeniedCode = await expectFsError(
    () =>
      executeFilesystemToolCall(
        {
          tool: "filesystem.read",
          args: { path: "../outside.txt" }
        },
        context
      ),
    "OUTSIDE_WORKSPACE",
    "traversal denial"
  );

  const symlinkDeniedCode = await expectFsError(
    () =>
      executeFilesystemToolCall(
        {
          tool: "filesystem.read",
          args: { path: "sandbox/notes/readme-link.txt" }
        },
        context
      ),
    "SYMLINK_DENIED",
    "direct symlink denial"
  );

  const symlinkEscapeCode = await expectFsError(
    () =>
      executeFilesystemToolCall(
        {
          tool: "filesystem.write",
          args: { path: "sandbox/outside-link/escape.txt", content: "escape attempt" }
        },
        context
      ),
    "SYMLINK_ESCAPE",
    "symlink escape denial"
  );

  const binaryReadDeniedCode = await expectFsError(
    () =>
      executeFilesystemToolCall(
        {
          tool: "filesystem.read",
          args: { path: "sandbox/notes/image.png" }
        },
        context
      ),
    "BINARY_DENIED",
    "binary read denial"
  );

  const binaryEditDeniedCode = await expectFsError(
    () =>
      executeFilesystemToolCall(
        {
          tool: "filesystem.edit",
          args: { path: "sandbox/notes/image.png", search: "x", replace: "y" }
        },
        context
      ),
    "BINARY_DENIED",
    "binary edit denial"
  );

  const binaryWriteDeniedCode = await expectFsError(
    () =>
      executeFilesystemToolCall(
        {
          tool: "filesystem.write",
          args: { path: "sandbox/notes/new-image.png", content: "text-write-disallowed" }
        },
        context
      ),
    "BINARY_DENIED",
    "binary write denial"
  );

  return {
    traversalDeniedCode,
    symlinkDeniedCode,
    symlinkEscapeCode,
    binaryReadDeniedCode,
    binaryEditDeniedCode,
    binaryWriteDeniedCode
  };
}

function stageMutationPolicyGate() {
  const missingApprovalEnvelope = {
    protocol: "sovereign.tool-call",
    version: "1.0",
    mode: "SEQUENTIAL",
    calls: [
      {
        id: "fs-mutation",
        tool: "filesystem.write",
        args: { path: "sandbox/notes/readme.txt", content: "mutate" },
        riskClass: "LOW",
        approval: "NONE"
      }
    ]
  };

  const missingApprovalPolicy = evaluateToolCommandPolicy(missingApprovalEnvelope);
  const missingApprovalDecision = missingApprovalPolicy.decisions.find(
    (entry) => entry.callId === "fs-mutation"
  );
  assert(
    !missingApprovalPolicy.allowed,
    "filesystem mutation without HUMAN_APPROVAL should be denied by baseline policy"
  );
  assert(Boolean(missingApprovalDecision), "filesystem mutation policy decision missing");
  assert(
    missingApprovalDecision.reason.includes("call.approval must be HUMAN_APPROVAL"),
    "filesystem mutation deny reason should require explicit HUMAN_APPROVAL declaration"
  );

  const approvedEnvelope = {
    protocol: "sovereign.tool-call",
    version: "1.0",
    mode: "SEQUENTIAL",
    calls: [
      {
        id: "fs-mutation-approved",
        tool: "filesystem.write",
        args: { path: "sandbox/notes/readme.txt", content: "mutate" },
        riskClass: "LOW",
        approval: "HUMAN_APPROVAL"
      }
    ]
  };

  const approvedPolicy = evaluateToolCommandPolicy(approvedEnvelope);
  const approvedDecision = approvedPolicy.decisions.find(
    (entry) => entry.callId === "fs-mutation-approved"
  );
  assert(approvedPolicy.allowed, "approved filesystem mutation should pass policy evaluation");
  assert(approvedPolicy.requiresApproval, "filesystem mutation should require approval token by policy");
  assert(Boolean(approvedDecision), "approved filesystem mutation policy decision missing");
  assert(
    approvedDecision.policyClass === "FILESYSTEM_MUTATION",
    `unexpected policy class: ${approvedDecision.policyClass}`
  );
  assert(approvedDecision.requiresApproval, "filesystem mutation decision did not require approval");

  return {
    missingApprovalAllowed: missingApprovalPolicy.allowed,
    missingApprovalReason: missingApprovalDecision.reason,
    approvedAllowed: approvedPolicy.allowed,
    requiresApproval: approvedPolicy.requiresApproval,
    policyClass: approvedDecision.policyClass,
    reason: approvedDecision.reason
  };
}

async function main() {
  const startedAt = Date.now();
  const summary = {
    runId: `sovereign-filesystem-safety-e2e-${new Date().toISOString()}`,
    stages: {}
  };

  const workspaceRaw = await fsp.mkdtemp(path.join(os.tmpdir(), "sovereign-fs-safety-workspace-"));
  const outsideRaw = await fsp.mkdtemp(path.join(os.tmpdir(), "sovereign-fs-safety-outside-"));
  const workspaceRoot = await fsp.realpath(workspaceRaw);
  const outsideRoot = await fsp.realpath(outsideRaw);

  try {
    const context = await resolveFilesystemToolContext({
      cwd: workspaceRoot,
      env: { SOVEREIGN_WORKSPACE_ROOT: workspaceRoot, SENTINELSQUAD_WORKSPACE_ROOT: workspaceRoot }
    });
    summary.stages.happyPath = await stageHappyPaths(context);
    summary.stages.safetyDenials = await stageSafetyDenials(context, workspaceRoot, outsideRoot);
    summary.stages.mutationPolicy = stageMutationPolicyGate();
  } finally {
    await fsp.rm(workspaceRoot, { recursive: true, force: true });
    await fsp.rm(outsideRoot, { recursive: true, force: true });
    summary.stages.rollback = {
      workspaceRemoved: !(await exists(workspaceRoot)),
      outsideRemoved: !(await exists(outsideRoot))
    };
  }

  assert(summary.stages.rollback.workspaceRemoved, "workspace cleanup failed");
  assert(summary.stages.rollback.outsideRemoved, "outside temp cleanup failed");

  summary.durationMs = Date.now() - startedAt;
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error("[sovereign-filesystem-safety-e2e] failed:", error.message || error);
  process.exitCode = 1;
});
