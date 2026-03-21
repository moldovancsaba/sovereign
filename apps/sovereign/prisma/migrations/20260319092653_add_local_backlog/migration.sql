-- CreateEnum
CREATE TYPE "public"."BacklogItemStatus" AS ENUM ('BACKLOG', 'READY', 'IN_PROGRESS', 'IN_REVIEW', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "public"."POFeedbackKind" AS ENUM ('ACCEPTED', 'REJECTED', 'CHANGE_REQUEST');

-- DropIndex
DROP INDEX "public"."AlphaContextWindow_status_contextUsagePercent_createdAt_idx";

-- AlterTable
ALTER TABLE "public"."InboundEmailEvent" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "public"."OrchestratorLease" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE "public"."BacklogBoard" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "productScope" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BacklogBoard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."BacklogGoal" (
    "id" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BacklogGoal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."BacklogItem" (
    "id" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "goalId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "acceptanceCriteria" JSONB,
    "status" "public"."BacklogItemStatus" NOT NULL DEFAULT 'BACKLOG',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "threadId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BacklogItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."POFeedback" (
    "id" TEXT NOT NULL,
    "backlogItemId" TEXT NOT NULL,
    "threadId" TEXT,
    "kind" "public"."POFeedbackKind" NOT NULL,
    "reason" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "POFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BacklogBoard_productScope_idx" ON "public"."BacklogBoard"("productScope");

-- CreateIndex
CREATE UNIQUE INDEX "BacklogBoard_productScope_key" ON "public"."BacklogBoard"("productScope");

-- CreateIndex
CREATE INDEX "BacklogGoal_boardId_idx" ON "public"."BacklogGoal"("boardId");

-- CreateIndex
CREATE INDEX "BacklogItem_boardId_status_idx" ON "public"."BacklogItem"("boardId", "status");

-- CreateIndex
CREATE INDEX "BacklogItem_goalId_idx" ON "public"."BacklogItem"("goalId");

-- CreateIndex
CREATE INDEX "BacklogItem_threadId_idx" ON "public"."BacklogItem"("threadId");

-- CreateIndex
CREATE INDEX "BacklogItem_status_sortOrder_idx" ON "public"."BacklogItem"("status", "sortOrder");

-- CreateIndex
CREATE INDEX "POFeedback_backlogItemId_idx" ON "public"."POFeedback"("backlogItemId");

-- CreateIndex
CREATE INDEX "POFeedback_threadId_idx" ON "public"."POFeedback"("threadId");

-- AddForeignKey
ALTER TABLE "public"."BacklogGoal" ADD CONSTRAINT "BacklogGoal_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "public"."BacklogBoard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BacklogItem" ADD CONSTRAINT "BacklogItem_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "public"."BacklogBoard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BacklogItem" ADD CONSTRAINT "BacklogItem_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "public"."BacklogGoal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BacklogItem" ADD CONSTRAINT "BacklogItem_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BacklogItem" ADD CONSTRAINT "BacklogItem_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "public"."ChatThread"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."POFeedback" ADD CONSTRAINT "POFeedback_backlogItemId_fkey" FOREIGN KEY ("backlogItemId") REFERENCES "public"."BacklogItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."POFeedback" ADD CONSTRAINT "POFeedback_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
