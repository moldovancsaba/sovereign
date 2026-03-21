-- CreateEnum
CREATE TYPE "public"."TaskStatus" AS ENUM ('QUEUED', 'RUNNING', 'DONE', 'FAILED', 'CANCELED');

-- CreateTable
CREATE TABLE "public"."AgentTask" (
    "id" TEXT NOT NULL,
    "status" "public"."TaskStatus" NOT NULL DEFAULT 'QUEUED',
    "agentKey" TEXT NOT NULL,
    "issueNumber" INTEGER,
    "threadId" TEXT,
    "title" TEXT NOT NULL,
    "payload" JSONB,
    "createdById" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentTask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgentTask_agentKey_status_createdAt_idx" ON "public"."AgentTask"("agentKey", "status", "createdAt");

-- CreateIndex
CREATE INDEX "AgentTask_issueNumber_idx" ON "public"."AgentTask"("issueNumber");

-- AddForeignKey
ALTER TABLE "public"."AgentTask" ADD CONSTRAINT "AgentTask_agentKey_fkey" FOREIGN KEY ("agentKey") REFERENCES "public"."Agent"("key") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AgentTask" ADD CONSTRAINT "AgentTask_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AgentTask" ADD CONSTRAINT "AgentTask_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "public"."ChatThread"("id") ON DELETE SET NULL ON UPDATE CASCADE;
