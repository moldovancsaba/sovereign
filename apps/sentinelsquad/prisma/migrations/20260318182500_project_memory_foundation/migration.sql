-- CreateEnum
CREATE TYPE "ProjectMemoryStatus" AS ENUM ('CAPTURED', 'REVIEWED', 'SUPERSEDED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "ProjectMemory" (
    "id" TEXT NOT NULL,
    "projectSessionId" TEXT NOT NULL,
    "threadId" TEXT,
    "taskId" TEXT,
    "sourceMessageId" TEXT,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "tags" JSONB,
    "status" "ProjectMemoryStatus" NOT NULL DEFAULT 'CAPTURED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectMemory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectMemory_projectSessionId_createdAt_idx" ON "ProjectMemory"("projectSessionId", "createdAt");

-- CreateIndex
CREATE INDEX "ProjectMemory_projectSessionId_status_updatedAt_idx" ON "ProjectMemory"("projectSessionId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "ProjectMemory_threadId_idx" ON "ProjectMemory"("threadId");

-- CreateIndex
CREATE INDEX "ProjectMemory_taskId_idx" ON "ProjectMemory"("taskId");

-- AddForeignKey
ALTER TABLE "ProjectMemory" ADD CONSTRAINT "ProjectMemory_projectSessionId_fkey" FOREIGN KEY ("projectSessionId") REFERENCES "ProjectSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMemory" ADD CONSTRAINT "ProjectMemory_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "ChatThread"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMemory" ADD CONSTRAINT "ProjectMemory_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "AgentTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;
