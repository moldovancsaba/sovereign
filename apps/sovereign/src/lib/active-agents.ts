import { prisma } from "@/lib/prisma";
import { sovereignEnv } from "@/lib/env-sovereign";
import { getOrchestratorLeaseSnapshot } from "@/lib/orchestrator-lease";
import { isRuntimeRunnable, listRunningWorkers } from "@/lib/worker-process";

const HEARTBEAT_MAX_AGE_MS = Number(
  sovereignEnv("SOVEREIGN_HEARTBEAT_MAX_AGE_MS", "SENTINELSQUAD_HEARTBEAT_MAX_AGE_MS") || "120000"
);

export type UnifiedChatAgentAvailability = {
  key: string;
  displayName: string;
  runtime: "LOCAL" | "CLOUD" | "MANUAL";
  controlRole: "ALPHA" | "BETA";
  readiness: "NOT_READY" | "READY" | "PAUSED";
  model: string | null;
  active: boolean;
  reason: string | null;
};

export type UnifiedChatAgentResolution = {
  agent: UnifiedChatAgentAvailability | null;
  fallback: boolean;
  requested: string;
};

export type UnifiedChatAgentLookup = {
  agent: UnifiedChatAgentAvailability | null;
  requested: string;
};

function hasUnifiedChatCoverage(params: {
  enabled: boolean;
  runtime: "LOCAL" | "CLOUD" | "MANUAL";
  controlRole: "ALPHA" | "BETA";
  readiness: "NOT_READY" | "READY" | "PAUSED";
  directRunning: boolean;
  hasRecentHeartbeat: boolean;
  leaseOwnedByAgent: boolean;
  hasHealthyOrchestrator: boolean;
}) {
  if (!params.enabled) {
    return {
      active: false,
      reason: "Agent is disabled."
    };
  }
  if (!isRuntimeRunnable(params.runtime)) {
    return {
      active: false,
      reason: `Agent runtime ${params.runtime} is not runnable in unified chat.`
    };
  }
  if (params.readiness !== "READY") {
    return {
      active: false,
      reason: `Agent readiness is ${params.readiness}.`
    };
  }
  if (params.directRunning || params.leaseOwnedByAgent || params.hasRecentHeartbeat) {
    return {
      active: true,
      reason: null
    };
  }
  if (params.controlRole === "BETA" && params.hasHealthyOrchestrator) {
    return {
      active: true,
      reason: null
    };
  }
  return {
    active: false,
    reason:
      params.controlRole === "ALPHA"
        ? "No active ALPHA worker is running for this agent."
        : "No healthy ALPHA orchestrator worker is available to execute BETA tasks."
  };
}

export async function listUnifiedChatAgentAvailability(): Promise<
  UnifiedChatAgentAvailability[]
> {
  const [agents, leaseSnapshot] = await Promise.all([
    prisma.agent.findMany({
      where: {
        enabled: true,
        runtime: { in: ["LOCAL", "CLOUD"] }
      },
      orderBy: { displayName: "asc" },
      select: {
        key: true,
        displayName: true,
        runtime: true,
        controlRole: true,
        readiness: true,
        enabled: true,
        model: true,
        lastHeartbeatAt: true
      }
    }),
    getOrchestratorLeaseSnapshot()
  ]);

  const runningWorkers = listRunningWorkers();
  const runningKeys = new Set(
    runningWorkers.map((worker) => worker.agentKey).filter(Boolean) as string[]
  );
  const hasHealthyOrchestrator =
    runningWorkers.length > 0 &&
    Boolean(leaseSnapshot.ownerAgentKey) &&
    (leaseSnapshot.health === "HEALTHY" || leaseSnapshot.health === "EXPIRING");

  return agents.map((agent) => {
    const directRunning = runningKeys.has(agent.key);
    const lastHeartbeatMs = agent.lastHeartbeatAt ? new Date(agent.lastHeartbeatAt).getTime() : 0;
    const hasRecentHeartbeat =
      Boolean(lastHeartbeatMs) && Date.now() - lastHeartbeatMs <= HEARTBEAT_MAX_AGE_MS;
    const leaseOwnerKey = leaseSnapshot.ownerAgentKey?.toLowerCase() || null;
    const leaseOwnedByAgent =
      Boolean(leaseOwnerKey) &&
      leaseOwnerKey === agent.key.toLowerCase() &&
      (leaseSnapshot.health === "HEALTHY" || leaseSnapshot.health === "EXPIRING");
    const coverage = hasUnifiedChatCoverage({
      enabled: agent.enabled,
      runtime: agent.runtime,
      controlRole: agent.controlRole,
      readiness: agent.readiness,
      directRunning,
      hasRecentHeartbeat,
      leaseOwnedByAgent,
      hasHealthyOrchestrator
    });

    return {
      key: agent.key,
      displayName: agent.displayName,
      runtime: agent.runtime,
      controlRole: agent.controlRole,
      readiness: agent.readiness,
      model: agent.model,
      active: coverage.active,
      reason: coverage.reason
    };
  });
}

export async function resolveUnifiedChatControllerAgent(
  requestedKey: string
): Promise<UnifiedChatAgentResolution> {
  const agents = await listUnifiedChatAgentAvailability();
  const exact = agents.find(
    (agent) => agent.key.toLowerCase() === requestedKey.toLowerCase()
  );
  if (exact?.active) {
    return {
      agent: exact,
      fallback: false,
      requested: requestedKey
    };
  }

  const fallbackAlpha = agents.find(
    (agent) => agent.active && agent.controlRole === "ALPHA"
  );
  return {
    agent: fallbackAlpha ?? null,
    fallback: Boolean(fallbackAlpha),
    requested: requestedKey
  };
}

export async function resolveUnifiedChatAgent(
  requestedKey: string
): Promise<UnifiedChatAgentLookup> {
  const agents = await listUnifiedChatAgentAvailability();
  return {
    agent:
      agents.find((agent) => agent.key.toLowerCase() === requestedKey.toLowerCase()) ?? null,
    requested: requestedKey
  };
}
