import { redirect } from "next/navigation";
import { Shell } from "@/components/Shell";
import { getProjectMeta, reconcileBoardAgentOptions } from "@/lib/github";
import { buildAgentReadinessChecklist } from "@/lib/agent-readiness";
import { permissionMatrixRows } from "@/lib/lifecycle-policy";
import { getOrchestratorLeaseSnapshot } from "@/lib/orchestrator-lease";
import { prisma } from "@/lib/prisma";
import { readSentinelSquadSettings } from "@/lib/settings-store";
import { requireSession } from "@/lib/session";
import { listUnifiedChatAgentAvailability } from "@/lib/active-agents";
import { AGENT_MODEL_PRESETS } from "@/lib/model-presets";
import {
  isRuntimeRunnable,
  listRunningWorkers
} from "@/lib/worker-process";

export const dynamic = "force-dynamic";

import {
  createAgentAction,
  adminOverrideManualRequiredAction,
  deleteAgentConfigAction,
  mergeCaseVariantAgentKeysAction,
  saveAgentConfigAction,
  startAgentWorkerAction,
  stopAgentWorkerAction,
  updateAgentReadinessAction,
  updateAgentSmokeTestAction
} from "@/app/agents/actions";

export const dynamic = "force-dynamic";

function heartbeatStatus(a: {
  runtime: string;
  lastHeartbeatAt: Date | null;
  runnable: boolean;
  isRunning: boolean;
  sharedWorkerCoverage: boolean;
}) {
  if (a.runtime === "MANUAL") return { label: "MANUAL", tone: "muted" as const };
  if (a.sharedWorkerCoverage) return { label: "ONLINE", tone: "good" as const };
  // For runnable agents, process state is authoritative for immediate online/offline UX.
  if (a.runnable && !a.isRunning) return { label: "OFFLINE", tone: "bad" as const };
  if (!a.lastHeartbeatAt) return { label: "OFFLINE", tone: "bad" as const };
  const ageMs = Date.now() - a.lastHeartbeatAt.getTime();
  if (ageMs <= 15_000) return { label: "ONLINE", tone: "good" as const };
  if (ageMs <= 60_000) return { label: "STALE", tone: "warn" as const };
  return { label: "OFFLINE", tone: "bad" as const };
}

function readinessRank(readiness: "NOT_READY" | "READY" | "PAUSED") {
  if (readiness === "READY") return 3;
  if (readiness === "PAUSED") return 2;
  return 1;
}

function pickRecommendedCanonicalKey(
  agents: Array<{
    key: string;
    runtime: "MANUAL" | "LOCAL" | "CLOUD";
    readiness: "NOT_READY" | "READY" | "PAUSED";
    enabled: boolean;
    smokeTestPassedAt: Date | null;
    lastHeartbeatAt: Date | null;
  }>,
  taskCountByKey: Map<string, number>
) {
  return agents
    .slice()
    .sort((a, b) => {
      const scoreA =
        (isRuntimeRunnable(a.runtime) ? 100 : 0) +
        (a.enabled ? 30 : 0) +
        readinessRank(a.readiness) * 10 +
        (a.smokeTestPassedAt ? 8 : 0) +
        (a.lastHeartbeatAt ? 6 : 0) +
        Math.min(taskCountByKey.get(a.key) || 0, 20);
      const scoreB =
        (isRuntimeRunnable(b.runtime) ? 100 : 0) +
        (b.enabled ? 30 : 0) +
        readinessRank(b.readiness) * 10 +
        (b.smokeTestPassedAt ? 8 : 0) +
        (b.lastHeartbeatAt ? 6 : 0) +
        Math.min(taskCountByKey.get(b.key) || 0, 20);
      if (scoreB !== scoreA) return scoreB - scoreA;
      return a.key.localeCompare(b.key);
    })[0]?.key;
}

function leaseHealthClass(health: "HEALTHY" | "EXPIRING" | "STALE" | "UNHELD") {
  if (health === "HEALTHY") {
    return "border-emerald-300/25 bg-emerald-200/10 text-emerald-50";
  }
  if (health === "EXPIRING") {
    return "border-amber-300/25 bg-amber-200/10 text-amber-50";
  }
  if (health === "STALE") {
    return "border-rose-300/25 bg-rose-200/10 text-rose-50";
  }
  return "border-white/15 bg-white/5 text-white/70";
}

function formatLeaseTtl(ttlMs: number | null) {
  if (ttlMs === null) return "(n/a)";
  if (ttlMs <= 0) return "expired";
  if (ttlMs < 1_000) return "<1s";
  return `${Math.ceil(ttlMs / 1000)}s`;
}

function getTasteRubricVersion(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const value = (metadata as Record<string, unknown>).tasteRubricVersion;
  if (typeof value !== "string" || !value.trim()) return null;
  return value.trim();
}

export default async function AgentsPage() {
  const session = await requireSession();
  if (!session) redirect("/signin");

  const settings = await readSentinelSquadSettings();
  const planningSyncEnabled =
    process.env.SOVEREIGN_ENABLE_GITHUB_BOARD === "true" ||
    process.env.SENTINELSQUAD_ENABLE_GITHUB_BOARD === "true";
  let boardAgents: string[] = [];
  let boardLoadError: string | null = null;
  if (planningSyncEnabled) {
    try {
      const meta = await getProjectMeta();
      const agentField = meta.fields.find((f) => f.name === "Agent");
      boardAgents = agentField?.options?.map((o) => o.name) ?? [];
    } catch (e) {
      boardLoadError = e instanceof Error ? e.message : String(e);
    }
  }

  // Seed settings-only agent configs into local registry.
  for (const row of settings.agents) {
    // eslint-disable-next-line no-await-in-loop
    const existing = await prisma.agent.findFirst({
      where: { key: { equals: row.agentName, mode: "insensitive" } },
      select: { key: true }
    });
    if (existing?.key) continue;
    // eslint-disable-next-line no-await-in-loop
    await prisma.agent.create({
      data: {
        key: row.agentName,
        displayName: row.agentName,
        runtime: "MANUAL"
      }
    });
  }

  const [dbAgents, availability] = await Promise.all([
    prisma.agent.findMany({ orderBy: { displayName: "asc" } }),
    listUnifiedChatAgentAvailability()
  ]);
  const visibleAgents = dbAgents.filter((a) => a.runtime !== "MANUAL");
  const availabilityByKey = new Map(
    availability.map((agent) => [agent.key.toLowerCase(), agent])
  );
  const boardAgentReconciliation = reconcileBoardAgentOptions({
    boardAgentOptions: boardAgents,
    dbAgents: visibleAgents.map((a) => ({
      key: a.key,
      displayName: a.displayName,
      enabled: a.enabled,
      runtime: a.runtime
    }))
  });
  const taskCounts = await prisma.agentTask.groupBy({
    by: ["agentKey"],
    _count: { _all: true }
  });
  const taskCountByKey = new Map(taskCounts.map((row) => [row.agentKey, row._count._all]));
  const settingsByAgentName = new Map(
    settings.agents.map((row) => [row.agentName.toLowerCase(), row])
  );
  const boardAgentSet = new Set(boardAgents.map((k) => k.toLowerCase()));
  const runningWorkers = listRunningWorkers();
  const leaseSnapshot = await getOrchestratorLeaseSnapshot();
  const lifecycleRows = permissionMatrixRows();
  const lifecycleAudits = await prisma.lifecycleAuditEvent.findMany({
    orderBy: { createdAt: "desc" },
    take: 10
  });
  const runningKeys = new Set(
    runningWorkers.map((w) => w.agentKey).filter(Boolean) as string[]
  );
  const hasAnyWorkerProcess = runningWorkers.length > 0;
  const hasHealthyOrchestrator =
    hasAnyWorkerProcess &&
    Boolean(leaseSnapshot.ownerAgentKey) &&
    (leaseSnapshot.health === "HEALTHY" || leaseSnapshot.health === "EXPIRING");
  const duplicateGroups = Array.from(
    dbAgents.reduce((acc, row) => {
      const key = row.key.toLowerCase();
      const existing = acc.get(key);
      if (existing) existing.push(row);
      else acc.set(key, [row]);
      return acc;
    }, new Map<string, typeof dbAgents>())
  )
    .map(([lowerKey, rows]) => ({
      lowerKey,
      rows: rows.sort((a, b) => a.key.localeCompare(b.key))
    }))
    .filter((group) => group.rows.length > 1)
    .sort((a, b) => a.lowerKey.localeCompare(b.lowerKey));
  const alphaCount = visibleAgents.filter((a) => a.controlRole === "ALPHA").length;
  const betaCount = visibleAgents.filter((a) => a.controlRole !== "ALPHA").length;

  return (
    <Shell
      title="Agents"
      subtitle="Local agent registry (DB) with optional board-linked discovery"
    >
      <div className="mb-3 rounded-2xl border border-white/12 bg-white/5 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold">Orchestrator hard lease</div>
            <div className="mt-1 text-xs text-white/65">
              Single-authority lock for task lifecycle writes.
            </div>
          </div>
          <div
            className={`rounded-full border px-2 py-0.5 text-xs ${leaseHealthClass(
              leaseSnapshot.health
            )}`}
          >
            {leaseSnapshot.health}
          </div>
        </div>
        <div className="mt-3 grid gap-2 text-xs text-white/75 md:grid-cols-2">
          <div className="rounded-xl border border-white/10 bg-black/15 px-3 py-2">
            <div>
              Holder:{" "}
              <span className="font-mono text-white/85">
                {leaseSnapshot.ownerId || "(none)"}
              </span>
            </div>
            <div className="mt-1 text-white/60">
              Agent:{" "}
              {leaseSnapshot.ownerAgentKey
                ? `@${leaseSnapshot.ownerAgentKey} (${leaseSnapshot.ownerAgentRole || "unknown"})`
                : "(n/a)"}
            </div>
            <div className="mt-1 text-white/60">
              Host/PID:{" "}
              {leaseSnapshot.ownerHost
                ? `${leaseSnapshot.ownerHost}:${leaseSnapshot.ownerPid ?? "?"}`
                : "(n/a)"}
            </div>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/15 px-3 py-2">
            <div>
              TTL: <span className="font-mono text-white/85">{formatLeaseTtl(leaseSnapshot.ttlMs)}</span>
            </div>
            <div className="mt-1 text-white/60">
              Expires:{" "}
              {leaseSnapshot.expiresAt
                ? new Date(leaseSnapshot.expiresAt).toLocaleString()
                : "(none)"}
            </div>
            <div className="mt-1 text-white/60">
              Last heartbeat:{" "}
              {leaseSnapshot.lastHeartbeatAt
                ? new Date(leaseSnapshot.lastHeartbeatAt).toLocaleString()
                : "(none)"}
            </div>
          </div>
        </div>
        <div className="mt-2 text-[11px] text-white/55">
          Last audit:{" "}
          {leaseSnapshot.lastAudit
            ? `${leaseSnapshot.lastAudit.code} @ ${new Date(
                leaseSnapshot.lastAudit.createdAt
              ).toLocaleString()}`
            : "(none)"}
        </div>
        {leaseSnapshot.lastAudit ? (
          <div className="mt-1 text-[11px] text-white/70">{leaseSnapshot.lastAudit.message}</div>
        ) : null}
      </div>
      <div className="mb-3 rounded-2xl border border-white/12 bg-white/5 p-4">
        <div className="text-sm font-semibold">Permission matrix + lifecycle audit</div>
        <div className="mt-1 text-xs text-white/65">
          Deterministic transition policy (allowed/denied with explicit reasons).
        </div>
        <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
          <span className="rounded-full border border-cyan-300/25 bg-cyan-200/10 px-2 py-0.5 text-cyan-100">
            ALPHA agents: {alphaCount}
          </span>
          <span className="rounded-full border border-indigo-300/25 bg-indigo-200/10 px-2 py-0.5 text-indigo-100">
            BETA agents: {betaCount}
          </span>
        </div>
        <div className="mt-3 space-y-2">
          {lifecycleRows.map((row) => (
            <div
              key={row.role}
              className="rounded-xl border border-white/10 bg-black/15 px-3 py-2 text-xs text-white/75"
            >
              <div className="font-mono text-[11px] text-white/80">{row.role}</div>
              <div className="mt-1 text-white/70">Allowed: {row.allowed}</div>
              <div className="mt-1 text-white/55">Denied: {row.denied}</div>
            </div>
          ))}
        </div>
        <div className="mt-3 text-[11px] text-white/60">Recent lifecycle events</div>
        <div className="mt-2 space-y-1.5">
          {lifecycleAudits.map((event) => {
            const tasteRubricVersion = getTasteRubricVersion(event.metadata);
            return (
              <div
                key={event.id}
                className="rounded-lg border border-white/10 bg-black/20 px-2 py-1.5 text-[11px]"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full border px-1.5 py-0.5 ${
                      event.allowed
                        ? "border-emerald-300/25 bg-emerald-200/10 text-emerald-100"
                        : "border-rose-300/25 bg-rose-200/10 text-rose-100"
                    }`}
                  >
                    {event.allowed ? "ALLOW" : "DENY"}
                  </span>
                  <span className="font-mono text-white/75">
                    {event.actorRole}:{event.action}
                  </span>
                  <span className="text-white/50">{new Date(event.createdAt).toLocaleString()}</span>
                </div>
                <div className="mt-1 text-white/70">
                  {event.entityType}:{event.entityId || "(n/a)"} {event.fromState || "(n/a)"} -&gt;{" "}
                  {event.toState || "(n/a)"}
                </div>
                <div className="mt-0.5 text-white/55">{event.reason}</div>
                {tasteRubricVersion ? (
                  <div className="mt-0.5 text-white/55">
                    Taste rubric:{" "}
                    <span className="font-mono text-white/75">{tasteRubricVersion}</span>
                  </div>
                ) : null}
              </div>
            );
          })}
          {lifecycleAudits.length === 0 ? (
            <div className="text-[11px] text-white/55">(no lifecycle events yet)</div>
          ) : null}
        </div>
      </div>
      <div className="mb-3 rounded-2xl border border-white/12 bg-white/5 p-4">
        <div className="text-sm font-semibold">Add agent</div>
        <div className="mt-1 text-xs text-white/60">
          Creates (or updates) an agent in local registry. New/changed runtime starts as `NOT_READY`.
        </div>
        <form action={createAgentAction} className="mt-3 grid gap-2 sm:grid-cols-6">
          <label className="text-[11px] text-white/65 sm:col-span-2">
            Agent key
            <input
              name="agentKey"
              placeholder="Nova"
              className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-2 py-1.5 text-xs text-white/90"
            />
          </label>
          <label className="text-[11px] text-white/65">
            Display name
            <input
              name="displayName"
              placeholder="Nova"
              className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-2 py-1.5 text-xs text-white/90"
            />
          </label>
          <label className="text-[11px] text-white/65">
            Runtime
            <select
              name="runtime"
              defaultValue="CLOUD"
              className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-2 py-1.5 text-xs text-white/90"
            >
              <option value="CLOUD">CLOUD</option>
              <option value="LOCAL">LOCAL</option>
            </select>
          </label>
          <label className="text-[11px] text-white/65">
            Role
            <select
              name="controlRole"
              defaultValue="BETA"
              className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-2 py-1.5 text-xs text-white/90"
            >
              <option value="BETA">BETA</option>
              <option value="ALPHA">ALPHA</option>
            </select>
          </label>
          <div className="flex items-end gap-2">
            <input type="hidden" name="enabled" value="0" />
            <label className="flex items-center gap-1 text-[11px] text-white/65">
              <input
                type="checkbox"
                name="enabled"
                value="1"
                defaultChecked
                className="h-3.5 w-3.5 rounded border border-white/20 bg-black/30"
              />
              Enabled
            </label>
            <button
              type="submit"
              className="rounded-lg border border-emerald-300/25 bg-emerald-200/10 px-2.5 py-1 text-[11px] font-medium text-emerald-50 hover:bg-emerald-200/20"
            >
              Add
            </button>
          </div>
        </form>
      </div>
      <div className="mb-3 rounded-2xl border border-white/12 bg-white/5 p-4">
        <div className="text-sm font-semibold">Board Agent integrity</div>
        <div className="mt-1 text-xs text-white/65">
          Reconciliation between GitHub Project <code>Agent</code> options and DB runtime agents.
        </div>
        <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
          <span className="rounded-full border border-emerald-300/25 bg-emerald-200/10 px-2 py-0.5 text-emerald-50">
            Mapped: {boardAgentReconciliation.mappedCount}
          </span>
          <span className="rounded-full border border-amber-300/25 bg-amber-200/10 px-2 py-0.5 text-amber-50">
            Unmapped board options: {boardAgentReconciliation.unmappedCount}
          </span>
          <span className="rounded-full border border-cyan-300/25 bg-cyan-200/10 px-2 py-0.5 text-cyan-50">
            DB-only runtime agents: {boardAgentReconciliation.dbOnlyAgents.length}
          </span>
        </div>
        {boardAgentReconciliation.unmappedCount ? (
          <div className="mt-3 rounded-xl border border-amber-300/20 bg-amber-200/10 px-3 py-2 text-xs text-amber-100">
            Board options without DB runtime match:{" "}
            {boardAgentReconciliation.optionRows
              .filter((row) => row.status === "UNMAPPED")
              .map((row) => row.boardOption)
              .join(", ")}
          </div>
        ) : null}
        {boardAgentReconciliation.dbOnlyAgents.length ? (
          <div className="mt-2 rounded-xl border border-cyan-300/20 bg-cyan-200/10 px-3 py-2 text-xs text-cyan-100">
            Runtime DB agents not present as board options:{" "}
            {boardAgentReconciliation.dbOnlyAgents
              .map((row) => `@${row.key}`)
              .join(", ")}
          </div>
        ) : null}
      </div>
      {duplicateGroups.length ? (
        <div className="mb-3 rounded-2xl border border-amber-300/20 bg-amber-200/10 p-4">
          <div className="text-sm font-semibold text-amber-100">
            Legacy case-variant duplicate keys
          </div>
          <div className="mt-1 text-xs text-amber-100/80">
            Safe merge will reassign all <code>AgentTask.agentKey</code> rows first, then remove the duplicate
            agent rows. Task history stays intact.
          </div>
          <div className="mt-3 space-y-2">
            {duplicateGroups.map((group) => {
              const recommended = pickRecommendedCanonicalKey(
                group.rows.map((row) => ({
                  key: row.key,
                  runtime: row.runtime,
                  readiness: row.readiness ?? "NOT_READY",
                  enabled: row.enabled,
                  smokeTestPassedAt: row.smokeTestPassedAt,
                  lastHeartbeatAt: row.lastHeartbeatAt
                })),
                taskCountByKey
              );
              return (
                <form
                  key={group.lowerKey}
                  action={mergeCaseVariantAgentKeysAction}
                  className="rounded-xl border border-amber-200/20 bg-black/20 p-3"
                >
                  <div className="text-xs font-semibold text-amber-50">
                    {group.rows.map((row) => `@${row.key}`).join(", ")}
                  </div>
                  <div className="mt-1 text-[11px] text-amber-100/75">
                    Choose canonical key:
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <select
                      name="canonicalKey"
                      defaultValue={recommended}
                      className="rounded-lg border border-amber-200/20 bg-black/30 px-2 py-1 text-[11px] text-amber-50"
                    >
                      {group.rows.map((row) => (
                        <option key={row.key} value={row.key}>
                          {row.key} · {row.runtime} · {row.readiness ?? "NOT_READY"} · tasks:
                          {taskCountByKey.get(row.key) || 0}
                        </option>
                      ))}
                    </select>
                    <button
                      type="submit"
                      className="rounded-lg border border-amber-300/25 bg-amber-200/20 px-2.5 py-1 text-[11px] font-medium text-amber-50 hover:bg-amber-200/25"
                    >
                      Merge variants
                    </button>
                  </div>
                </form>
              );
            })}
          </div>
        </div>
      ) : null}
      {planningSyncEnabled && boardLoadError ? (
        <div className="mb-3 rounded-xl border border-amber-300/25 bg-amber-200/10 px-3 py-2 text-xs text-amber-100">
          Optional planning sync unavailable: {boardLoadError}
        </div>
      ) : null}
      <div className="grid gap-3 md:grid-cols-2">
        {visibleAgents.map((a) => {
          const key = a.key;
          const unifiedAvailability = availabilityByKey.get(key.toLowerCase()) ?? null;
          const agentConfig = settingsByAgentName.get(key.toLowerCase()) || null;
          const runnable =
            isRuntimeRunnable(a.runtime) && a.enabled && a.controlRole === "ALPHA";
          const directRunning = runningKeys.has(key);
          const sharedWorkerCoverage =
            !directRunning &&
            a.enabled &&
            isRuntimeRunnable(a.runtime) &&
            a.controlRole !== "ALPHA" &&
            hasHealthyOrchestrator;
          const isRunning = directRunning || sharedWorkerCoverage;
          const readiness = a.readiness ?? "NOT_READY";
          const checklist = buildAgentReadinessChecklist({
            agent: a,
            config: agentConfig,
            isRunning,
            sharedWorkerCoverage
          });
          const hb = heartbeatStatus({
            runtime: a.runtime,
            lastHeartbeatAt: a.lastHeartbeatAt,
            runnable,
            isRunning,
            sharedWorkerCoverage
          });
          const statusClass =
            hb?.tone === "good"
              ? "border-emerald-300/25 bg-emerald-200/10 text-emerald-50"
              : hb?.tone === "warn"
              ? "border-amber-300/25 bg-amber-200/10 text-amber-50"
              : hb?.tone === "bad"
              ? "border-rose-300/25 bg-rose-200/10 text-rose-50"
              : "border-white/15 bg-white/5 text-white/70";
          const readinessClass =
            readiness === "READY"
              ? "border-emerald-300/25 bg-emerald-200/10 text-emerald-50"
              : readiness === "PAUSED"
              ? "border-amber-300/25 bg-amber-200/10 text-amber-50"
              : "border-rose-300/25 bg-rose-200/10 text-rose-50";

          return (
            <div
              key={key}
              className="rounded-2xl border border-white/12 bg-white/5 p-5"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="text-lg font-semibold">{a.displayName || key}</div>
                <div className="flex items-center gap-2">
                  <div className={`rounded-full border px-2 py-0.5 text-xs ${statusClass}`}>
                    {hb.label}
                  </div>
                  <div className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-xs text-white/70">
                    {a.runtime}
                  </div>
                  <div
                    className={`rounded-full border px-2 py-0.5 text-xs ${
                      a.enabled
                        ? "border-emerald-300/25 bg-emerald-200/10 text-emerald-50"
                        : "border-rose-300/25 bg-rose-200/10 text-rose-50"
                    }`}
                  >
                    {a.enabled ? "Enabled" : "Disabled"}
                  </div>
                  <div className={`rounded-full border px-2 py-0.5 text-xs ${readinessClass}`}>
                    {readiness}
                  </div>
                  <div
                    className={`rounded-full border px-2 py-0.5 text-xs ${
                      a.controlRole === "ALPHA"
                        ? "border-cyan-300/25 bg-cyan-200/10 text-cyan-50"
                        : "border-indigo-300/25 bg-indigo-200/10 text-indigo-50"
                    }`}
                  >
                    {a.controlRole}
                  </div>
                  <div className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-xs text-white/60">
                    {boardAgentSet.has(key.toLowerCase()) ? "Board-linked" : "Local-only"}
                  </div>
                  {unifiedAvailability ? (
                    <div
                      className={`rounded-full border px-2 py-0.5 text-xs ${
                        unifiedAvailability.active
                          ? "border-emerald-300/25 bg-emerald-200/10 text-emerald-50"
                          : "border-amber-300/25 bg-amber-200/10 text-amber-50"
                      }`}
                    >
                      {unifiedAvailability.active ? "Unified Chat Active" : "Unified Chat Inactive"}
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="mt-2 text-sm text-white/70">
                Model: {a.model ?? "(not set)"}{" "}
              </div>
              <div className="mt-1 text-sm text-white/70">
                Host: {a.host ?? "(not set)"}
              </div>
              <div className="mt-1 text-xs text-white/60 font-mono">
                Last heartbeat: {a.lastHeartbeatAt ? new Date(a.lastHeartbeatAt).toLocaleString() : "(none)"}
              </div>
              {sharedWorkerCoverage ? (
                <div className="mt-1 text-[11px] text-cyan-100/85">
                  Shared coverage: active ALPHA orchestrator worker is handling this agent runtime.
                </div>
              ) : null}
              {unifiedAvailability && !unifiedAvailability.active ? (
                <div className="mt-1 text-[11px] text-amber-100/85">
                  Unified chat inactive: {unifiedAvailability.reason || "No execution coverage."}
                </div>
              ) : null}
              <div className="mt-4 rounded-xl border border-white/10 bg-black/15 p-3">
                <div className="text-xs font-semibold text-white/75">Readiness checklist</div>
                <div className="mt-2 space-y-1.5">
                  {checklist?.items.map((item) => (
                    <div key={item.key} className="rounded-lg border border-white/10 bg-black/20 px-2 py-1.5">
                      <div className="flex items-center justify-between gap-2 text-[11px]">
                        <span className="text-white/75">{item.label}</span>
                        <span className={item.ok ? "text-emerald-200" : "text-rose-200"}>
                          {item.ok ? "PASS" : "FAIL"}
                        </span>
                      </div>
                      <div className="mt-0.5 text-[11px] text-white/60">{item.detail}</div>
                    </div>
                  ))}
                </div>
                {!checklist?.checklistReady ? (
                  <div className="mt-2 text-[11px] text-rose-100/85">
                    Blocked until all checks pass.
                  </div>
                ) : (
                  <div className="mt-2 text-[11px] text-emerald-100/85">
                    Checklist complete.
                  </div>
                )}
                <form action={updateAgentReadinessAction} className="mt-3 flex items-center gap-2">
                  <input type="hidden" name="agentKey" value={key} />
                  <select
                    name="readiness"
                    defaultValue={readiness}
                    className="rounded-lg border border-white/15 bg-black/30 px-2 py-1 text-[11px] text-white/90"
                  >
                    <option value="NOT_READY">NOT_READY</option>
                    <option value="READY">READY</option>
                    <option value="PAUSED">PAUSED</option>
                  </select>
                  <button
                    type="submit"
                    className="rounded-lg border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-medium text-white/90 hover:bg-white/15"
                  >
                    Set readiness
                  </button>
                </form>
                <div className="mt-2 flex items-center gap-2">
                  <form action={updateAgentSmokeTestAction}>
                    <input type="hidden" name="agentKey" value={key} />
                    <input type="hidden" name="passed" value="1" />
                    <button
                      type="submit"
                      className="rounded-lg border border-emerald-300/25 bg-emerald-200/10 px-2.5 py-1 text-[11px] font-medium text-emerald-50 hover:bg-emerald-200/20"
                    >
                      Mark smoke PASS
                    </button>
                  </form>
                  <form action={updateAgentSmokeTestAction}>
                    <input type="hidden" name="agentKey" value={key} />
                    <input type="hidden" name="passed" value="0" />
                    <button
                      type="submit"
                      className="rounded-lg border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-medium text-white/85 hover:bg-white/15"
                    >
                      Reset smoke
                    </button>
                  </form>
                </div>
                <form action={adminOverrideManualRequiredAction} className="mt-2 flex items-center gap-2">
                  <input type="hidden" name="agentKey" value={key} />
                  <input
                    type="hidden"
                    name="reason"
                    value="Manual override from /agents: force queued/running tasks to MANUAL_REQUIRED."
                  />
                  <button
                    type="submit"
                    className="rounded-lg border border-amber-300/25 bg-amber-200/10 px-2.5 py-1 text-[11px] font-medium text-amber-50 hover:bg-amber-200/20"
                  >
                    Admin override -&gt; MANUAL_REQUIRED
                  </button>
                </form>
              </div>
              <div className="mt-4 text-xs text-white/60">
                v1: registry is local. Next: enable/disable, cost class, allowed repos, worker heartbeat.
              </div>
              <div className="mt-4 rounded-xl border border-white/10 bg-black/15 p-3">
                <div className="text-xs font-semibold text-white/75">Agent config</div>
                <div className="mt-1 text-[11px] text-white/55">
                  API keys stay in env files. Store only env var names here.
                </div>
                <form action={saveAgentConfigAction} className="mt-3 grid gap-2">
                  <input type="hidden" name="agentId" value={agentConfig?.agentId ?? ""} />
                  <input type="hidden" name="agentName" value={key} />
                  <div className="text-[11px] text-white/60 font-mono">
                    id: {agentConfig?.agentId ?? "(auto-generated on first save)"}
                  </div>
                  <label className="text-[11px] text-white/65">
                    API URL
                    <input
                      name="agentUrl"
                      defaultValue={agentConfig?.agentUrl ?? ""}
                      placeholder="https://api.openai.com/v1"
                      className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-2 py-1.5 text-xs text-white/90"
                    />
                  </label>
                  <label className="text-[11px] text-white/65">
                    Model
                    <input
                      list="agent-model-presets"
                      name="agentModel"
                      defaultValue={agentConfig?.agentModel ?? ""}
                      placeholder="Granite-4.0-H-1B"
                      className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-2 py-1.5 text-xs text-white/90"
                    />
                  </label>
                  <datalist id="agent-model-presets">
                    {AGENT_MODEL_PRESETS.map((model) => (
                      <option key={model} value={model} />
                    ))}
                  </datalist>
                  <label className="text-[11px] text-white/65">
                    API key env var
                    <input
                      name="agentApiKeyEnv"
                      defaultValue={agentConfig?.agentApiKeyEnv ?? ""}
                      placeholder="OPENAI_API_KEY"
                      className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-2 py-1.5 text-xs text-white/90"
                    />
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="submit"
                      className="rounded-lg border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-medium text-white/90 hover:bg-white/15"
                    >
                      Save config
                    </button>
                  </div>
                </form>
                {agentConfig ? (
                  <form action={deleteAgentConfigAction} className="mt-2">
                    <input type="hidden" name="agentId" value={agentConfig.agentId} />
                    <input type="hidden" name="agentName" value={key} />
                    <button
                      type="submit"
                      className="rounded-lg border border-rose-300/25 bg-rose-200/10 px-2.5 py-1 text-[11px] font-medium text-rose-50 hover:bg-rose-200/20"
                    >
                      Delete config
                    </button>
                  </form>
                ) : null}
              </div>
              {runnable ? (
                <div className="mt-4 flex items-center gap-2">
                  {!isRunning ? (
                    <form action={startAgentWorkerAction}>
                      <input type="hidden" name="agentKey" value={key} />
                      <button
                        type="submit"
                        className="rounded-xl border border-emerald-300/25 bg-emerald-200/10 px-3 py-1.5 text-xs font-medium text-emerald-50 hover:bg-emerald-200/20"
                      >
                        Start Worker
                      </button>
                    </form>
                  ) : (
                    <form action={stopAgentWorkerAction}>
                      <input type="hidden" name="agentKey" value={key} />
                      <button
                        type="submit"
                        className="rounded-xl border border-rose-300/25 bg-rose-200/10 px-3 py-1.5 text-xs font-medium text-rose-50 hover:bg-rose-200/20"
                      >
                        Stop Worker
                      </button>
                    </form>
                  )}
                  <div className="text-xs text-white/65">
                    {directRunning
                      ? "Process running"
                      : sharedWorkerCoverage
                      ? "Covered by shared ALPHA orchestrator"
                      : "Process stopped"}
                  </div>
                </div>
              ) : (
                <div className="mt-4 text-xs text-white/55">
                  {!a.enabled
                    ? "Agent is disabled."
                    : a.controlRole !== "ALPHA"
                    ? "BETA role: execution-only (cannot run control-plane worker)."
                    : "Manual agent (no runnable worker in this version)."}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {visibleAgents.length === 0 ? (
        <div className="mt-4 rounded-xl border border-white/12 bg-white/5 px-3 py-2 text-xs text-white/70">
          No runnable agents yet. Configure at least one agent with runtime `LOCAL` or `CLOUD`.
        </div>
      ) : null}
    </Shell>
  );
}
