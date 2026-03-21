import { prisma } from "@/lib/prisma";

export const ORCHESTRATOR_LEASE_ID = "sovereign-primary-orchestrator";

export type LeaseHealth = "HEALTHY" | "EXPIRING" | "STALE" | "UNHELD";

export type OrchestratorLeaseSnapshot = {
  leaseId: string;
  ownerId: string | null;
  ownerHost: string | null;
  ownerPid: number | null;
  ownerAgentKey: string | null;
  ownerAgentRole: "ALPHA" | "BETA" | null;
  acquiredAt: Date | null;
  expiresAt: Date | null;
  lastHeartbeatAt: Date | null;
  heartbeatCount: number;
  held: boolean;
  health: LeaseHealth;
  ttlMs: number | null;
  lastAudit: {
    code: string;
    message: string;
    createdAt: Date;
  } | null;
};

function leaseTtlMs() {
  const raw = Number(
    process.env.SOVEREIGN_ORCHESTRATOR_LEASE_TTL_MS ||
      process.env.SENTINELSQUAD_ORCHESTRATOR_LEASE_TTL_MS ||
      "20000"
  );
  if (!Number.isFinite(raw)) return 20_000;
  return Math.min(Math.max(Math.trunc(raw), 5_000), 300_000);
}

function resolveLeaseHealth(params: { ownerId: string | null; ttlMs: number | null }) {
  if (!params.ownerId || params.ttlMs === null) return "UNHELD" as const;
  if (params.ttlMs <= 0) return "STALE" as const;
  if (params.ttlMs <= Math.max(Math.floor(leaseTtlMs() / 4), 5_000)) {
    return "EXPIRING" as const;
  }
  return "HEALTHY" as const;
}

export async function getOrchestratorLeaseSnapshot(): Promise<OrchestratorLeaseSnapshot> {
  await prisma.orchestratorLease.upsert({
    where: { id: ORCHESTRATOR_LEASE_ID },
    create: { id: ORCHESTRATOR_LEASE_ID },
    update: {}
  });

  const lease = await prisma.orchestratorLease.findUnique({
    where: { id: ORCHESTRATOR_LEASE_ID }
  });
  const lastAudit = await prisma.orchestratorLeaseAudit.findFirst({
    where: { leaseId: ORCHESTRATOR_LEASE_ID },
    orderBy: { createdAt: "desc" },
    select: {
      code: true,
      message: true,
      createdAt: true
    }
  });

  const nowMs = Date.now();
  const ownerId = lease?.ownerId ?? null;
  const ownerAgentRole =
    lease?.ownerAgentKey
      ? (
          await prisma.agent.findFirst({
            where: { key: { equals: lease.ownerAgentKey, mode: "insensitive" } },
            select: { controlRole: true }
          })
        )?.controlRole ?? null
      : null;
  const expiresAt = lease?.expiresAt ?? null;
  const ttlMs = expiresAt ? expiresAt.getTime() - nowMs : null;
  const held = Boolean(ownerId && ttlMs !== null && ttlMs > 0);

  return {
    leaseId: ORCHESTRATOR_LEASE_ID,
    ownerId,
    ownerHost: lease?.ownerHost ?? null,
    ownerPid: lease?.ownerPid ?? null,
    ownerAgentKey: lease?.ownerAgentKey ?? null,
    ownerAgentRole,
    acquiredAt: lease?.acquiredAt ?? null,
    expiresAt,
    lastHeartbeatAt: lease?.lastHeartbeatAt ?? null,
    heartbeatCount: lease?.heartbeatCount ?? 0,
    held,
    health: resolveLeaseHealth({ ownerId, ttlMs }),
    ttlMs,
    lastAudit: lastAudit
      ? {
          code: lastAudit.code,
          message: lastAudit.message,
          createdAt: lastAudit.createdAt
        }
      : null
  };
}
