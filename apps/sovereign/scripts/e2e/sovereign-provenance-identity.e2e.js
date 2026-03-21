#!/usr/bin/env node
/* eslint-disable no-console */
const {
  readTaskProvenance,
  withProvenanceMetadata,
  mergeProvenanceResultMeta
} = require("../lib/task-provenance");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message} (expected=${expected}, actual=${actual})`);
  }
}

function stageMapping() {
  const issueTask = {
    id: "task-issue-1",
    issueNumber: 204,
    threadId: "thread-issue-1"
  };
  const issuePayload = {
    kind: "issue_task_enqueue",
    provenance: {
      chainId: "chain-issue-1",
      issueNumber: 204,
      createdById: "user-42",
      createdByEmail: "owner@example.com",
      channel: "issue",
      sourceKind: "issue_task_enqueue",
      sourceRef: "issue:204",
      actorType: "HUMAN_USER",
      actorUserId: "user-42",
      actorEmail: "owner@example.com",
      threadId: "thread-issue-1"
    }
  };

  const issueProvenance = readTaskProvenance(issuePayload, issueTask);
  assertEqual(issueProvenance.chainId, "chain-issue-1", "issue provenance chain mismatch");
  assertEqual(issueProvenance.channel, "issue", "issue channel mismatch");
  assertEqual(issueProvenance.sourceKind, "issue_task_enqueue", "issue sourceKind mismatch");
  assertEqual(issueProvenance.actorType, "HUMAN_USER", "issue actorType mismatch");
  assertEqual(issueProvenance.actorEmail, "owner@example.com", "issue actorEmail mismatch");

  const emailTask = {
    id: "task-email-1",
    issueNumber: null,
    threadId: "thread-email-inbox"
  };
  const emailPayload = {
    kind: "email_ingress_task",
    provenance: {
      chainId: "chain-email-1",
      channel: "email",
      sourceKind: "email_ingress_task",
      sourceRef: "email-event:inbound-1",
      actorType: "EXTERNAL_SENDER",
      actorEmail: "sender@example.com",
      actorExternalId: "sender@example.com",
      actorDisplayName: "Sender Name",
      ingressEventId: "inbound-1",
      threadId: "thread-email-inbox"
    }
  };
  const emailProvenance = readTaskProvenance(emailPayload, emailTask);
  assertEqual(emailProvenance.channel, "email", "email channel mismatch");
  assertEqual(emailProvenance.actorType, "EXTERNAL_SENDER", "email actorType mismatch");
  assertEqual(emailProvenance.ingressEventId, "inbound-1", "email ingress event mismatch");
  assertEqual(emailProvenance.actorDisplayName, "Sender Name", "email actor display mismatch");

  const fallback = readTaskProvenance({ value: "no provenance" }, { id: "task-fallback-1" });
  assertEqual(fallback.chainId, "task-fallback-1", "fallback chain mismatch");
  assertEqual(fallback.channel, null, "fallback channel should be null");

  return {
    issueMapped: true,
    emailMapped: true,
    fallbackMapped: true
  };
}

function stageCarryForward() {
  const sourceTask = {
    id: "task-source-1",
    issueNumber: 204,
    threadId: "thread-issue-1"
  };
  const sourcePayload = {
    provenance: {
      chainId: "chain-carry-1",
      issueNumber: 204,
      channel: "issue",
      sourceKind: "issue_task_enqueue",
      sourceRef: "issue:204",
      actorType: "HUMAN_USER",
      actorUserId: "user-42",
      actorEmail: "owner@example.com",
      threadId: "thread-issue-1"
    },
    taskControl: {
      state: {
        lastAction: "INTERRUPT",
        resumeAllowed: true
      }
    }
  };

  const resumedPayload = {
    ...sourcePayload,
    resumedFromTaskId: sourceTask.id,
    taskControl: {
      state: {
        lastAction: "RESUME",
        resumeAllowed: false
      }
    }
  };
  const resumedTask = {
    id: "task-resume-1",
    issueNumber: 204,
    threadId: "thread-issue-1"
  };

  const sourceProvenance = readTaskProvenance(sourcePayload, sourceTask);
  const resumedProvenance = readTaskProvenance(resumedPayload, resumedTask);

  assertEqual(resumedProvenance.chainId, sourceProvenance.chainId, "resume chain should carry");
  assertEqual(resumedProvenance.channel, sourceProvenance.channel, "resume channel should carry");
  assertEqual(
    resumedProvenance.actorUserId,
    sourceProvenance.actorUserId,
    "resume actor user should carry"
  );

  const passOne = JSON.stringify(readTaskProvenance(resumedPayload, resumedTask));
  const passTwo = JSON.stringify(readTaskProvenance(resumedPayload, resumedTask));
  assertEqual(passOne, passTwo, "provenance mapping should be deterministic");

  return {
    resumeCarryForward: true,
    deterministic: true
  };
}

function stageMetadataProjection() {
  const provenance = {
    chainId: "chain-meta-1",
    issueNumber: 204,
    taskId: "task-meta-1",
    channel: "chat",
    sourceKind: "chat_mention_tool_call",
    sourceRef: "thread:global",
    actorType: "HUMAN_USER",
    actorUserId: "u-chat-1",
    actorEmail: "chat@example.com"
  };

  const lifecycleMeta = withProvenanceMetadata(provenance, { action: "check" });
  assertEqual(lifecycleMeta.provenanceChannel, "chat", "lifecycle projection channel mismatch");
  assertEqual(
    lifecycleMeta.provenanceSourceKind,
    "chat_mention_tool_call",
    "lifecycle projection source kind mismatch"
  );

  const resultMeta = mergeProvenanceResultMeta(
    { provider: "openai", model: "gpt-4o-mini" },
    provenance,
    { approvalTokenId: "token-1" }
  );
  assertEqual(resultMeta.provenanceActorEmail, "chat@example.com", "result projection actor mismatch");
  assertEqual(resultMeta.approvalTokenId, "token-1", "result projection approval mismatch");

  return {
    lifecycleProjection: true,
    resultProjection: true
  };
}

async function main() {
  const startedAt = Date.now();
  const summary = {
    runId: `sovereign-provenance-identity-e2e-${new Date().toISOString()}`,
    stages: {}
  };

  summary.stages.mapping = stageMapping();
  summary.stages.carryForward = stageCarryForward();
  summary.stages.metadataProjection = stageMetadataProjection();
  summary.durationMs = Date.now() - startedAt;
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error("[sovereign-provenance-identity-e2e] failed:", error.message || error);
  process.exitCode = 1;
});
