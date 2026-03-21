-- AlterTable
ALTER TABLE "AlphaContextWindow"
ADD COLUMN "contextUsagePercent" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "contextUsageUpdatedAt" TIMESTAMP(3),
ADD COLUMN "contextWarningAt" TIMESTAMP(3),
ADD COLUMN "contextBlockedAt" TIMESTAMP(3),
ADD COLUMN "handoverPackageRef" TEXT,
ADD COLUMN "continuationPromptRef" TEXT,
ADD COLUMN "handoverPackageReadyAt" TIMESTAMP(3),
ADD COLUMN "guardrailOverrideUntil" TIMESTAMP(3),
ADD COLUMN "guardrailOverrideReason" TEXT;

-- CreateIndex
CREATE INDEX "AlphaContextWindow_status_contextUsagePercent_createdAt_idx" ON "AlphaContextWindow"("status", "contextUsagePercent", "createdAt");
