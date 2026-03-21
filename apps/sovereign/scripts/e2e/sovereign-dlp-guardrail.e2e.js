#!/usr/bin/env node
/* eslint-disable no-console */
const {
  applyOutputDlp
} = require("../lib/output-dlp");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function stageRedactMode() {
  const input =
    "Authorization: Bearer sk-1234567890abcdefghijklmnop\n" +
    "token=ghp_abcdefghijklmnopqrstuvwxyz123456";
  const result = applyOutputDlp(input, { mode: "REDACT", channel: "test_redact" });
  assert(result.action === "REDACT", "REDACT mode should redact matching content");
  assert(result.matchCount >= 2, "REDACT mode should detect multiple sensitive patterns");
  assert(!result.text.includes("sk-1234567890abcdefghijklmnop"), "OpenAI key should be redacted");
  assert(!result.text.includes("ghp_abcdefghijklmnopqrstuvwxyz123456"), "GitHub token should be redacted");
  return {
    action: result.action,
    matchCount: result.matchCount,
    ruleIds: result.ruleIds
  };
}

function stageDenyMode() {
  const input = "password=super-secret-value";
  const result = applyOutputDlp(input, { mode: "DENY", channel: "test_deny" });
  assert(result.action === "BLOCK", "DENY mode should block matching content");
  assert(result.blocked, "DENY mode should set blocked=true");
  assert(result.text.startsWith("[DLP_BLOCKED]"), "DENY mode should replace content with blocked marker");
  return {
    action: result.action,
    blocked: result.blocked,
    matchCount: result.matchCount
  };
}

function stageOffMode() {
  const input = "token=plain-text-token";
  const result = applyOutputDlp(input, { mode: "OFF", channel: "test_off" });
  assert(result.action === "ALLOW", "OFF mode should bypass filtering");
  assert(result.text === input, "OFF mode should keep exact input");
  return {
    action: result.action,
    matchCount: result.matchCount
  };
}

function stageDeterminism() {
  const input = "api_key=abcdefg1234567";
  const one = applyOutputDlp(input, { mode: "REDACT", channel: "determinism" });
  const two = applyOutputDlp(input, { mode: "REDACT", channel: "determinism" });
  assert(one.text === two.text, "DLP output should be deterministic");
  assert(one.action === two.action, "DLP action should be deterministic");
  assert(one.matchCount === two.matchCount, "DLP match count should be deterministic");
  assert(
    JSON.stringify(one.ruleIds) === JSON.stringify(two.ruleIds),
    "DLP matched rules should be deterministic"
  );
  return {
    action: one.action,
    matchCount: one.matchCount,
    ruleIds: one.ruleIds
  };
}

function main() {
  const startedAt = Date.now();
  const summary = {
    runId: `sovereign-dlp-guardrail-e2e-${new Date().toISOString()}`,
    stages: {}
  };
  summary.stages.redactMode = stageRedactMode();
  summary.stages.denyMode = stageDenyMode();
  summary.stages.offMode = stageOffMode();
  summary.stages.determinism = stageDeterminism();
  summary.durationMs = Date.now() - startedAt;
  console.log(JSON.stringify(summary, null, 2));
}

try {
  main();
} catch (error) {
  console.error("[sovereign-dlp-guardrail-e2e] failed:", error.message || error);
  process.exitCode = 1;
}
