import { getOrchestratorLeaseSnapshot } from "@/lib/orchestrator-lease";
import { listActiveProjectAlphaLocks } from "@/lib/alpha-context";
import { prisma } from "@/lib/prisma";

export type IntrospectionState = "OK" | "STALE" | "MISSING" | "UNKNOWN";

export type OrchestratorIntrospectionSnapshot = {
  generatedAt: string;
  lease: {
    state: IntrospectionState;
    reason: string;
    ownerId: string | null;
    ownerAgentKey: string | null;
    ownerAgentRole: "ALPHA" | "BETA" | null;
    health: "HEALTHY" | "EXPIRING" | "STALE" | "UNHELD";
    ttlMs: number | null;
    lastHeartbeatAt: string | null;
    acquiredAt: string | null;
    lastAuditCode: string | null;
  };
  contextLocks: {
    state: IntrospectionState;
    reason: string;
    totalActiveLocks: number;
    blockedLocks: number;
    warningLocks: number;
    activeOwners: string[];
  };
  tasks: {
    state: IntrospectionState;
    reason: string;
    totalOpen: number;
    queued: number;
    running: number;
    manualRequired: number;
    deadLetter: number;
    done: number;
    oldestQueuedAt: string | null;
    oldestRunningAt: string | null;
    staleRunningCount: number;
  };
  failures: {
    state: IntrospectionState;
    reason: string;
    totalRecent: number;
    highSeverityRecent: number;
    latestFailureClass: string | null;
  };
  errors: Array<{
    component: "LEASE" | "CONTEXT" | "TASKS" | "FAILURES";
    message: string;
  }>;
};

function isoOrNull(value: Date | null | undefined) {
  return value instanceof Date ? value.toISOString() : null;
}

function staleRunningThresholdMs() {
  const leaseTtl = Number(
    process.env.SOVEREIGN_ORCHESTRATOR_LEASE_TTL_MS ||
      process.env.SENTINELSQUAD_ORCHESTRATOR_LEASE_TTL_MS ||
      "20000"
  );
  const fallback = Math.max((Number.isFinite(leaseTtl) ? leaseTtl : 20_000) * 2, 30_000);
  const raw = Number(
    process.env.SOVEREIGN_ORCHESTRATOR_STALE_RUNNING_MS ||
      process.env.SENTINELSQUAD_ORCHESTRATOR_STALE_RUNNING_MS ||
      String(fallback)
  );
  if (!Number.isFinite(raw)) return fallback;
  return Math.min(Math.max(Math.trunc(raw), 5_000), 3_600_000);
}

export async function getOrchestratorIntrospectionSnapshot(): Promise<OrchestratorIntrospectionSnapshot> {
  const generatedAt = new Date();
  const errors: OrchestratorIntrospectionSnapshot["errors"] = [];

  let lease: OrchestratorIntrospectionSnapshot["lease"] = {
    state: "UNKNOWN",
    reason: "Lease snapshot not loaded.",
    ownerId: null,
    ownerAgentKey: null,
    ownerAgentRole: null,
    health: "UNHELD",
    ttlMs: null,
    lastHeartbeatAt: null,
    acquiredAt: null,
    lastAuditCode: null
  };

  let contextLocks: OrchestratorIntrospectionSnapshot["contextLocks"] = {
    state: "UNKNOWN",
    reason: "Context lock snapshot not loaded.",
    totalActiveLocks: 0,
    blockedLocks: 0,
    warningLocks: 0,
    activeOwners: []
  };

  let tasks: OrchestratorIntrospectionSnapshot["tasks"] = {
    state: "UNKNOWN",
    reason: "Task pipeline snapshot not loaded.",
    totalOpen: 0,
    queued: 0,
    running: 0,
    manualRequired: 0,
    deadLetter: 0,
    done: 0,
    oldestQueuedAt: null,
    oldestRunningAt: null,
    staleRunningCount: 0
  };
  let failures: OrchestratorIntrospectionSnapshot["failures"] = {
    state: "UNKNOWN",
    reason: "Failure snapshot not loaded.",
    totalRecent: 0,
    highSeverityRecent: 0,
    latestFailureClass: null
  };

  try {
    const snapshot = await getOrchestratorLeaseSnapshot();
    const state: IntrospectionState =
      snapshot.health === "STALE"
        ? "STALE"
        : snapshot.health === "UNHELD"
        ? "MISSING"
        : "OK";
    const reason =
      state === "STALE"
        ? "Lease is stale or expired."
        : state === "MISSING"
        ? "No active lease holder."
        : snapshot.health === "EXPIRING"
        ? "Lease is active but nearing expiry."
        : "Lease is healthy.";

    lease = {
      state,
      reason,
      ownerId: snapshot.ownerId,
      ownerAgentKey: snapshot.ownerAgentKey,
      ownerAgentRole: snapshot.ownerAgentRole,
      health: snapshot.health,
      ttlMs: snapshot.ttlMs,
      lastHeartbeatAt: isoOrNull(snapshot.lastHeartbeatAt),
      acquiredAt: isoOrNull(snapshot.acquiredAt),
      lastAuditCode: snapshot.lastAudit?.code || null
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    errors.push({ component: "LEASE", message });
    lease = {
      ...lease,
      state: "UNKNOWN",
      reason: "Lease introspection failed."
    };
  }

  try {
    const locks = await listActiveProjectAlphaLocks(100);
    const blockedLocks = locks.filter((lock) => lock.activeWindow?.guardrailState === "BLOCKED").length;
    const warningLocks = locks.filter((lock) => lock.activeWindow?.guardrailState === "WARNING").length;

    let state: IntrospectionState = "OK";
    let reason = "Active context locks loaded.";
    if (locks.length === 0) {
      state = "MISSING";
      reason = "No active Alpha context locks.";
    } else if (blockedLocks > 0) {
      state = "STALE";
      reason = `${blockedLocks} active context lock(s) blocked by guardrail.`;
    } else if (warningLocks > 0) {
      state = "STALE";
      reason = `${warningLocks} active context lock(s) near guardrail threshold.`;
    }

    contextLocks = {
      state,
      reason,
      totalActiveLocks: locks.length,
      blockedLocks,
      warningLocks,
      activeOwners: Array.from(
        new Set(
          locks
            .map((lock) => lock.activeWindow?.ownerAgentKey || "")
            .filter(Boolean)
        )
      )
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    errors.push({ component: "CONTEXT", message });
    contextLocks = {
      ...contextLocks,
      state: "UNKNOWN",
      reason: "Context lock introspection failed."
    };
  }

  try {
    const [counts, oldestQueued, oldestRunning] = await Promise.all([
      prisma.agentTask.groupBy({
        by: ["status"],
        _count: { _all: true }
      }),
      prisma.agentTask.findFirst({
        where: { status: "QUEUED" },
        orderBy: { createdAt: "asc" },
        select: { createdAt: true }
      }),
      prisma.agentTask.findFirst({
        where: { status: "RUNNING" },
        orderBy: { startedAt: "asc" },
        select: { startedAt: true }
      })
    ]);

    const countByStatus = new Map(counts.map((row) => [row.status, row._count._all]));
    const queued = countByStatus.get("QUEUED") || 0;
    const running = countByStatus.get("RUNNING") || 0;
    const manualRequired = countByStatus.get("MANUAL_REQUIRED") || 0;
    const deadLetter = countByStatus.get("DEAD_LETTER") || 0;
    const done = countByStatus.get("DONE") || 0;

    const staleThreshold = staleRunningThresholdMs();
    const staleCutoff = new Date(Date.now() - staleThreshold);
    const staleRunningCount = await prisma.agentTask.count({
      where: {
        status: "RUNNING",
        startedAt: { lt: staleCutoff }
      }
    });

    let state: IntrospectionState = "OK";
    let reason = "Task pipeline healthy.";
    if (staleRunningCount > 0) {
      state = "STALE";
      reason = `${staleRunningCount} RUNNING task(s) exceeded stale threshold.`;
    } else if (queued + running + manualRequired + deadLetter === 0) {
      state = "MISSING";
      reason = "No task activity yet.";
    }

    tasks = {
      state,
      reason,
      totalOpen: queued + running + manualRequired + deadLetter,
      queued,
      running,
      manualRequired,
      deadLetter,
      done,
      oldestQueuedAt: isoOrNull(oldestQueued?.createdAt),
      oldestRunningAt: isoOrNull(oldestRunning?.startedAt),
      staleRunningCount
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    errors.push({ component: "TASKS", message });
    tasks = {
      ...tasks,
      state: "UNKNOWN",
      reason: "Task pipeline introspection failed."
    };
  }

  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [recentCount, highSeverityCount, latest] = await Promise.all([
      prisma.alphaFailureEvent.count({
        where: { createdAt: { gte: since } }
      }),
      prisma.alphaFailureEvent.count({
        where: { createdAt: { gte: since }, severity: "HIGH" }
      }),
      prisma.alphaFailureEvent.findFirst({
        orderBy: { createdAt: "desc" },
        select: { failureClass: true }
      })
    ]);

    let state: IntrospectionState = "OK";
    let reason = "No recent Alpha failure events.";
    if (recentCount === 0) {
      state = "MISSING";
      reason = "No failure events recorded in last 24h.";
    } else if (highSeverityCount > 0) {
      state = "STALE";
      reason = `${highSeverityCount} high-severity fallback event(s) in last 24h.`;
    } else {
      state = "OK";
      reason = `${recentCount} recent fallback event(s), no high-severity incidents.`;
    }

    failures = {
      state,
      reason,
      totalRecent: recentCount,
      highSeverityRecent: highSeverityCount,
      latestFailureClass: latest?.failureClass || null
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    errors.push({ component: "FAILURES", message });
    failures = {
      ...failures,
      state: "UNKNOWN",
      reason: "Failure-event introspection failed."
    };
  }

  return {
    generatedAt: generatedAt.toISOString(),
    lease,
    contextLocks,
    tasks,
    failures,
    errors
  };
}
