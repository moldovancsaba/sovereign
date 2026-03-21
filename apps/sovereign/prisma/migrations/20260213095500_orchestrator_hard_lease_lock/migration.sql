-- Introduce persistent orchestrator lease lock + audit log.
CREATE TABLE "public"."OrchestratorLease" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT,
    "ownerHost" TEXT,
    "ownerPid" INTEGER,
    "ownerAgentKey" TEXT,
    "expiresAt" TIMESTAMP(3),
    "lastHeartbeatAt" TIMESTAMP(3),
    "heartbeatCount" INTEGER NOT NULL DEFAULT 0,
    "acquiredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrchestratorLease_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."OrchestratorLeaseAudit" (
    "id" TEXT NOT NULL,
    "leaseId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "ownerId" TEXT,
    "previousOwnerId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrchestratorLeaseAudit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OrchestratorLease_ownerId_idx" ON "public"."OrchestratorLease"("ownerId");
CREATE INDEX "OrchestratorLease_expiresAt_idx" ON "public"."OrchestratorLease"("expiresAt");
CREATE INDEX "OrchestratorLeaseAudit_leaseId_createdAt_idx" ON "public"."OrchestratorLeaseAudit"("leaseId", "createdAt");
CREATE INDEX "OrchestratorLeaseAudit_code_createdAt_idx" ON "public"."OrchestratorLeaseAudit"("code", "createdAt");

ALTER TABLE "public"."OrchestratorLeaseAudit"
ADD CONSTRAINT "OrchestratorLeaseAudit_leaseId_fkey"
FOREIGN KEY ("leaseId") REFERENCES "public"."OrchestratorLease"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "public"."OrchestratorLease" (
  "id",
  "ownerId",
  "ownerHost",
  "ownerPid",
  "ownerAgentKey",
  "expiresAt",
  "lastHeartbeatAt",
  "heartbeatCount",
  "acquiredAt"
)
VALUES (
  'sentinelsquad-primary-orchestrator',
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  0,
  NULL
)
ON CONFLICT ("id") DO NOTHING;
