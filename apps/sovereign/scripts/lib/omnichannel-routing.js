function normalizeText(value) {
  const normalized = String(value || "").trim();
  return normalized || "";
}

function normalizeChannel(value) {
  const raw = normalizeText(value).toLowerCase();
  if (!raw) return "system";
  return raw;
}

function normalizeImpact(value, fallback = "HIGH") {
  const raw = normalizeText(value).toUpperCase();
  if (raw === "LOW" || raw === "MEDIUM" || raw === "HIGH") return raw;
  return fallback;
}

function asRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value;
}

function normalizeAllowedChannels(value) {
  if (!Array.isArray(value)) return null;
  const normalized = value
    .map((entry) => normalizeChannel(entry))
    .filter(Boolean);
  if (!normalized.length) return null;
  return new Set(normalized);
}

const CHANNEL_CONTRACT = Object.freeze({
  issue: Object.freeze({
    channel: "issue",
    routeClass: "ISSUE_THREAD_EXECUTION",
    reason: "Issue-origin task route is bound to issue thread execution lane."
  }),
  chat: Object.freeze({
    channel: "chat",
    routeClass: "CHAT_COORDINATION_EXECUTION",
    reason: "Chat-origin task route is bound to coordinated chat execution lane."
  }),
  email: Object.freeze({
    channel: "email",
    routeClass: "EMAIL_TRIAGE_EXECUTION",
    reason: "Email-origin task route is bound to controlled triage execution lane."
  }),
  system: Object.freeze({
    channel: "system",
    routeClass: "SYSTEM_POLICY_EXECUTION",
    reason: "System-origin task route is bound to policy fallback execution lane."
  })
});

const IMPACT_RANK = Object.freeze({
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3
});

function resolveOmnichannelRoute(sourceChannel, policy = null) {
  const policyRecord = asRecord(policy);
  const allowedChannels = normalizeAllowedChannels(policyRecord?.allowedChannels);
  const normalizedChannel = normalizeChannel(sourceChannel);
  if (allowedChannels && !allowedChannels.has(normalizedChannel)) {
    return {
      allowed: false,
      code: "OMNICHANNEL_CHANNEL_UNSUPPORTED",
      reason: `Unsupported source channel "${normalizedChannel}" for omnichannel routing.`,
      channel: normalizedChannel,
      routeClass: null
    };
  }
  const contract = CHANNEL_CONTRACT[normalizedChannel];
  if (!contract) {
    return {
      allowed: false,
      code: "OMNICHANNEL_CHANNEL_UNSUPPORTED",
      reason: `Unsupported source channel "${normalizedChannel}" for omnichannel routing.`,
      channel: normalizedChannel,
      routeClass: null
    };
  }
  return {
    allowed: true,
    code: "OMNICHANNEL_ROUTE_ALLOWED",
    reason: contract.reason,
    channel: contract.channel,
    routeClass: contract.routeClass
  };
}

function classifyNbaImpact(command) {
  const text = normalizeText(command).toLowerCase();
  if (!text) return "LOW";
  if (
    /\b(deploy|production|prod|rollback|rotate secret|secret|credential|drop table|delete data|erase|payment|refund|legal|compliance|security incident|customer outreach)\b/i.test(
      text
    )
  ) {
    return "HIGH";
  }
  if (/\b(release|migration|migrate|merge|push|pr|incident)\b/i.test(text)) {
    return "MEDIUM";
  }
  return "LOW";
}

function normalizeNbaApproval(input) {
  const record = asRecord(input);
  const approved = record?.approved === true;
  const approverUserId = normalizeText(record?.approverUserId) || null;
  const approverEmail = normalizeText(record?.approverEmail) || null;
  const approvedAt = normalizeText(record?.approvedAt) || null;
  const decisionRef = normalizeText(record?.decisionRef) || null;
  const validIdentity = Boolean(approverUserId || approverEmail);
  const validApprovedAt = Boolean(approvedAt);
  const valid = approved && validIdentity && validApprovedAt;
  return {
    approved: valid,
    approverUserId,
    approverEmail,
    approvedAt,
    decisionRef
  };
}

function evaluateNbaOrchestrationPolicy(params, policy = null) {
  const policyRecord = asRecord(policy);
  const route = resolveOmnichannelRoute(params?.sourceChannel, policyRecord);
  const impact = classifyNbaImpact(params?.command);
  const humanGateMinImpact = normalizeImpact(policyRecord?.humanGateMinImpact, "HIGH");
  const requiresHumanGate =
    IMPACT_RANK[impact] >= IMPACT_RANK[humanGateMinImpact];
  const approval = normalizeNbaApproval(params?.approval);
  if (!route.allowed) {
    return {
      allowed: false,
      code: route.code,
      reason: route.reason,
      channel: route.channel,
      routeClass: route.routeClass,
      impact,
      requiresHumanGate,
      humanGateMinImpact,
      approval
    };
  }
  if (requiresHumanGate && !approval.approved) {
    return {
      allowed: false,
      code: "NBA_HUMAN_GATE_REQUIRED",
      reason:
        "High-impact NBA route denied: explicit human decision is required before execution.",
      channel: route.channel,
      routeClass: route.routeClass,
      impact,
      requiresHumanGate,
      humanGateMinImpact,
      approval
    };
  }
  return {
    allowed: true,
    code: "NBA_ROUTE_ALLOWED",
    reason:
      requiresHumanGate
        ? "High-impact NBA route approved by explicit human decision."
        : "NBA route allowed by omnichannel policy.",
    channel: route.channel,
    routeClass: route.routeClass,
    impact,
    requiresHumanGate,
    humanGateMinImpact,
    approval
  };
}

function buildNbaRoutingMetadata(decision, extras = {}) {
  return {
    code: decision.code,
    channel: decision.channel,
    routeClass: decision.routeClass,
    impact: decision.impact,
    requiresHumanGate: decision.requiresHumanGate,
    humanGateMinImpact: decision.humanGateMinImpact || "HIGH",
    humanGateApproved: decision.approval?.approved === true,
    humanGateApproverUserId: decision.approval?.approverUserId || null,
    humanGateApproverEmail: decision.approval?.approverEmail || null,
    humanGateApprovedAt: decision.approval?.approvedAt || null,
    humanGateDecisionRef: decision.approval?.decisionRef || null,
    ...extras
  };
}

module.exports = {
  CHANNEL_CONTRACT,
  IMPACT_RANK,
  resolveOmnichannelRoute,
  classifyNbaImpact,
  normalizeNbaApproval,
  evaluateNbaOrchestrationPolicy,
  buildNbaRoutingMetadata
};
