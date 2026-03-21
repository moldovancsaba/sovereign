function asRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value;
}

function normalizeText(value) {
  const normalized = String(value || "").trim();
  return normalized || null;
}

function normalizeIssueNumber(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  const normalized = Math.trunc(parsed);
  return normalized > 0 ? normalized : null;
}

function readTaskProvenance(payload, task) {
  const payloadRecord = asRecord(payload);
  const provenance = asRecord(payloadRecord?.provenance);
  const issueNumber =
    normalizeIssueNumber(provenance?.issueNumber) ?? normalizeIssueNumber(task?.issueNumber);

  return {
    chainId: normalizeText(provenance?.chainId) || normalizeText(task?.id),
    issueNumber,
    taskId: normalizeText(task?.id) || normalizeText(provenance?.taskId),
    createdById: normalizeText(provenance?.createdById),
    createdByEmail: normalizeText(provenance?.createdByEmail),
    createdAt: normalizeText(provenance?.createdAt),
    channel: normalizeText(provenance?.channel),
    sourceKind: normalizeText(provenance?.sourceKind),
    sourceRef: normalizeText(provenance?.sourceRef),
    actorType: normalizeText(provenance?.actorType),
    actorUserId: normalizeText(provenance?.actorUserId),
    actorEmail: normalizeText(provenance?.actorEmail),
    actorExternalId: normalizeText(provenance?.actorExternalId),
    actorDisplayName: normalizeText(provenance?.actorDisplayName),
    ingressEventId: normalizeText(provenance?.ingressEventId),
    threadId: normalizeText(provenance?.threadId) || normalizeText(task?.threadId),
    approvalTokenId: normalizeText(provenance?.approvalTokenId),
    approverUserId: normalizeText(provenance?.approverUserId),
    approverEmail: normalizeText(provenance?.approverEmail)
  };
}

function withProvenanceMetadata(provenance, metadata = {}) {
  return {
    ...metadata,
    provenanceChainId: provenance?.chainId || null,
    provenanceIssueNumber: provenance?.issueNumber ?? null,
    provenanceTaskId: provenance?.taskId || null,
    provenanceCreatedById: provenance?.createdById || null,
    provenanceCreatedByEmail: provenance?.createdByEmail || null,
    provenanceCreatedAt: provenance?.createdAt || null,
    provenanceChannel: provenance?.channel || null,
    provenanceSourceKind: provenance?.sourceKind || null,
    provenanceSourceRef: provenance?.sourceRef || null,
    provenanceActorType: provenance?.actorType || null,
    provenanceActorUserId: provenance?.actorUserId || null,
    provenanceActorEmail: provenance?.actorEmail || null,
    provenanceActorExternalId: provenance?.actorExternalId || null,
    provenanceActorDisplayName: provenance?.actorDisplayName || null,
    provenanceIngressEventId: provenance?.ingressEventId || null,
    provenanceThreadId: provenance?.threadId || null,
    provenanceApprovalTokenId: provenance?.approvalTokenId || null,
    provenanceApproverUserId: provenance?.approverUserId || null,
    provenanceApproverEmail: provenance?.approverEmail || null
  };
}

function mergeProvenanceResultMeta(meta, provenance, extras = {}) {
  const base = asRecord(meta) ? meta : {};
  return withProvenanceMetadata(provenance, {
    ...base,
    ...extras
  });
}

module.exports = {
  readTaskProvenance,
  withProvenanceMetadata,
  mergeProvenanceResultMeta
};
