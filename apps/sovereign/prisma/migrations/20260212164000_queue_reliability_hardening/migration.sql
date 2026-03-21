-- Add queue reliability metadata and explicit dead-letter status.
ALTER TYPE "public"."TaskStatus" ADD VALUE 'DEAD_LETTER';

ALTER TABLE "public"."AgentTask"
ADD COLUMN "attemptCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "maxAttempts" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "lastFailureCode" TEXT,
ADD COLUMN "lastFailureKind" TEXT,
ADD COLUMN "deadLetteredAt" TIMESTAMP(3);

CREATE INDEX "AgentTask_status_nextAttemptAt_createdAt_idx"
ON "public"."AgentTask"("status", "nextAttemptAt", "createdAt");
