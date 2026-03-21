-- CreateTable
CREATE TABLE "AlphaFailureEvent" (
    "id" TEXT NOT NULL,
    "failureClass" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "fallbackAction" TEXT NOT NULL,
    "projectKey" TEXT,
    "projectName" TEXT,
    "issueNumber" INTEGER,
    "taskId" TEXT,
    "threadId" TEXT,
    "leaseHealth" TEXT,
    "contextWindowId" TEXT,
    "remediation" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AlphaFailureEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AlphaFailureEvent_failureClass_createdAt_idx" ON "AlphaFailureEvent"("failureClass", "createdAt");

-- CreateIndex
CREATE INDEX "AlphaFailureEvent_projectKey_createdAt_idx" ON "AlphaFailureEvent"("projectKey", "createdAt");

-- CreateIndex
CREATE INDEX "AlphaFailureEvent_issueNumber_createdAt_idx" ON "AlphaFailureEvent"("issueNumber", "createdAt");

-- CreateIndex
CREATE INDEX "AlphaFailureEvent_severity_createdAt_idx" ON "AlphaFailureEvent"("severity", "createdAt");
