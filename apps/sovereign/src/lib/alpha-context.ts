import { prisma } from "@/lib/prisma";
import { validateAlphaHandoverPackage } from "@/lib/handover-package";
import {
  getLatestAlphaContextPackageInvariant,
  recordAlphaContextPackageInvariant
} from "@/lib/prompt-package-invariants";
import type { Prisma } from "@prisma/client";

type AlphaContextDb = Prisma.TransactionClient | typeof prisma;

const WARNING_THRESHOLD = 60;
const BLOCK_THRESHOLD = 70;
const DEFAULT_SCOPE_INCREMENT = 8;

type AgentResolution =
  | { ok: true; agentKey: string; displayName: string | null }
  | { ok: false; reason: string };

type LockedProjectRow = Prisma.ProjectAlphaLockGetPayload<{
  include: {
    activeWindow: {
      include: {
        ownerAgent: { select: { displayName: true } };
      };
    };
  };
}>;

export type AlphaContextGuardrailState =
  | "NO_ACTIVE_LOCK"
  | "OK"
  | "WARNING"
  | "BLOCKED"
  | "OVERRIDE_ACTIVE"
  | "PACKAGE_READY";

export type AlphaContextWindowSummary = {
  id: string;
  projectKey: string;
  projectName: string;
  ownerAgentKey: string;
  ownerAgentDisplayName: string | null;
  status: "OPEN" | "ACTIVE" | "TRANSFERRED" | "CLOSED";
  activationHandoverRef: string | null;
  transferHandoverRef: string | null;
  closeHandoverRef: string | null;
  continuityNote: string | null;
  contextUsagePercent: number;
  contextWarningAt: string | null;
  contextBlockedAt: string | null;
  handoverPackageRef: string | null;
  continuationPromptRef: string | null;
  handoverPackageReadyAt: string | null;
  guardrailOverrideUntil: string | null;
  guardrailOverrideReason: string | null;
  guardrailState: AlphaContextGuardrailState;
  predecessorId: string | null;
  activatedAt: string | null;
  transferredAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ProjectAlphaLockSnapshot = {
  projectKey: string;
  projectName: string;
  continuityRef: string | null;
  activatedAt: string | null;
  updatedAt: string | null;
  activeWindow: AlphaContextWindowSummary | null;
};

export type AlphaContextMutationResult = {
  ok: boolean;
  code:
    | "CONTEXT_ACTIVATED"
    | "CONTEXT_TRANSFERRED"
    | "CONTEXT_CLOSED"
    | "HANDOVER_PACKAGE_RECORDED"
    | "GUARDRAIL_OVERRIDE_SET"
    | "ACTIVATION_DENIED"
    | "TRANSFER_DENIED"
    | "CLOSE_DENIED"
    | "HANDOVER_PACKAGE_DENIED"
    | "GUARDRAIL_OVERRIDE_DENIED";
  reason: string;
  projectKey: string;
  projectName: string;
  activeWindowId: string | null;
};

export type AlphaContextScopeGateResult = {
  allowed: boolean;
  status: AlphaContextGuardrailState;
  reason: string;
  projectKey: string;
  projectName: string;
  activeWindowId: string | null;
  usagePercent: number;
};

export type AlphaContextAuditSummary = {
  id: string;
  actorRole: string;
  action: string;
  allowed: boolean;
  reason: string;
  windowId: string | null;
  conflictingWindowId: string | null;
  createdAt: string;
};

function normalizeText(input: string | null | undefined) {
  return String(input || "").trim();
}

function clampInt(input: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(input);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.trunc(parsed), min), max);
}

export function normalizeProjectIdentity(projectName: string) {
  const display = normalizeText(projectName);
  if (!display) {
    throw new Error("Project is required to manage Alpha context lock.");
  }
  return {
    projectKey: display.toLowerCase(),
    projectName: display
  };
}

function isoOrNull(value: Date | null | undefined) {
  return value instanceof Date ? value.toISOString() : null;
}

function hasHandoverPackage(window: {
  handoverPackageRef: string | null;
  continuationPromptRef: string | null;
  handoverPackageReadyAt: Date | null;
}) {
  return Boolean(
    window.handoverPackageReadyAt &&
      normalizeText(window.handoverPackageRef) &&
      normalizeText(window.continuationPromptRef)
  );
}

function hasActiveOverride(window: { guardrailOverrideUntil: Date | null }) {
  return Boolean(
    window.guardrailOverrideUntil && window.guardrailOverrideUntil.getTime() > Date.now()
  );
}

export function deriveGuardrailState(window: {
  contextUsagePercent: number;
  handoverPackageRef: string | null;
  continuationPromptRef: string | null;
  handoverPackageReadyAt: Date | null;
  guardrailOverrideUntil: Date | null;
}): AlphaContextGuardrailState {
  const usage = clampInt(window.contextUsagePercent, 0, 0, 100);
  const packageReady = hasHandoverPackage(window);
  const overrideActive = hasActiveOverride(window);

  if (usage >= BLOCK_THRESHOLD && !packageReady) {
    if (overrideActive) return "OVERRIDE_ACTIVE";
    return "BLOCKED";
  }
  if (usage >= WARNING_THRESHOLD) {
    return packageReady ? "PACKAGE_READY" : "WARNING";
  }
  if (packageReady) return "PACKAGE_READY";
  return "OK";
}

function mapWindow(
  row: LockedProjectRow["activeWindow"] | null
): AlphaContextWindowSummary | null {
  if (!row) return null;
  return {
    id: row.id,
    projectKey: row.projectKey,
    projectName: row.projectName,
    ownerAgentKey: row.ownerAgentKey,
    ownerAgentDisplayName: row.ownerAgent.displayName,
    status: row.status,
    activationHandoverRef: row.activationHandoverRef,
    transferHandoverRef: row.transferHandoverRef,
    closeHandoverRef: row.closeHandoverRef,
    continuityNote: row.continuityNote,
    contextUsagePercent: clampInt(row.contextUsagePercent, 0, 0, 100),
    contextWarningAt: isoOrNull(row.contextWarningAt),
    contextBlockedAt: isoOrNull(row.contextBlockedAt),
    handoverPackageRef: row.handoverPackageRef,
    continuationPromptRef: row.continuationPromptRef,
    handoverPackageReadyAt: isoOrNull(row.handoverPackageReadyAt),
    guardrailOverrideUntil: isoOrNull(row.guardrailOverrideUntil),
    guardrailOverrideReason: row.guardrailOverrideReason,
    guardrailState: deriveGuardrailState(row),
    predecessorId: row.predecessorId,
    activatedAt: isoOrNull(row.activatedAt),
    transferredAt: isoOrNull(row.transferredAt),
    closedAt: isoOrNull(row.closedAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

async function recordAudit(
  db: AlphaContextDb,
  params: {
    projectKey: string;
    projectName: string;
    actorRole: string;
    action: string;
    allowed: boolean;
    reason: string;
    windowId?: string | null;
    conflictingWindowId?: string | null;
    metadata?: Prisma.InputJsonValue;
  }
) {
  await db.alphaContextAuditEvent.create({
    data: {
      projectKey: params.projectKey,
      projectName: params.projectName,
      actorRole: params.actorRole,
      action: params.action,
      allowed: params.allowed,
      reason: params.reason,
      windowId: params.windowId ?? null,
      conflictingWindowId: params.conflictingWindowId ?? null,
      metadata: params.metadata
    }
  });
}

async function ensureProjectLockRow(params: {
  db: AlphaContextDb;
  projectKey: string;
  projectName: string;
}) {
  await params.db.projectAlphaLock.upsert({
    where: { projectKey: params.projectKey },
    create: {
      projectKey: params.projectKey,
      projectName: params.projectName
    },
    update: {
      projectName: params.projectName
    }
  });
}

async function lockProjectRow(db: AlphaContextDb, projectKey: string): Promise<LockedProjectRow | null> {
  await db.$queryRaw`
    SELECT "projectKey"
    FROM "ProjectAlphaLock"
    WHERE "projectKey" = ${projectKey}
    FOR UPDATE
  `;

  return db.projectAlphaLock.findUnique({
    where: { projectKey },
    include: {
      activeWindow: {
        include: {
          ownerAgent: { select: { displayName: true } }
        }
      }
    }
  });
}

async function resolveAlphaAgent(
  db: AlphaContextDb,
  requestedKey: string,
  mode: "start" | "transfer"
): Promise<AgentResolution> {
  const raw = normalizeText(requestedKey);
  if (!raw) {
    return { ok: false, reason: "Alpha agent key is required." };
  }

  const agent = await db.agent.findFirst({
    where: { key: { equals: raw, mode: "insensitive" } },
    select: {
      key: true,
      displayName: true,
      enabled: true,
      controlRole: true
    }
  });
  if (!agent) {
    return { ok: false, reason: `Alpha context ${mode} denied: agent @${raw} is not registered.` };
  }
  if (!agent.enabled) {
    return {
      ok: false,
      reason: `Alpha context ${mode} denied: agent @${agent.key} is disabled.`
    };
  }
  if (agent.controlRole !== "ALPHA") {
    return {
      ok: false,
      reason: `Alpha context ${mode} denied: agent @${agent.key} role is ${agent.controlRole}.`
    };
  }

  return { ok: true, agentKey: agent.key, displayName: agent.displayName };
}

function denormalizeProject(lock: LockedProjectRow | null, fallback: { projectName: string }) {
  return lock?.projectName || fallback.projectName;
}

export async function getProjectAlphaLockSnapshot(
  projectName: string
): Promise<ProjectAlphaLockSnapshot> {
  const project = normalizeProjectIdentity(projectName);
  const lock = await prisma.projectAlphaLock.findUnique({
    where: { projectKey: project.projectKey },
    include: {
      activeWindow: {
        include: {
          ownerAgent: { select: { displayName: true } }
        }
      }
    }
  });

  return {
    projectKey: project.projectKey,
    projectName: lock?.projectName || project.projectName,
    continuityRef: lock?.continuityRef || null,
    activatedAt: isoOrNull(lock?.activatedAt),
    updatedAt: isoOrNull(lock?.updatedAt),
    activeWindow: mapWindow(lock?.activeWindow ?? null)
  };
}

export async function listActiveProjectAlphaLocks(limit = 30) {
  const rows = await prisma.projectAlphaLock.findMany({
    where: { activeWindowId: { not: null } },
    include: {
      activeWindow: {
        include: {
          ownerAgent: { select: { displayName: true } }
        }
      }
    },
    orderBy: [{ updatedAt: "desc" }],
    take: Math.min(Math.max(limit, 1), 200)
  });

  return rows.map((row) => ({
    projectKey: row.projectKey,
    projectName: row.projectName,
    continuityRef: row.continuityRef,
    activatedAt: isoOrNull(row.activatedAt),
    updatedAt: row.updatedAt.toISOString(),
    activeWindow: mapWindow(row.activeWindow)
  }));
}

export async function listProjectAlphaContextAuditEvents(params: {
  projectName: string;
  limit?: number;
}): Promise<AlphaContextAuditSummary[]> {
  const project = normalizeProjectIdentity(params.projectName);
  const rows = await prisma.alphaContextAuditEvent.findMany({
    where: { projectKey: project.projectKey },
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(params.limit ?? 20, 1), 100)
  });

  return rows.map((row) => ({
    id: row.id,
    actorRole: row.actorRole,
    action: row.action,
    allowed: row.allowed,
    reason: row.reason,
    windowId: row.windowId,
    conflictingWindowId: row.conflictingWindowId,
    createdAt: row.createdAt.toISOString()
  }));
}

export async function consumeContextBudgetForScopeExpansion(params: {
  projectName: string;
  actorUserId?: string | null;
  sourceAction: string;
  incrementPercent?: number;
  metadata?: Prisma.InputJsonValue;
}): Promise<AlphaContextScopeGateResult> {
  const project = normalizeProjectIdentity(params.projectName);
  const incrementPercent = clampInt(
    params.incrementPercent,
    DEFAULT_SCOPE_INCREMENT,
    1,
    25
  );

  return prisma.$transaction(async (tx) => {
    await ensureProjectLockRow({
      db: tx,
      projectKey: project.projectKey,
      projectName: project.projectName
    });

    const lock = await lockProjectRow(tx, project.projectKey);
    if (!lock?.activeWindowId || !lock.activeWindow) {
      return {
        allowed: true,
        status: "NO_ACTIVE_LOCK",
        reason: `No active Alpha context lock for project ${denormalizeProject(lock, project)}.`,
        projectKey: project.projectKey,
        projectName: denormalizeProject(lock, project),
        activeWindowId: null,
        usagePercent: 0
      };
    }

    const now = new Date();
    const nextUsage = Math.min(
      100,
      clampInt(lock.activeWindow.contextUsagePercent, 0, 0, 100) + incrementPercent
    );
    const packageReady = hasHandoverPackage(lock.activeWindow);
    const overrideActive = hasActiveOverride(lock.activeWindow);
    const blocked = nextUsage >= BLOCK_THRESHOLD && !packageReady && !overrideActive;

    await tx.alphaContextWindow.update({
      where: { id: lock.activeWindowId },
      data: {
        contextUsagePercent: nextUsage,
        contextUsageUpdatedAt: now,
        contextWarningAt:
          nextUsage >= WARNING_THRESHOLD
            ? lock.activeWindow.contextWarningAt || now
            : lock.activeWindow.contextWarningAt,
        contextBlockedAt: blocked ? lock.activeWindow.contextBlockedAt || now : lock.activeWindow.contextBlockedAt
      }
    });

    const updatedWindow = {
      ...lock.activeWindow,
      contextUsagePercent: nextUsage,
      contextWarningAt:
        nextUsage >= WARNING_THRESHOLD
          ? lock.activeWindow.contextWarningAt || now
          : lock.activeWindow.contextWarningAt,
      contextBlockedAt: blocked ? lock.activeWindow.contextBlockedAt || now : lock.activeWindow.contextBlockedAt
    };
    const state = deriveGuardrailState(updatedWindow);

    if (blocked) {
      const reason =
        `Context guardrail blocked scope expansion for ${project.projectName} at ${nextUsage}% usage. ` +
        "Record handover package + continuation prompt before enqueuing new scope.";
      await recordAudit(tx, {
        projectKey: project.projectKey,
        projectName: denormalizeProject(lock, project),
        actorRole: "HUMAN_OPERATOR",
        action: "CONTEXT_GUARDRAIL_BLOCK",
        allowed: false,
        reason,
        windowId: lock.activeWindowId,
        metadata: {
          sourceAction: params.sourceAction,
          usagePercent: nextUsage,
          actorUserId: params.actorUserId || null,
          detail: params.metadata || null
        }
      });
      return {
        allowed: false,
        status: state,
        reason,
        projectKey: project.projectKey,
        projectName: denormalizeProject(lock, project),
        activeWindowId: lock.activeWindowId,
        usagePercent: nextUsage
      };
    }

    if (state === "OVERRIDE_ACTIVE") {
      const reason =
        `Context guardrail override active for ${project.projectName}. Scope expansion allowed at ${nextUsage}% usage.`;
      await recordAudit(tx, {
        projectKey: project.projectKey,
        projectName: denormalizeProject(lock, project),
        actorRole: "ADMIN_OVERRIDE",
        action: "CONTEXT_GUARDRAIL_OVERRIDE_ALLOW",
        allowed: true,
        reason,
        windowId: lock.activeWindowId,
        metadata: {
          sourceAction: params.sourceAction,
          usagePercent: nextUsage,
          overrideUntil: isoOrNull(lock.activeWindow.guardrailOverrideUntil),
          actorUserId: params.actorUserId || null,
          detail: params.metadata || null
        }
      });
      return {
        allowed: true,
        status: state,
        reason,
        projectKey: project.projectKey,
        projectName: denormalizeProject(lock, project),
        activeWindowId: lock.activeWindowId,
        usagePercent: nextUsage
      };
    }

    if (state === "WARNING") {
      const reason =
        `Context usage warning for ${project.projectName}: ${nextUsage}% (threshold ${BLOCK_THRESHOLD}%).`;
      await recordAudit(tx, {
        projectKey: project.projectKey,
        projectName: denormalizeProject(lock, project),
        actorRole: "HUMAN_OPERATOR",
        action: "CONTEXT_GUARDRAIL_WARNING",
        allowed: true,
        reason,
        windowId: lock.activeWindowId,
        metadata: {
          sourceAction: params.sourceAction,
          usagePercent: nextUsage,
          actorUserId: params.actorUserId || null,
          detail: params.metadata || null
        }
      });
      return {
        allowed: true,
        status: state,
        reason,
        projectKey: project.projectKey,
        projectName: denormalizeProject(lock, project),
        activeWindowId: lock.activeWindowId,
        usagePercent: nextUsage
      };
    }

    if (state === "PACKAGE_READY") {
      return {
        allowed: true,
        status: state,
        reason: `Handover package is complete for ${project.projectName}; scope expansion allowed.`,
        projectKey: project.projectKey,
        projectName: denormalizeProject(lock, project),
        activeWindowId: lock.activeWindowId,
        usagePercent: nextUsage
      };
    }

    return {
      allowed: true,
      status: state,
      reason: `Context usage ${nextUsage}% for ${project.projectName}.`,
      projectKey: project.projectKey,
      projectName: denormalizeProject(lock, project),
      activeWindowId: lock.activeWindowId,
      usagePercent: nextUsage
    };
  });
}

export async function recordActiveContextHandoverPackage(params: {
  projectName: string;
  handoverPackageRef: string;
  continuationPromptRef: string;
  actorUserId?: string | null;
  note?: string | null;
}): Promise<AlphaContextMutationResult> {
  const project = normalizeProjectIdentity(params.projectName);
  const handoverPackageRef = normalizeText(params.handoverPackageRef);
  const continuationPromptRef = normalizeText(params.continuationPromptRef);
  const note = normalizeText(params.note);

  return prisma.$transaction(async (tx) => {
    await ensureProjectLockRow({
      db: tx,
      projectKey: project.projectKey,
      projectName: project.projectName
    });

    const lock = await lockProjectRow(tx, project.projectKey);
    if (!lock?.activeWindowId || !lock.activeWindow) {
      const reason =
        `Handover package recording denied for ${project.projectName}: no active context window.`;
      await recordAudit(tx, {
        projectKey: project.projectKey,
        projectName: denormalizeProject(lock, project),
        actorRole: "HUMAN_OPERATOR",
        action: "CONTEXT_HANDOVER_PACKAGE",
        allowed: false,
        reason,
        metadata: {
          actorUserId: params.actorUserId || null
        }
      });
      return {
        ok: false,
        code: "HANDOVER_PACKAGE_DENIED",
        reason,
        projectKey: project.projectKey,
        projectName: denormalizeProject(lock, project),
        activeWindowId: null
      };
    }

    if (!handoverPackageRef || !continuationPromptRef) {
      const reason =
        "Handover package reference and continuation prompt reference are both required.";
      await recordAudit(tx, {
        projectKey: project.projectKey,
        projectName: denormalizeProject(lock, project),
        actorRole: "HUMAN_OPERATOR",
        action: "CONTEXT_HANDOVER_PACKAGE",
        allowed: false,
        reason,
        windowId: lock.activeWindowId,
        metadata: {
          actorUserId: params.actorUserId || null
        }
      });
      return {
        ok: false,
        code: "HANDOVER_PACKAGE_DENIED",
        reason,
        projectKey: project.projectKey,
        projectName: denormalizeProject(lock, project),
        activeWindowId: lock.activeWindowId
      };
    }

    const validation = await validateAlphaHandoverPackage({
      handoverPackageRef,
      continuationPromptRef,
      projectName: denormalizeProject(lock, project),
      activeWindowId: lock.activeWindowId,
      ownerAgentKey: lock.activeWindow.ownerAgentKey
    });
    if (!validation.valid) {
      await recordAudit(tx, {
        projectKey: project.projectKey,
        projectName: denormalizeProject(lock, project),
        actorRole: "HUMAN_OPERATOR",
        action: "CONTEXT_HANDOVER_PACKAGE",
        allowed: false,
        reason: validation.reason,
        windowId: lock.activeWindowId,
        metadata: {
          handoverPackageRef,
          continuationPromptRef,
          missingSections: validation.missingSections,
          missingMetadataFields: validation.missingMetadataFields,
          actorUserId: params.actorUserId || null
        }
      });
      return {
        ok: false,
        code: "HANDOVER_PACKAGE_DENIED",
        reason: validation.reason,
        projectKey: project.projectKey,
        projectName: denormalizeProject(lock, project),
        activeWindowId: lock.activeWindowId
      };
    }

    const now = new Date();
    await tx.alphaContextWindow.update({
      where: { id: lock.activeWindowId },
      data: {
        handoverPackageRef,
        continuationPromptRef,
        handoverPackageReadyAt: now,
        continuityNote: note || lock.activeWindow.continuityNote || null
      }
    });

    await tx.projectAlphaLock.update({
      where: { projectKey: project.projectKey },
      data: {
        continuityRef: handoverPackageRef
      }
    });

    await recordAlphaContextPackageInvariant({
      db: tx,
      input: {
        windowId: lock.activeWindowId,
        projectKey: project.projectKey,
        projectName: denormalizeProject(lock, project),
        snapshotKind: "HANDOVER_PACKAGE",
        sourceRef: handoverPackageRef,
        handoverPackageRef,
        continuationPromptRef,
        continuityNote: note || lock.activeWindow.continuityNote || null,
        payloadSnapshot: {
          validation: {
            valid: validation.valid,
            missingSections: validation.missingSections,
            missingMetadataFields: validation.missingMetadataFields
          }
        },
        createdById: params.actorUserId ?? null
      }
    });

    const recentFailures = await tx.alphaFailureEvent.findMany({
      where: { projectKey: project.projectKey },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        failureClass: true,
        fallbackAction: true,
        severity: true,
        createdAt: true
      }
    });

    const reason =
      `Handover package recorded for project ${project.projectName}; guardrail gate can continue.`;
    await recordAudit(tx, {
      projectKey: project.projectKey,
      projectName: denormalizeProject(lock, project),
      actorRole: "HUMAN_OPERATOR",
      action: "CONTEXT_HANDOVER_PACKAGE",
      allowed: true,
      reason,
      windowId: lock.activeWindowId,
      metadata: {
        handoverPackageRef,
        continuationPromptRef,
        recentFailureContext: recentFailures.map((event) => ({
          failureClass: event.failureClass,
          fallbackAction: event.fallbackAction,
          severity: event.severity,
          createdAt: event.createdAt.toISOString()
        })),
        actorUserId: params.actorUserId || null
      }
    });

    return {
      ok: true,
      code: "HANDOVER_PACKAGE_RECORDED",
      reason,
      projectKey: project.projectKey,
      projectName: denormalizeProject(lock, project),
      activeWindowId: lock.activeWindowId
    };
  });
}

export async function setContextGuardrailOverride(params: {
  projectName: string;
  overrideReason: string;
  actorUserId?: string | null;
  durationMinutes?: number;
}): Promise<AlphaContextMutationResult> {
  const project = normalizeProjectIdentity(params.projectName);
  const overrideReason = normalizeText(params.overrideReason);
  const durationMinutes = clampInt(params.durationMinutes, 30, 5, 240);

  return prisma.$transaction(async (tx) => {
    await ensureProjectLockRow({
      db: tx,
      projectKey: project.projectKey,
      projectName: project.projectName
    });

    const lock = await lockProjectRow(tx, project.projectKey);
    if (!lock?.activeWindowId || !lock.activeWindow) {
      const reason =
        `Guardrail override denied for ${project.projectName}: no active context window.`;
      await recordAudit(tx, {
        projectKey: project.projectKey,
        projectName: denormalizeProject(lock, project),
        actorRole: "ADMIN_OVERRIDE",
        action: "CONTEXT_GUARDRAIL_OVERRIDE_SET",
        allowed: false,
        reason,
        metadata: {
          actorUserId: params.actorUserId || null
        }
      });
      return {
        ok: false,
        code: "GUARDRAIL_OVERRIDE_DENIED",
        reason,
        projectKey: project.projectKey,
        projectName: denormalizeProject(lock, project),
        activeWindowId: null
      };
    }

    if (!overrideReason) {
      const reason = "Guardrail override denied: override reason is required.";
      await recordAudit(tx, {
        projectKey: project.projectKey,
        projectName: denormalizeProject(lock, project),
        actorRole: "ADMIN_OVERRIDE",
        action: "CONTEXT_GUARDRAIL_OVERRIDE_SET",
        allowed: false,
        reason,
        windowId: lock.activeWindowId,
        metadata: {
          actorUserId: params.actorUserId || null
        }
      });
      return {
        ok: false,
        code: "GUARDRAIL_OVERRIDE_DENIED",
        reason,
        projectKey: project.projectKey,
        projectName: denormalizeProject(lock, project),
        activeWindowId: lock.activeWindowId
      };
    }

    const now = new Date();
    const overrideUntil = new Date(now.getTime() + durationMinutes * 60_000);
    await tx.alphaContextWindow.update({
      where: { id: lock.activeWindowId },
      data: {
        guardrailOverrideUntil: overrideUntil,
        guardrailOverrideReason: overrideReason
      }
    });

    const reason =
      `Guardrail override set for ${project.projectName} until ${overrideUntil.toISOString()}.`;
    await recordAudit(tx, {
      projectKey: project.projectKey,
      projectName: denormalizeProject(lock, project),
      actorRole: "ADMIN_OVERRIDE",
      action: "CONTEXT_GUARDRAIL_OVERRIDE_SET",
      allowed: true,
      reason,
      windowId: lock.activeWindowId,
      metadata: {
        overrideReason,
        durationMinutes,
        actorUserId: params.actorUserId || null
      }
    });

    return {
      ok: true,
      code: "GUARDRAIL_OVERRIDE_SET",
      reason,
      projectKey: project.projectKey,
      projectName: denormalizeProject(lock, project),
      activeWindowId: lock.activeWindowId
    };
  });
}

export async function openAndActivateAlphaContextWindow(params: {
  projectName: string;
  ownerAgentKey: string;
  actorUserId?: string | null;
  activationHandoverRef?: string | null;
  continuityNote?: string | null;
}): Promise<AlphaContextMutationResult> {
  const project = normalizeProjectIdentity(params.projectName);
  const activationHandoverRef = normalizeText(params.activationHandoverRef);
  const continuityNote = normalizeText(params.continuityNote);

  return prisma.$transaction(async (tx) => {
    await ensureProjectLockRow({
      db: tx,
      projectKey: project.projectKey,
      projectName: project.projectName
    });

    const lock = await lockProjectRow(tx, project.projectKey);
    const alphaAgent = await resolveAlphaAgent(tx, params.ownerAgentKey, "start");
    if (!alphaAgent.ok) {
      await recordAudit(tx, {
        projectKey: project.projectKey,
        projectName: denormalizeProject(lock, project),
        actorRole: "HUMAN_OPERATOR",
        action: "ACTIVATE_CONTEXT_WINDOW",
        allowed: false,
        reason: alphaAgent.reason,
        conflictingWindowId: lock?.activeWindowId || null,
        metadata: {
          requestedOwnerAgentKey: normalizeText(params.ownerAgentKey),
          actorUserId: params.actorUserId || null
        }
      });
      return {
        ok: false,
        code: "ACTIVATION_DENIED",
        reason: alphaAgent.reason,
        projectKey: project.projectKey,
        projectName: denormalizeProject(lock, project),
        activeWindowId: lock?.activeWindowId || null
      };
    }

    if (lock?.activeWindowId) {
      const activeOwner = lock.activeWindow?.ownerAgentKey || lock.activeOwnerAgentKey || "unknown";
      const reason =
        `Alpha context activation denied for project ${project.projectName}: ` +
        `active window already held by @${activeOwner}.`;
      await recordAudit(tx, {
        projectKey: project.projectKey,
        projectName: denormalizeProject(lock, project),
        actorRole: "HUMAN_OPERATOR",
        action: "ACTIVATE_CONTEXT_WINDOW",
        allowed: false,
        reason,
        conflictingWindowId: lock.activeWindowId,
        metadata: {
          requestedOwnerAgentKey: alphaAgent.agentKey,
          actorUserId: params.actorUserId || null
        }
      });
      return {
        ok: false,
        code: "ACTIVATION_DENIED",
        reason,
        projectKey: project.projectKey,
        projectName: denormalizeProject(lock, project),
        activeWindowId: lock.activeWindowId
      };
    }

    const now = new Date();
    const opened = await tx.alphaContextWindow.create({
      data: {
        projectKey: project.projectKey,
        projectName: project.projectName,
        ownerAgentKey: alphaAgent.agentKey,
        status: "OPEN",
        activationHandoverRef: activationHandoverRef || null,
        continuityNote: continuityNote || null,
        createdById: params.actorUserId ?? null
      }
    });

    await recordAudit(tx, {
      projectKey: project.projectKey,
      projectName: denormalizeProject(lock, project),
      actorRole: "HUMAN_OPERATOR",
      action: "OPEN_CONTEXT_WINDOW",
      allowed: true,
      reason: "Alpha context window opened.",
      windowId: opened.id,
      metadata: {
        ownerAgentKey: alphaAgent.agentKey,
        actorUserId: params.actorUserId || null
      }
    });

    const activeWindow = await tx.alphaContextWindow.update({
      where: { id: opened.id },
      data: {
        status: "ACTIVE",
        activatedAt: now
      }
    });

    await recordAlphaContextPackageInvariant({
      db: tx,
      input: {
        windowId: activeWindow.id,
        projectKey: project.projectKey,
        projectName: project.projectName,
        snapshotKind: "ACTIVATED",
        sourceRef: activationHandoverRef || null,
        handoverRef: activationHandoverRef || null,
        continuityNote: continuityNote || null,
        payloadSnapshot: {
          ownerAgentKey: alphaAgent.agentKey
        },
        createdById: params.actorUserId ?? null
      }
    });

    await tx.projectAlphaLock.update({
      where: { projectKey: project.projectKey },
      data: {
        projectName: project.projectName,
        activeWindowId: activeWindow.id,
        activeOwnerAgentKey: alphaAgent.agentKey,
        continuityRef: activationHandoverRef || null,
        activatedAt: now
      }
    });

    const reason = `Alpha context lock activated for project ${project.projectName} by @${alphaAgent.agentKey}.`;
    await recordAudit(tx, {
      projectKey: project.projectKey,
      projectName: denormalizeProject(lock, project),
      actorRole: "HUMAN_OPERATOR",
      action: "ACTIVATE_CONTEXT_WINDOW",
      allowed: true,
      reason,
      windowId: activeWindow.id,
      metadata: {
        ownerAgentKey: alphaAgent.agentKey,
        activationHandoverRef: activationHandoverRef || null,
        actorUserId: params.actorUserId || null
      }
    });

    return {
      ok: true,
      code: "CONTEXT_ACTIVATED",
      reason,
      projectKey: project.projectKey,
      projectName: project.projectName,
      activeWindowId: activeWindow.id
    };
  });
}

export async function transferActiveAlphaContextWindow(params: {
  projectName: string;
  toAgentKey: string;
  actorUserId?: string | null;
  handoverRef: string;
  continuityNote?: string | null;
}): Promise<AlphaContextMutationResult> {
  const project = normalizeProjectIdentity(params.projectName);
  const handoverRef = normalizeText(params.handoverRef);
  const continuityNote = normalizeText(params.continuityNote);

  return prisma.$transaction(async (tx) => {
    await ensureProjectLockRow({
      db: tx,
      projectKey: project.projectKey,
      projectName: project.projectName
    });

    const lock = await lockProjectRow(tx, project.projectKey);
    if (!lock?.activeWindowId || !lock.activeWindow) {
      const reason =
        `Alpha context transfer denied for project ${project.projectName}: no active window exists.`;
      await recordAudit(tx, {
        projectKey: project.projectKey,
        projectName: denormalizeProject(lock, project),
        actorRole: "HUMAN_OPERATOR",
        action: "TRANSFER_CONTEXT_WINDOW",
        allowed: false,
        reason,
        metadata: {
          requestedToAgentKey: normalizeText(params.toAgentKey),
          actorUserId: params.actorUserId || null
        }
      });
      return {
        ok: false,
        code: "TRANSFER_DENIED",
        reason,
        projectKey: project.projectKey,
        projectName: denormalizeProject(lock, project),
        activeWindowId: null
      };
    }

    if (!handoverRef) {
      const reason =
        `Alpha context transfer denied for project ${project.projectName}: handover package reference is required.`;
      await recordAudit(tx, {
        projectKey: project.projectKey,
        projectName: denormalizeProject(lock, project),
        actorRole: "HUMAN_OPERATOR",
        action: "TRANSFER_CONTEXT_WINDOW",
        allowed: false,
        reason,
        windowId: lock.activeWindowId,
        metadata: {
          requestedToAgentKey: normalizeText(params.toAgentKey),
          actorUserId: params.actorUserId || null
        }
      });
      return {
        ok: false,
        code: "TRANSFER_DENIED",
        reason,
        projectKey: project.projectKey,
        projectName: denormalizeProject(lock, project),
        activeWindowId: lock.activeWindowId
      };
    }

    const target = await resolveAlphaAgent(tx, params.toAgentKey, "transfer");
    if (!target.ok) {
      await recordAudit(tx, {
        projectKey: project.projectKey,
        projectName: denormalizeProject(lock, project),
        actorRole: "HUMAN_OPERATOR",
        action: "TRANSFER_CONTEXT_WINDOW",
        allowed: false,
        reason: target.reason,
        windowId: lock.activeWindowId,
        metadata: {
          requestedToAgentKey: normalizeText(params.toAgentKey),
          actorUserId: params.actorUserId || null
        }
      });
      return {
        ok: false,
        code: "TRANSFER_DENIED",
        reason: target.reason,
        projectKey: project.projectKey,
        projectName: denormalizeProject(lock, project),
        activeWindowId: lock.activeWindowId
      };
    }

    if (target.agentKey === lock.activeWindow.ownerAgentKey) {
      const reason =
        `Alpha context transfer denied for project ${project.projectName}: @${target.agentKey} already owns the active window.`;
      await recordAudit(tx, {
        projectKey: project.projectKey,
        projectName: denormalizeProject(lock, project),
        actorRole: "HUMAN_OPERATOR",
        action: "TRANSFER_CONTEXT_WINDOW",
        allowed: false,
        reason,
        windowId: lock.activeWindowId,
        metadata: {
          requestedToAgentKey: target.agentKey,
          actorUserId: params.actorUserId || null
        }
      });
      return {
        ok: false,
        code: "TRANSFER_DENIED",
        reason,
        projectKey: project.projectKey,
        projectName: denormalizeProject(lock, project),
        activeWindowId: lock.activeWindowId
      };
    }

    const now = new Date();
    const successorOpen = await tx.alphaContextWindow.create({
      data: {
        projectKey: project.projectKey,
        projectName: project.projectName,
        ownerAgentKey: target.agentKey,
        status: "OPEN",
        predecessorId: lock.activeWindowId,
        activationHandoverRef: handoverRef,
        continuityNote: continuityNote || null,
        createdById: params.actorUserId ?? null
      }
    });

    await recordAudit(tx, {
      projectKey: project.projectKey,
      projectName: denormalizeProject(lock, project),
      actorRole: "HUMAN_OPERATOR",
      action: "OPEN_CONTEXT_WINDOW",
      allowed: true,
      reason: "Successor Alpha context window opened for transfer.",
      windowId: successorOpen.id,
      metadata: {
        transferFromWindowId: lock.activeWindowId,
        ownerAgentKey: target.agentKey,
        actorUserId: params.actorUserId || null
      }
    });

    const successorActive = await tx.alphaContextWindow.update({
      where: { id: successorOpen.id },
      data: {
        status: "ACTIVE",
        activatedAt: now
      }
    });

    await tx.alphaContextWindow.update({
      where: { id: lock.activeWindowId },
      data: {
        status: "TRANSFERRED",
        transferredAt: now,
        transferHandoverRef: handoverRef,
        continuityNote: continuityNote || lock.activeWindow.continuityNote || null
      }
    });

    const priorSnapshot = await getLatestAlphaContextPackageInvariant({
      db: tx,
      windowId: lock.activeWindowId
    });
    const transferOutSnapshot = await recordAlphaContextPackageInvariant({
      db: tx,
      input: {
        windowId: lock.activeWindowId,
        projectKey: project.projectKey,
        projectName: project.projectName,
        snapshotKind: "TRANSFER_OUT",
        predecessorSnapshotId: priorSnapshot?.id ?? null,
        sourceRef: handoverRef,
        handoverRef,
        continuityNote: continuityNote || lock.activeWindow.continuityNote || null,
        payloadSnapshot: {
          fromAgentKey: lock.activeWindow.ownerAgentKey,
          toAgentKey: target.agentKey,
          toWindowId: successorActive.id
        },
        createdById: params.actorUserId ?? null
      }
    });
    await recordAlphaContextPackageInvariant({
      db: tx,
      input: {
        windowId: successorActive.id,
        projectKey: project.projectKey,
        projectName: project.projectName,
        snapshotKind: "TRANSFER_IN",
        predecessorSnapshotId: transferOutSnapshot.id,
        sourceRef: handoverRef,
        handoverRef,
        continuityNote: continuityNote || null,
        payloadSnapshot: {
          fromWindowId: lock.activeWindowId,
          fromAgentKey: lock.activeWindow.ownerAgentKey,
          toAgentKey: target.agentKey
        },
        createdById: params.actorUserId ?? null
      }
    });

    await tx.projectAlphaLock.update({
      where: { projectKey: project.projectKey },
      data: {
        projectName: project.projectName,
        activeWindowId: successorActive.id,
        activeOwnerAgentKey: target.agentKey,
        continuityRef: handoverRef,
        activatedAt: now
      }
    });

    const reason =
      `Alpha context lock transferred for project ${project.projectName}: ` +
      `@${lock.activeWindow.ownerAgentKey} -> @${target.agentKey}.`;

    await recordAudit(tx, {
      projectKey: project.projectKey,
      projectName: denormalizeProject(lock, project),
      actorRole: "HUMAN_OPERATOR",
      action: "TRANSFER_CONTEXT_WINDOW",
      allowed: true,
      reason,
      windowId: successorActive.id,
      conflictingWindowId: lock.activeWindowId,
      metadata: {
        fromWindowId: lock.activeWindowId,
        toWindowId: successorActive.id,
        fromAgentKey: lock.activeWindow.ownerAgentKey,
        toAgentKey: target.agentKey,
        handoverRef,
        actorUserId: params.actorUserId || null
      }
    });

    return {
      ok: true,
      code: "CONTEXT_TRANSFERRED",
      reason,
      projectKey: project.projectKey,
      projectName: project.projectName,
      activeWindowId: successorActive.id
    };
  });
}

export async function closeActiveAlphaContextWindow(params: {
  projectName: string;
  actorUserId?: string | null;
  handoverRef: string;
  closeReason?: string | null;
}): Promise<AlphaContextMutationResult> {
  const project = normalizeProjectIdentity(params.projectName);
  const handoverRef = normalizeText(params.handoverRef);
  const closeReason = normalizeText(params.closeReason);

  return prisma.$transaction(async (tx) => {
    await ensureProjectLockRow({
      db: tx,
      projectKey: project.projectKey,
      projectName: project.projectName
    });

    const lock = await lockProjectRow(tx, project.projectKey);
    if (!lock?.activeWindowId || !lock.activeWindow) {
      const reason =
        `Alpha context close denied for project ${project.projectName}: no active window exists.`;
      await recordAudit(tx, {
        projectKey: project.projectKey,
        projectName: denormalizeProject(lock, project),
        actorRole: "HUMAN_OPERATOR",
        action: "CLOSE_CONTEXT_WINDOW",
        allowed: false,
        reason,
        metadata: {
          actorUserId: params.actorUserId || null
        }
      });
      return {
        ok: false,
        code: "CLOSE_DENIED",
        reason,
        projectKey: project.projectKey,
        projectName: denormalizeProject(lock, project),
        activeWindowId: null
      };
    }

    if (!handoverRef) {
      const reason =
        `Alpha context close denied for project ${project.projectName}: handover package reference is required.`;
      await recordAudit(tx, {
        projectKey: project.projectKey,
        projectName: denormalizeProject(lock, project),
        actorRole: "HUMAN_OPERATOR",
        action: "CLOSE_CONTEXT_WINDOW",
        allowed: false,
        reason,
        windowId: lock.activeWindowId,
        metadata: {
          actorUserId: params.actorUserId || null
        }
      });
      return {
        ok: false,
        code: "CLOSE_DENIED",
        reason,
        projectKey: project.projectKey,
        projectName: denormalizeProject(lock, project),
        activeWindowId: lock.activeWindowId
      };
    }

    const now = new Date();
    await tx.alphaContextWindow.update({
      where: { id: lock.activeWindowId },
      data: {
        status: "CLOSED",
        closedAt: now,
        closeHandoverRef: handoverRef,
        continuityNote: closeReason || lock.activeWindow.continuityNote || null
      }
    });

    await recordAlphaContextPackageInvariant({
      db: tx,
      input: {
        windowId: lock.activeWindowId,
        projectKey: project.projectKey,
        projectName: project.projectName,
        snapshotKind: "CLOSED",
        sourceRef: handoverRef,
        handoverRef,
        continuityNote: closeReason || lock.activeWindow.continuityNote || null,
        payloadSnapshot: {
          ownerAgentKey: lock.activeWindow.ownerAgentKey
        },
        createdById: params.actorUserId ?? null
      }
    });

    await tx.projectAlphaLock.update({
      where: { projectKey: project.projectKey },
      data: {
        activeWindowId: null,
        activeOwnerAgentKey: null,
        continuityRef: handoverRef,
        activatedAt: null
      }
    });

    const reason =
      `Alpha context lock closed for project ${project.projectName} by @${lock.activeWindow.ownerAgentKey}.`;
    await recordAudit(tx, {
      projectKey: project.projectKey,
      projectName: denormalizeProject(lock, project),
      actorRole: "HUMAN_OPERATOR",
      action: "CLOSE_CONTEXT_WINDOW",
      allowed: true,
      reason,
      windowId: lock.activeWindowId,
      metadata: {
        handoverRef,
        closeReason: closeReason || null,
        actorUserId: params.actorUserId || null
      }
    });

    return {
      ok: true,
      code: "CONTEXT_CLOSED",
      reason,
      projectKey: project.projectKey,
      projectName: project.projectName,
      activeWindowId: null
    };
  });
}
