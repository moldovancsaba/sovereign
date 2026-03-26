-- Trinity execution run persistence (API v1 mode=trinity)
CREATE TABLE "TrinityExecutionRun" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "finalConfidence" DOUBLE PRECISION,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "inputMessages" JSONB NOT NULL,
    "outputText" TEXT NOT NULL,
    "stageTrace" JSONB NOT NULL,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrinityExecutionRun_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TrinityExecutionRun_requestId_key" ON "TrinityExecutionRun"("requestId");
CREATE INDEX "TrinityExecutionRun_status_createdAt_idx" ON "TrinityExecutionRun"("status", "createdAt");
CREATE INDEX "TrinityExecutionRun_provider_model_createdAt_idx" ON "TrinityExecutionRun"("provider", "model", "createdAt");
