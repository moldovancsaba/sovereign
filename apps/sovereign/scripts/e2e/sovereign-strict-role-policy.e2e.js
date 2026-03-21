#!/usr/bin/env node
/* eslint-disable no-console */
const {
  strictConfigFromEnv,
  evaluateExecutionRolePolicy
} = require("../lib/strict-orchestration");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function stageDrafterRole() {
  const cfg = strictConfigFromEnv();
  const readDecision = evaluateExecutionRolePolicy({
    config: cfg,
    agentKey: cfg.drafterKey,
    tool: "filesystem.read"
  });
  const shellDecision = evaluateExecutionRolePolicy({
    config: cfg,
    agentKey: cfg.drafterKey,
    tool: "shell.exec"
  });
  const writeDecision = evaluateExecutionRolePolicy({
    config: cfg,
    agentKey: cfg.drafterKey,
    tool: "filesystem.write"
  });
  const memoryDecision = evaluateExecutionRolePolicy({
    config: cfg,
    agentKey: cfg.drafterKey,
    tool: "memory.search"
  });
  const backlogReadDecision = evaluateExecutionRolePolicy({
    config: cfg,
    agentKey: cfg.drafterKey,
    tool: "backlog.list_items"
  });
  const backlogWriteDecision = evaluateExecutionRolePolicy({
    config: cfg,
    agentKey: cfg.drafterKey,
    tool: "backlog.create_item"
  });

  assert(readDecision.allowed, "@Drafter should retain read-only filesystem access");
  assert(memoryDecision.allowed, "@Drafter should retain read-only project memory access");
  assert(backlogReadDecision.allowed, "@Drafter should retain read-only backlog access");
  assert(!backlogWriteDecision.allowed, "@Drafter must not mutate backlog");
  assert(!shellDecision.allowed, "@Drafter must not execute shell commands");
  assert(!writeDecision.allowed, "@Drafter must not mutate files");
  assert(
    shellDecision.reason.includes("STRICT_ROLE_VIOLATION"),
    "@Drafter deny reason should be explicit"
  );

  return {
    readAllowed: readDecision.allowed,
    memoryAllowed: memoryDecision.allowed,
    backlogReadAllowed: backlogReadDecision.allowed,
    backlogWriteAllowed: backlogWriteDecision.allowed,
    shellAllowed: shellDecision.allowed,
    writeAllowed: writeDecision.allowed
  };
}

function stageWriterRole() {
  const cfg = strictConfigFromEnv();
  const shellDecision = evaluateExecutionRolePolicy({
    config: cfg,
    agentKey: cfg.writerKey,
    tool: "shell.exec"
  });
  const gitDecision = evaluateExecutionRolePolicy({
    config: cfg,
    agentKey: cfg.writerKey,
    tool: "git.commit"
  });

  assert(shellDecision.allowed, "@Writer should be allowed to execute shell commands");
  assert(gitDecision.allowed, "@Writer should be allowed to mutate git state");

  return {
    shellAllowed: shellDecision.allowed,
    gitAllowed: gitDecision.allowed
  };
}

function stageControllerRole() {
  const cfg = strictConfigFromEnv();
  const gitReadDecision = evaluateExecutionRolePolicy({
    config: cfg,
    agentKey: cfg.controllerKey,
    tool: "git.diff"
  });
  const gitMutationDecision = evaluateExecutionRolePolicy({
    config: cfg,
    agentKey: cfg.controllerKey,
    tool: "git.commit"
  });
  const shellDecision = evaluateExecutionRolePolicy({
    config: cfg,
    agentKey: cfg.controllerKey,
    tool: "shell.exec"
  });
  const memoryDecision = evaluateExecutionRolePolicy({
    config: cfg,
    agentKey: cfg.controllerKey,
    tool: "memory.search"
  });
  const backlogReadDecision = evaluateExecutionRolePolicy({
    config: cfg,
    agentKey: cfg.controllerKey,
    tool: "backlog.get_item"
  });
  const backlogWriteDecision = evaluateExecutionRolePolicy({
    config: cfg,
    agentKey: cfg.controllerKey,
    tool: "backlog.update_item"
  });

  assert(gitReadDecision.allowed, "@Controller should retain read-only git access");
  assert(!gitMutationDecision.allowed, "@Controller must not mutate git state");
  assert(!shellDecision.allowed, "@Controller must remain read-only");
  assert(memoryDecision.allowed, "@Controller should be allowed read-only project memory tools");
  assert(backlogReadDecision.allowed, "@Controller should be allowed read-only backlog tools");
  assert(!backlogWriteDecision.allowed, "@Controller must not mutate backlog");
  assert(
    gitMutationDecision.reason.includes("STRICT_ROLE_VIOLATION"),
    "@Controller deny reason should be explicit"
  );

  return {
    gitReadAllowed: gitReadDecision.allowed,
    gitMutationAllowed: gitMutationDecision.allowed,
    shellAllowed: shellDecision.allowed,
    memoryAllowed: memoryDecision.allowed,
    backlogReadAllowed: backlogReadDecision.allowed,
    backlogWriteAllowed: backlogWriteDecision.allowed
  };
}

function main() {
  const startedAt = Date.now();
  const summary = {
    runId: `sovereign-strict-role-policy-e2e-${new Date().toISOString()}`,
    stages: {}
  };
  summary.stages.drafter = stageDrafterRole();
  summary.stages.writer = stageWriterRole();
  summary.stages.controller = stageControllerRole();
  summary.durationMs = Date.now() - startedAt;
  console.log(JSON.stringify(summary, null, 2));
}

try {
  main();
} catch (error) {
  console.error("[sovereign-strict-role-policy-e2e] failed:", error.message || error);
  process.exitCode = 1;
}
