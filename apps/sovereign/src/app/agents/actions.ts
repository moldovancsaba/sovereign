"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import {
  AGENT_NOT_READY_REASON,
  AGENT_PAUSED_REASON,
  normalizeReadinessInput
} from "@/lib/agent-readiness";
import {
  evaluateAgentReadinessTransition,
  evaluateTaskTransition,
  recordLifecycleAudit
} from "@/lib/lifecycle-policy";
import { prisma } from "@/lib/prisma";
import { requireRbacAccess } from "@/lib/rbac";
import {
  mergeAgentSettings,
  removeAgentSetting,
  upsertAgentSetting
} from "@/lib/settings-mutations";
import { startWorker, stopWorker } from "@/lib/worker-process";

async function requireOperatorAccess(action: string, entityId?: string, metadata?: Prisma.JsonObject) {
  return requireRbacAccess({
    action,
    allowedRoles: ["ADMIN", "OPERATOR"],
    entityType: "AGENT",
    entityId: entityId || null,
    metadata
  });
}

async function requireAdminAccess(action: string, entityId?: string, metadata?: Prisma.JsonObject) {
  return requireRbacAccess({
    action,
    allowedRoles: ["ADMIN"],
    entityType: "AGENT",
    entityId: entityId || null,
    metadata
  });
}

function normalizeAgentKey(input: string) {
  return input
    .trim()
    .replace(/^@+/, "")
    .replace(/\s+/g, "-")
    .replace(/[^A-Za-z0-9_-]/g, "");
}

function normalizeRuntime(input: string): "LOCAL" | "CLOUD" {
  if (input === "LOCAL" || input === "CLOUD") return input;
  throw new Error("Runtime must be LOCAL or CLOUD.");
}

function normalizeControlRole(input: string): "ALPHA" | "BETA" {
  if (input === "ALPHA" || input === "BETA") return input;
  throw new Error("Role must be ALPHA or BETA.");
}

function runtimeRank(runtime: "MANUAL" | "LOCAL" | "CLOUD") {
  if (runtime === "LOCAL" || runtime === "CLOUD") return 2;
  return 1;
}

function pickLatest(...values: Array<Date | null>) {
  const present = values.filter((v): v is Date => Boolean(v));
  if (!present.length) return null;
  return new Date(Math.max(...present.map((v) => v.getTime())));
}

export async function createAgentAction(formData: FormData) {
  const rawKey = String(formData.get("agentKey") || "");
  const rawDisplayName = String(formData.get("displayName") || "").trim();
  const runtime = normalizeRuntime(String(formData.get("runtime") || "").trim());
  const controlRole = normalizeControlRole(String(formData.get("controlRole") || "BETA").trim());
  const enabled = formData
    .getAll("enabled")
    .map((v) => String(v).trim())
    .includes("1");

  const key = normalizeAgentKey(rawKey);
  if (!key) throw new Error("Agent key is required.");
  const displayName = rawDisplayName || key;

  await requireOperatorAccess("AGENTS_CREATE_OR_UPDATE_AGENT", key, {
    runtime,
    controlRole
  });

  const existing = await prisma.agent.findFirst({
    where: { key: { equals: key, mode: "insensitive" } },
    select: { key: true, runtime: true }
  });

  if (!existing?.key) {
    await prisma.agent.create({
      data: {
        key,
        displayName,
        runtime,
        controlRole,
        enabled,
        readiness: "NOT_READY",
        smokeTestPassedAt: null
      }
    });
  } else {
    const runtimeChanged = existing.runtime !== runtime;
    await prisma.agent.update({
      where: { key: existing.key },
      data: {
        displayName,
        runtime,
        controlRole,
        enabled,
        ...(runtimeChanged
          ? { readiness: "NOT_READY", smokeTestPassedAt: null }
          : {})
      }
    });
  }

  revalidatePath("/agents");
  revalidatePath("/chat");
}

export async function startAgentWorkerAction(formData: FormData) {
  const agentKey = String(formData.get("agentKey") || "").trim();
  if (!agentKey) throw new Error("Missing agent key.");
  await requireOperatorAccess("AGENTS_START_WORKER", agentKey);
  await startWorker(agentKey);
  revalidatePath("/agents");
}

export async function stopAgentWorkerAction(formData: FormData) {
  const agentKey = String(formData.get("agentKey") || "").trim();
  if (!agentKey) throw new Error("Missing agent key.");
  await requireOperatorAccess("AGENTS_STOP_WORKER", agentKey);
  await stopWorker(agentKey);
  revalidatePath("/agents");
}

export async function saveAgentConfigAction(formData: FormData) {
  const agentId = String(formData.get("agentId") || "").trim();
  const agentName = String(formData.get("agentName") || "").trim();
  const agentUrl = String(formData.get("agentUrl") || "").trim();
  const agentModel = String(formData.get("agentModel") || "").trim();
  const agentApiKeyEnv = String(formData.get("agentApiKeyEnv") || "").trim();

  const auth = await requireOperatorAccess("AGENTS_SAVE_AGENT_CONFIG", agentName || agentId || undefined, {
    hasAgentUrl: Boolean(agentUrl),
    hasModel: Boolean(agentModel),
    hasApiKeyEnv: Boolean(agentApiKeyEnv)
  });

  await upsertAgentSetting({
    agentId: agentId || undefined,
    agentName,
    agentUrl,
    agentModel,
    agentApiKeyEnv
  }, {
    auditContext: {
      actorRole: `RBAC_${auth.role}`,
      actorUserId: auth.userId,
      actorUserEmail: auth.userEmail
    }
  });

  revalidatePath("/agents");
  revalidatePath("/settings");
}

export async function updateAgentReadinessAction(formData: FormData) {
  const agentKey = String(formData.get("agentKey") || "").trim();
  const readinessRaw = String(formData.get("readiness") || "").trim();
  if (!agentKey) throw new Error("Missing agent key.");
  await requireOperatorAccess("AGENTS_UPDATE_READINESS", agentKey, {
    requestedReadiness: readinessRaw
  });
  const readiness = normalizeReadinessInput(readinessRaw);
  const current = await prisma.agent.findUnique({
    where: { key: agentKey },
    select: { key: true, readiness: true }
  });
  if (!current) throw new Error(`Agent @${agentKey} not found.`);

  const decision = evaluateAgentReadinessTransition({
    actorRole: "HUMAN_OPERATOR",
    action: "SET_READINESS",
    fromState: current.readiness,
    toState: readiness
  });

  await prisma.$transaction(async (tx) => {
    if (!decision.allowed) {
      await recordLifecycleAudit({
        entityType: "AGENT",
        entityId: agentKey,
        actorRole: "HUMAN_OPERATOR",
        action: "SET_READINESS",
        fromState: current.readiness,
        toState: readiness,
        allowed: false,
        reason: decision.reason,
        db: tx
      });
      throw new Error(decision.reason);
    }

    await tx.agent.update({
      where: { key: agentKey },
      data: { readiness }
    });

    if (readiness === "NOT_READY") {
      await tx.agentTask.updateMany({
        where: { agentKey, status: "QUEUED" },
        data: { error: AGENT_NOT_READY_REASON }
      });
    } else if (readiness === "PAUSED") {
      await tx.agentTask.updateMany({
        where: { agentKey, status: "QUEUED" },
        data: { error: AGENT_PAUSED_REASON }
      });
    } else {
      await tx.agentTask.updateMany({
        where: { agentKey, status: "QUEUED" },
        data: { error: null }
      });
    }

    await recordLifecycleAudit({
      entityType: "AGENT",
      entityId: agentKey,
      actorRole: "HUMAN_OPERATOR",
      action: "SET_READINESS",
      fromState: current.readiness,
      toState: readiness,
      allowed: true,
      reason: decision.reason,
      db: tx
    });
  });

  revalidatePath("/agents");
  revalidatePath("/chat");
}

export async function adminOverrideManualRequiredAction(formData: FormData) {
  const agentKey = String(formData.get("agentKey") || "").trim();
  const reasonInput = String(formData.get("reason") || "").trim();
  if (!agentKey) throw new Error("Missing agent key.");
  await requireAdminAccess("AGENTS_ADMIN_OVERRIDE_MANUAL_REQUIRED", agentKey, {
    hasReason: Boolean(reasonInput)
  });
  const reason =
    reasonInput || "Manual override: operator forced manual-required lifecycle state.";

  const tasks = await prisma.agentTask.findMany({
    where: {
      agentKey,
      status: { in: ["QUEUED", "RUNNING"] }
    },
    select: { id: true, status: true }
  });

  await prisma.$transaction(async (tx) => {
    let transitioned = 0;
    let denied = 0;

    for (const task of tasks) {
      // eslint-disable-next-line no-await-in-loop
      const decision = evaluateTaskTransition({
        actorRole: "ADMIN_OVERRIDE",
        action: "FORCE_MANUAL_REQUIRED",
        fromState: task.status,
        toState: "MANUAL_REQUIRED"
      });

      if (!decision.allowed) {
        denied += 1;
        // eslint-disable-next-line no-await-in-loop
        await recordLifecycleAudit({
          entityType: "TASK",
          entityId: task.id,
          actorRole: "ADMIN_OVERRIDE",
          action: "FORCE_MANUAL_REQUIRED",
          fromState: task.status,
          toState: "MANUAL_REQUIRED",
          allowed: false,
          reason: decision.reason,
          db: tx
        });
        continue;
      }

      transitioned += 1;
      // eslint-disable-next-line no-await-in-loop
      await tx.agentTask.update({
        where: { id: task.id },
        data: {
          status: "MANUAL_REQUIRED",
          finishedAt: new Date(),
          error: reason
        }
      });

      // eslint-disable-next-line no-await-in-loop
      await recordLifecycleAudit({
        entityType: "TASK",
        entityId: task.id,
        actorRole: "ADMIN_OVERRIDE",
        action: "FORCE_MANUAL_REQUIRED",
        fromState: task.status,
        toState: "MANUAL_REQUIRED",
        allowed: true,
        reason: decision.reason,
        metadata: { reason },
        db: tx
      });
    }

    await recordLifecycleAudit({
      entityType: "AGENT",
      entityId: agentKey,
      actorRole: "ADMIN_OVERRIDE",
      action: "FORCE_MANUAL_REQUIRED",
      fromState: null,
      toState: null,
      allowed: true,
      reason: `Manual override completed. transitioned=${transitioned}, denied=${denied}.`,
      metadata: {
        transitioned,
        denied,
        reason
      },
      db: tx
    });
  });

  revalidatePath("/agents");
  revalidatePath("/chat");
}

export async function updateAgentSmokeTestAction(formData: FormData) {
  const agentKey = String(formData.get("agentKey") || "").trim();
  const passed = String(formData.get("passed") || "").trim() === "1";
  if (!agentKey) throw new Error("Missing agent key.");
  await requireOperatorAccess("AGENTS_UPDATE_SMOKE_TEST", agentKey, { passed });

  await prisma.agent.update({
    where: { key: agentKey },
    data: {
      smokeTestPassedAt: passed ? new Date() : null
    }
  });

  revalidatePath("/agents");
}

export async function deleteAgentConfigAction(formData: FormData) {
  const agentId = String(formData.get("agentId") || "").trim();
  const agentName = String(formData.get("agentName") || "").trim();
  await requireOperatorAccess("AGENTS_DELETE_AGENT_CONFIG", agentName || agentId || undefined);

  await removeAgentSetting({
    agentId: agentId || undefined,
    agentName: agentName || undefined
  });

  revalidatePath("/agents");
  revalidatePath("/settings");
}

export async function mergeCaseVariantAgentKeysAction(formData: FormData) {
  const canonicalKey = String(formData.get("canonicalKey") || "").trim();
  if (!canonicalKey) throw new Error("Missing canonical key.");
  await requireAdminAccess("AGENTS_MERGE_CASE_VARIANT_KEYS", canonicalKey);

  const target = await prisma.agent.findUnique({
    where: { key: canonicalKey }
  });
  if (!target) throw new Error(`Agent @${canonicalKey} not found.`);

  const duplicates = await prisma.agent.findMany({
    where: {
      key: { equals: canonicalKey, mode: "insensitive" }
    }
  });
  if (duplicates.length < 2) {
    revalidatePath("/agents");
    return;
  }

  const sources = duplicates.filter((row) => row.key !== target.key);
  const runtimeWinner =
    duplicates
      .slice()
      .sort((a, b) => runtimeRank(b.runtime) - runtimeRank(a.runtime))[0] || target;
  const mergedModel =
    target.model ||
    runtimeWinner.model ||
    sources.map((row) => row.model).find((value) => Boolean(value)) ||
    null;
  const mergedHost =
    target.host ||
    runtimeWinner.host ||
    sources.map((row) => row.host).find((value) => Boolean(value)) ||
    null;
  const mergedCapabilities =
    target.capabilities ??
    runtimeWinner.capabilities ??
    sources.map((row) => row.capabilities).find((value) => value !== null) ??
    undefined;
  const nextRuntime =
    target.runtime === "MANUAL" && runtimeRank(runtimeWinner.runtime) > runtimeRank(target.runtime)
      ? runtimeWinner.runtime
      : target.runtime;
  const nextReadiness =
    target.runtime === "MANUAL" && runtimeWinner.runtime !== "MANUAL"
      ? runtimeWinner.readiness
      : target.readiness;
  const nextSmoke = pickLatest(
    target.smokeTestPassedAt,
    ...sources.map((row) => row.smokeTestPassedAt)
  );
  const nextHeartbeat = pickLatest(
    target.lastHeartbeatAt,
    ...sources.map((row) => row.lastHeartbeatAt)
  );
  const heartbeatSource = [target, ...sources]
    .filter((row) => row.lastHeartbeatAt)
    .sort(
      (a, b) =>
        (b.lastHeartbeatAt?.getTime() || 0) - (a.lastHeartbeatAt?.getTime() || 0)
    )[0];

  await prisma.$transaction(async (tx) => {
    await tx.agent.update({
      where: { key: target.key },
      data: {
        displayName: target.displayName || runtimeWinner.displayName || target.key,
        runtime: nextRuntime,
        readiness: nextReadiness,
        enabled: duplicates.some((row) => row.enabled),
        smokeTestPassedAt: nextSmoke,
        model: mergedModel,
        host: mergedHost,
        capabilities: mergedCapabilities,
        lastHeartbeatAt: nextHeartbeat,
        lastHeartbeatMeta:
          target.lastHeartbeatMeta ?? heartbeatSource?.lastHeartbeatMeta ?? undefined
      }
    });

    for (const source of sources) {
      // eslint-disable-next-line no-await-in-loop
      await tx.agentTask.updateMany({
        where: { agentKey: source.key },
        data: { agentKey: target.key }
      });
      // eslint-disable-next-line no-await-in-loop
      await tx.agent.delete({
        where: { key: source.key }
      });
    }
  });

  await mergeAgentSettings({
    canonicalName: target.key,
    aliases: sources.map((row) => row.key)
  });

  revalidatePath("/agents");
  revalidatePath("/chat");
  revalidatePath("/settings");
}
