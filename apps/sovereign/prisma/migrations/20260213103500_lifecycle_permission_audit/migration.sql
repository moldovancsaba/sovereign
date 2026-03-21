-- Add lifecycle/permission audit trail for role-based transition checks.
CREATE TABLE "public"."LifecycleAuditEvent" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "actorRole" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "fromState" TEXT,
    "toState" TEXT,
    "allowed" BOOLEAN NOT NULL,
    "reason" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LifecycleAuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LifecycleAuditEvent_entityType_entityId_createdAt_idx"
ON "public"."LifecycleAuditEvent"("entityType", "entityId", "createdAt");

CREATE INDEX "LifecycleAuditEvent_actorRole_action_createdAt_idx"
ON "public"."LifecycleAuditEvent"("actorRole", "action", "createdAt");

CREATE INDEX "LifecycleAuditEvent_createdAt_idx"
ON "public"."LifecycleAuditEvent"("createdAt");
