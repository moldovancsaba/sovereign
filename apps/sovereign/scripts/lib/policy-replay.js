const {
  resolveTaskMemoryConfig,
  evaluateTaskMemoryPolicy
} = require("./task-memory");
const { evaluateNbaOrchestrationPolicy } = require("./omnichannel-routing");

function asRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value;
}

function normalizeText(value) {
  const normalized = String(value || "").trim();
  return normalized || "";
}

function normalizeUpper(value) {
  return normalizeText(value).toUpperCase();
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

function isoString(value) {
  if (value instanceof Date) return value.toISOString();
  const parsed = Date.parse(String(value || ""));
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toISOString();
}

function normalizeNbaChannels(value) {
  if (!Array.isArray(value)) return null;
  const out = value
    .map((entry) => normalizeText(entry).toLowerCase())
    .filter(Boolean);
  return out.length ? Array.from(new Set(out)) : null;
}

function readMetadataIssueNumber(metadata) {
  return (
    normalizeIssueNumber(metadata?.issueNumber) ??
    normalizeIssueNumber(metadata?.provenanceIssueNumber) ??
    null
  );
}

function readMetadataThreadId(metadata) {
  return normalizeText(metadata?.threadId || metadata?.provenanceThreadId || "") || null;
}

function readMetadataProjectSessionId(metadata) {
  return normalizeText(metadata?.projectSessionId || "") || null;
}

function materializeQuery(queryLength) {
  const len = clampInt(queryLength, 24, 0, 5000);
  if (len <= 0) return "";
  return "q".repeat(len);
}

function buildPolicyReplayRequest(params = {}) {
  const payloadRecord = asRecord(params.payload);
  const replayRecord = asRecord(payloadRecord?.policyReplay);
  const candidatePolicyRecord = asRecord(replayRecord?.candidatePolicy);
  const task = asRecord(params.task);

  const enabled = replayRecord?.enabled === true;
  const issueNumber =
    normalizeIssueNumber(replayRecord?.issueNumber) ??
    normalizeIssueNumber(task?.issueNumber) ??
    null;
  const threadId =
    normalizeText(replayRecord?.threadId || task?.threadId || "") || null;

  return {
    enabled,
    mode: "READ_ONLY",
    baselineVersion: normalizeText(replayRecord?.baselineVersion) || "governance-current",
    candidateVersion: normalizeText(replayRecord?.candidateVersion) || "governance-candidate",
    lookbackHours: clampInt(replayRecord?.lookbackHours, 72, 1, 24 * 90),
    sampleLimit: clampInt(replayRecord?.sampleLimit, 80, 10, 300),
    issueNumber,
    threadId,
    candidatePolicy: {
      memoryQueryMaxChars:
        candidatePolicyRecord?.memoryQueryMaxChars == null
          ? null
          : clampInt(candidatePolicyRecord.memoryQueryMaxChars, 280, 40, 4000),
      nbaHumanGateMinImpact:
        normalizeUpper(candidatePolicyRecord?.nbaHumanGateMinImpact || "") || "HIGH",
      nbaAllowedChannels: normalizeNbaChannels(candidatePolicyRecord?.nbaAllowedChannels)
    }
  };
}

function selectReplayEvidence(params = {}) {
  const request = params.request || {};
  const evidenceEvents = Array.isArray(params.evidenceEvents) ? params.evidenceEvents : [];
  const filtered = evidenceEvents.filter((event) => {
    if (!event || typeof event !== "object") return false;
    if (event.action !== "MEMORY_RETRIEVAL_POLICY" && event.action !== "NBA_APPROVAL_EVALUATED") {
      return false;
    }
    const metadata = asRecord(event.metadata);
    if (!metadata) return false;
    if (request.issueNumber != null) {
      const issueNumber = readMetadataIssueNumber(metadata);
      if (issueNumber !== request.issueNumber) return false;
    }
    if (request.threadId) {
      const threadId = readMetadataThreadId(metadata);
      if (!threadId || threadId !== request.threadId) return false;
    }
    return true;
  });

  const ordered = filtered
    .slice()
    .sort((a, b) => {
      const left = Date.parse(isoString(a.createdAt) || "");
      const right = Date.parse(isoString(b.createdAt) || "");
      if (left !== right) return left - right;
      return String(a.id || "").localeCompare(String(b.id || ""));
    });

  if (ordered.length <= request.sampleLimit) return ordered;
  return ordered.slice(ordered.length - request.sampleLimit);
}

function replayMemoryDecision(event, baselineConfig, candidateConfig) {
  const metadata = asRecord(event.metadata) || {};
  const query = materializeQuery(metadata.queryLength);
  const request = {
    query,
    scope: normalizeUpper(metadata.scope) || "THREAD",
    mode: normalizeUpper(metadata.mode) || "READ",
    enabled: typeof metadata.enabled === "boolean" ? metadata.enabled : true,
    threadId: readMetadataThreadId(metadata),
    issueNumber: readMetadataIssueNumber(metadata),
    projectSessionId: readMetadataProjectSessionId(metadata),
    documentLimit: clampInt(metadata.documentLimit, baselineConfig.defaultDocumentLimit, 10, 200),
    maxSnippets: clampInt(metadata.maxSnippets, baselineConfig.defaultMaxSnippets, 1, 8),
    snippetMaxChars: clampInt(
      metadata.snippetMaxChars,
      baselineConfig.defaultSnippetMaxChars,
      80,
      800
    ),
    requestedScope: normalizeUpper(metadata.requestedScope) || null,
    requestedMode: normalizeUpper(metadata.requestedMode) || null,
    requestedEnabled:
      typeof metadata.requestedEnabled === "boolean" ? metadata.requestedEnabled : null,
    requestedDocumentLimit:
      typeof metadata.requestedDocumentLimit === "number"
        ? Math.trunc(metadata.requestedDocumentLimit)
        : null,
    requestedMaxSnippets:
      typeof metadata.requestedMaxSnippets === "number"
        ? Math.trunc(metadata.requestedMaxSnippets)
        : null,
    requestedSnippetMaxChars:
      typeof metadata.requestedSnippetMaxChars === "number"
        ? Math.trunc(metadata.requestedSnippetMaxChars)
        : null
  };

  const baseline = evaluateTaskMemoryPolicy(request, baselineConfig);
  const candidate = evaluateTaskMemoryPolicy(request, candidateConfig);
  return { request, baseline, candidate };
}

function replayNbaDecision(event, request) {
  const metadata = asRecord(event.metadata) || {};
  const sourceChannel = normalizeText(metadata.channel) || "system";
  const command = normalizeText(metadata.command) || "@Agent review policy routing";
  const approval = {
    approved: metadata.humanGateApproved === true,
    approverUserId: normalizeText(metadata.humanGateApproverUserId) || null,
    approverEmail: normalizeText(metadata.humanGateApproverEmail) || null,
    approvedAt: normalizeText(metadata.humanGateApprovedAt) || null,
    decisionRef: normalizeText(metadata.humanGateDecisionRef) || null
  };
  const baseline = evaluateNbaOrchestrationPolicy({ sourceChannel, command, approval });
  const candidate = evaluateNbaOrchestrationPolicy(
    { sourceChannel, command, approval },
    {
      humanGateMinImpact: request.candidatePolicy.nbaHumanGateMinImpact,
      allowedChannels: request.candidatePolicy.nbaAllowedChannels
    }
  );
  return { sourceChannel, command, approval, baseline, candidate };
}

function buildDecisionDelta(event, domain, baseline, candidate) {
  const changed =
    baseline.allowed !== candidate.allowed ||
    baseline.code !== candidate.code ||
    baseline.reason !== candidate.reason;
  const regression = baseline.allowed === true && candidate.allowed === false;
  const improvement = baseline.allowed === false && candidate.allowed === true;
  return {
    eventId: normalizeText(event.id) || null,
    action: normalizeText(event.action) || null,
    createdAt: isoString(event.createdAt),
    domain,
    changed,
    regression,
    improvement,
    baseline: {
      allowed: baseline.allowed,
      code: baseline.code,
      reason: baseline.reason
    },
    candidate: {
      allowed: candidate.allowed,
      code: candidate.code,
      reason: candidate.reason
    }
  };
}

function runPolicyReplaySimulation(params = {}) {
  const request = params.request || buildPolicyReplayRequest(params);
  const selectedEvidence = selectReplayEvidence({
    request,
    evidenceEvents: params.evidenceEvents
  });
  const baselineMemoryConfig = resolveTaskMemoryConfig(params.env || process.env);
  const candidateMemoryConfig = {
    ...baselineMemoryConfig,
    queryMaxChars:
      request.candidatePolicy.memoryQueryMaxChars == null
        ? baselineMemoryConfig.queryMaxChars
        : request.candidatePolicy.memoryQueryMaxChars
  };
  const results = [];
  const skipped = [];

  for (const event of selectedEvidence) {
    if (event.action === "MEMORY_RETRIEVAL_POLICY") {
      const replay = replayMemoryDecision(event, baselineMemoryConfig, candidateMemoryConfig);
      results.push(
        buildDecisionDelta(event, "MEMORY_POLICY", replay.baseline, replay.candidate)
      );
      continue;
    }
    if (event.action === "NBA_APPROVAL_EVALUATED") {
      const replay = replayNbaDecision(event, request);
      results.push(
        buildDecisionDelta(event, "NBA_ROUTING_POLICY", replay.baseline, replay.candidate)
      );
      continue;
    }
    skipped.push({
      eventId: normalizeText(event.id) || null,
      action: normalizeText(event.action) || null,
      reason: "Unsupported replay event action."
    });
  }

  const deltas = results.filter((result) => result.changed);
  const regressionCount = deltas.filter((result) => result.regression).length;
  const improvementCount = deltas.filter((result) => result.improvement).length;
  const nowIso = isoString(params.nowIso || new Date()) || new Date().toISOString();

  return {
    mode: request.mode || "READ_ONLY",
    generatedAt: nowIso,
    baselineVersion: request.baselineVersion,
    candidateVersion: request.candidateVersion,
    source: {
      issueNumber: request.issueNumber ?? null,
      threadId: request.threadId || null,
      lookbackHours: request.lookbackHours,
      sampleLimit: request.sampleLimit
    },
    candidatePolicy: request.candidatePolicy,
    totals: {
      evidenceCount: selectedEvidence.length,
      replayedCount: results.length,
      deltaCount: deltas.length,
      regressionCount,
      improvementCount,
      skippedCount: skipped.length
    },
    deltas,
    skipped
  };
}

function buildPolicyReplayResultSummary(report) {
  const totals = report?.totals || {};
  const regressions = Number(totals.regressionCount || 0);
  const deltas = Number(totals.deltaCount || 0);
  if (regressions > 0) {
    return `Replay detected ${regressions} regression risk(s) across ${deltas} changed decision(s).`;
  }
  if (deltas > 0) {
    return `Replay detected ${deltas} changed decision(s) with no strict regressions.`;
  }
  return "Replay detected no decision deltas.";
}

function formatPolicyReplayReport(report) {
  const totals = report?.totals || {};
  const topDeltas = Array.isArray(report?.deltas) ? report.deltas.slice(0, 8) : [];
  const lines = [
    "Policy replay simulation (read-only)",
    `- baselineVersion: ${report?.baselineVersion || "n/a"}`,
    `- candidateVersion: ${report?.candidateVersion || "n/a"}`,
    `- mode: ${report?.mode || "READ_ONLY"}`,
    `- source: issue=${report?.source?.issueNumber ?? "n/a"} thread=${report?.source?.threadId || "n/a"} window=${report?.source?.lookbackHours || 0}h`,
    `- evidence: replayed=${totals.replayedCount || 0} deltas=${totals.deltaCount || 0} regressions=${totals.regressionCount || 0} improvements=${totals.improvementCount || 0}`,
    `- summary: ${buildPolicyReplayResultSummary(report)}`
  ];
  if (topDeltas.length) {
    lines.push("- top deltas:");
    for (const delta of topDeltas) {
      lines.push(
        `  - ${delta.domain} ${delta.action || "UNKNOWN"}: ` +
          `${delta.baseline.code}/${delta.baseline.allowed ? "allow" : "deny"} -> ` +
          `${delta.candidate.code}/${delta.candidate.allowed ? "allow" : "deny"}`
      );
    }
  }
  return lines.join("\n");
}

module.exports = {
  buildPolicyReplayRequest,
  runPolicyReplaySimulation,
  buildPolicyReplayResultSummary,
  formatPolicyReplayReport
};
