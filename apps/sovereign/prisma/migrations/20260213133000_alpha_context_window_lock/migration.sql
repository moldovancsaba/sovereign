-- CreateEnum
CREATE TYPE "AlphaContextStatus" AS ENUM ('OPEN', 'ACTIVE', 'TRANSFERRED', 'CLOSED');

-- CreateTable
CREATE TABLE "AlphaContextWindow" (
    "id" TEXT NOT NULL,
    "projectKey" TEXT NOT NULL,
    "projectName" TEXT NOT NULL,
    "ownerAgentKey" TEXT NOT NULL,
    "status" "AlphaContextStatus" NOT NULL DEFAULT 'OPEN',
    "activationHandoverRef" TEXT,
    "transferHandoverRef" TEXT,
    "closeHandoverRef" TEXT,
    "continuityNote" TEXT,
    "predecessorId" TEXT,
    "activatedAt" TIMESTAMP(3),
    "transferredAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AlphaContextWindow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectAlphaLock" (
    "projectKey" TEXT NOT NULL,
    "projectName" TEXT NOT NULL,
    "activeWindowId" TEXT,
    "activeOwnerAgentKey" TEXT,
    "activatedAt" TIMESTAMP(3),
    "continuityRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectAlphaLock_pkey" PRIMARY KEY ("projectKey")
);

-- CreateTable
CREATE TABLE "AlphaContextAuditEvent" (
    "id" TEXT NOT NULL,
    "projectKey" TEXT NOT NULL,
    "projectName" TEXT NOT NULL,
    "actorRole" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "allowed" BOOLEAN NOT NULL,
    "reason" TEXT NOT NULL,
    "windowId" TEXT,
    "conflictingWindowId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AlphaContextAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AlphaContextWindow_projectKey_status_createdAt_idx" ON "AlphaContextWindow"("projectKey", "status", "createdAt");

-- CreateIndex
CREATE INDEX "AlphaContextWindow_ownerAgentKey_status_createdAt_idx" ON "AlphaContextWindow"("ownerAgentKey", "status", "createdAt");

-- CreateIndex
CREATE INDEX "AlphaContextWindow_projectName_createdAt_idx" ON "AlphaContextWindow"("projectName", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectAlphaLock_activeWindowId_key" ON "ProjectAlphaLock"("activeWindowId");

-- CreateIndex
CREATE INDEX "ProjectAlphaLock_activeOwnerAgentKey_idx" ON "ProjectAlphaLock"("activeOwnerAgentKey");

-- CreateIndex
CREATE INDEX "ProjectAlphaLock_projectName_idx" ON "ProjectAlphaLock"("projectName");

-- CreateIndex
CREATE INDEX "AlphaContextAuditEvent_projectKey_createdAt_idx" ON "AlphaContextAuditEvent"("projectKey", "createdAt");

-- CreateIndex
CREATE INDEX "AlphaContextAuditEvent_action_createdAt_idx" ON "AlphaContextAuditEvent"("action", "createdAt");

-- CreateIndex
CREATE INDEX "AlphaContextAuditEvent_windowId_createdAt_idx" ON "AlphaContextAuditEvent"("windowId", "createdAt");

-- AddForeignKey
ALTER TABLE "AlphaContextWindow" ADD CONSTRAINT "AlphaContextWindow_ownerAgentKey_fkey" FOREIGN KEY ("ownerAgentKey") REFERENCES "Agent"("key") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlphaContextWindow" ADD CONSTRAINT "AlphaContextWindow_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlphaContextWindow" ADD CONSTRAINT "AlphaContextWindow_predecessorId_fkey" FOREIGN KEY ("predecessorId") REFERENCES "AlphaContextWindow"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectAlphaLock" ADD CONSTRAINT "ProjectAlphaLock_activeWindowId_fkey" FOREIGN KEY ("activeWindowId") REFERENCES "AlphaContextWindow"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectAlphaLock" ADD CONSTRAINT "ProjectAlphaLock_activeOwnerAgentKey_fkey" FOREIGN KEY ("activeOwnerAgentKey") REFERENCES "Agent"("key") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlphaContextAuditEvent" ADD CONSTRAINT "AlphaContextAuditEvent_windowId_fkey" FOREIGN KEY ("windowId") REFERENCES "AlphaContextWindow"("id") ON DELETE SET NULL ON UPDATE CASCADE;
