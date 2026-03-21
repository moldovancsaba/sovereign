import type { AgentReadiness, Prisma, TaskStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type ActorRole = "ORCHESTRATOR" | "ADMIN_OVERRIDE" | "HUMAN_OPERATOR" | "WORKER";

export type TaskLifecycleAction =
  | "ENQUEUE_TASK"
  | "ROUTE_HANDOFF_TASK"
  | "CLAIM_TASK"
  | "COMPLETE_TASK"
  | "CANCEL_TASK"
  | "INTERRUPT_TASK"
  | "RESUME_TASK"
  | "RETRY_TASK"
  | "DEAD_LETTER_TASK"
  | "RECOVER_STALE_RUNNING"
  | "FORCE_MANUAL_REQUIRED";

export type AgentLifecycleAction = "SET_READINESS" | "ADMIN_SET_READINESS";

export type TransitionDecision = {
  allowed: boolean;
  reason: string;
};

type LifecycleDb = Prisma.TransactionClient | typeof prisma;

function ok(reason: string): TransitionDecision {
  return { allowed: true, reason };
}

function deny(reason: string): TransitionDecision {
  return { allowed: false, reason };
}

export function evaluateTaskTransition(params: {
  actorRole: ActorRole;
  action: TaskLifecycleAction;
  fromState: TaskStatus | null;
  toState: TaskStatus;
}): TransitionDecision {
  const { actorRole, action, fromState, toState } = params;

  if (actorRole === "ORCHESTRATOR") {
    if (action === "ENQUEUE_TASK" || action === "ROUTE_HANDOFF_TASK") {
      if (fromState !== null) {
        return deny("Task creation transitions must have fromState=null.");
      }
      if (toState === "QUEUED" || toState === "MANUAL_REQUIRED") {
        return ok("Orchestrator task creation transition allowed.");
      }
      return deny("Orchestrator task creation can only target QUEUED or MANUAL_REQUIRED.");
    }
    if (action === "CLAIM_TASK") {
      return fromState === "QUEUED" && toState === "RUNNING"
        ? ok("Orchestrator claim transition allowed.")
        : deny("Claim transition requires QUEUED -> RUNNING.");
    }
    if (action === "COMPLETE_TASK") {
      return fromState === "RUNNING" && toState === "DONE"
        ? ok("Orchestrator completion transition allowed.")
        : deny("Completion transition requires RUNNING -> DONE.");
    }
    if (action === "CANCEL_TASK" || action === "INTERRUPT_TASK") {
      if (fromState === "RUNNING" && toState === "CANCELED") {
        return ok("Orchestrator cancel/interrupt transition allowed.");
      }
      if (fromState === "CANCELED" && toState === "CANCELED") {
        return ok("Orchestrator cancel/interrupt idempotent transition allowed.");
      }
      return deny("Cancel/interrupt transition requires RUNNING -> CANCELED.");
    }
    if (action === "RESUME_TASK") {
      return fromState === "CANCELED" &&
        (toState === "QUEUED" || toState === "MANUAL_REQUIRED")
        ? ok("Orchestrator resume transition allowed.")
        : deny("Resume transition requires CANCELED -> QUEUED|MANUAL_REQUIRED.");
    }
    if (action === "RETRY_TASK") {
      return fromState === "RUNNING" && toState === "QUEUED"
        ? ok("Orchestrator retry transition allowed.")
        : deny("Retry transition requires RUNNING -> QUEUED.");
    }
    if (action === "DEAD_LETTER_TASK") {
      return fromState === "RUNNING" && toState === "DEAD_LETTER"
        ? ok("Orchestrator dead-letter transition allowed.")
        : deny("Dead-letter transition requires RUNNING -> DEAD_LETTER.");
    }
    if (action === "RECOVER_STALE_RUNNING") {
      return fromState === "RUNNING" && toState === "QUEUED"
        ? ok("Stale-running recovery transition allowed.")
        : deny("Stale-running recovery requires RUNNING -> QUEUED.");
    }
    return deny(`Unsupported orchestrator task action: ${action}.`);
  }

  if (actorRole === "HUMAN_OPERATOR") {
    if (action === "ENQUEUE_TASK") {
      if (fromState !== null) {
        return deny("Human enqueue requires fromState=null.");
      }
      return toState === "QUEUED" || toState === "MANUAL_REQUIRED"
        ? ok("Human enqueue transition allowed.")
        : deny("Human enqueue can only target QUEUED or MANUAL_REQUIRED.");
    }
    if (action === "CANCEL_TASK" || action === "INTERRUPT_TASK") {
      return fromState === "RUNNING" && toState === "CANCELED"
        ? ok("Human task control transition allowed.")
        : deny("Human task control requires RUNNING -> CANCELED.");
    }
    if (action === "RESUME_TASK") {
      return fromState === "CANCELED" &&
        (toState === "QUEUED" || toState === "MANUAL_REQUIRED")
        ? ok("Human resume transition allowed.")
        : deny("Human resume requires CANCELED -> QUEUED|MANUAL_REQUIRED.");
    }
    return deny(`Human operator cannot perform task action ${action}.`);
  }

  if (actorRole === "ADMIN_OVERRIDE") {
    if (action !== "FORCE_MANUAL_REQUIRED") {
      return deny(`Admin override cannot perform task action ${action}.`);
    }
    return fromState === "QUEUED" || fromState === "RUNNING"
      ? toState === "MANUAL_REQUIRED"
        ? ok("Admin override manual-required transition allowed.")
        : deny("Admin override can only target MANUAL_REQUIRED.")
      : deny("Admin override manual-required requires QUEUED or RUNNING source.");
  }

  return deny("Worker role cannot mutate task lifecycle directly.");
}

export function evaluateAgentReadinessTransition(params: {
  actorRole: ActorRole;
  action: AgentLifecycleAction;
  fromState: AgentReadiness;
  toState: AgentReadiness;
}): TransitionDecision {
  const { actorRole, action, fromState, toState } = params;
  if (fromState === toState) return ok("No-op readiness transition allowed.");

  if (actorRole === "HUMAN_OPERATOR") {
    if (action !== "SET_READINESS") {
      return deny(`Human operator cannot perform agent action ${action}.`);
    }
    return ok("Human readiness transition allowed.");
  }

  if (actorRole === "ADMIN_OVERRIDE") {
    if (action !== "ADMIN_SET_READINESS") {
      return deny(`Admin override cannot perform agent action ${action}.`);
    }
    return ok("Admin override readiness transition allowed.");
  }

  return deny(`Role ${actorRole} is not allowed to mutate agent readiness.`);
}

export async function recordLifecycleAudit(params: {
  entityType: "TASK" | "AGENT" | "TASK_PROVENANCE";
  entityId?: string | null;
  actorRole: ActorRole;
  action: string;
  fromState?: string | null;
  toState?: string | null;
  allowed: boolean;
  reason: string;
  metadata?: unknown;
  db?: LifecycleDb;
}) {
  const db = params.db ?? prisma;
  await db.lifecycleAuditEvent.create({
    data: {
      entityType: params.entityType,
      entityId: params.entityId ?? null,
      actorRole: params.actorRole,
      action: params.action,
      fromState: params.fromState ?? null,
      toState: params.toState ?? null,
      allowed: params.allowed,
      reason: params.reason,
      metadata: (params.metadata as Prisma.InputJsonValue) ?? undefined
    }
  });
}

export function permissionMatrixRows() {
  return [
    {
      role: "ORCHESTRATOR",
      allowed: "Claim/complete/retry/dead-letter/recover task lifecycle while lease is active.",
      denied: "Readiness/admin override mutations."
    },
    {
      role: "ADMIN_OVERRIDE",
      allowed: "Force MANUAL_REQUIRED transitions and explicit readiness overrides.",
      denied: "Autonomous dispatch/claim/complete paths."
    },
    {
      role: "HUMAN_OPERATOR",
      allowed:
        "Enqueue tasks, request cancel/interrupt (RUNNING -> CANCELED), resume canceled tasks, and set readiness through normal controls.",
      denied: "Direct RUNNING/DONE/DEAD_LETTER lifecycle writes outside the allowed control paths."
    },
    {
      role: "WORKER",
      allowed: "Execute runtime calls only through orchestrator authority path.",
      denied: "Independent lifecycle mutations."
    }
  ];
}
