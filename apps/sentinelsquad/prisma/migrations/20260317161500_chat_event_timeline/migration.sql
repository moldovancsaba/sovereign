-- CreateEnum
CREATE TYPE "public"."ThreadEventKind" AS ENUM ('TASK_ENQUEUED', 'TASK_MANUAL_REQUIRED', 'PROJECT_SESSION_OPENED');

-- CreateTable
CREATE TABLE "public"."ChatEvent" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "kind" "public"."ThreadEventKind" NOT NULL,
    "actorKey" TEXT,
    "taskId" TEXT,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChatEvent_threadId_createdAt_idx" ON "public"."ChatEvent"("threadId", "createdAt");

-- CreateIndex
CREATE INDEX "ChatEvent_kind_createdAt_idx" ON "public"."ChatEvent"("kind", "createdAt");

-- CreateIndex
CREATE INDEX "ChatEvent_taskId_idx" ON "public"."ChatEvent"("taskId");

-- AddForeignKey
ALTER TABLE "public"."ChatEvent" ADD CONSTRAINT "ChatEvent_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "public"."ChatThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
