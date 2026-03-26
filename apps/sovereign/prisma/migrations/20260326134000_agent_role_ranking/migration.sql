-- Persistent ranking for agent-role selection
CREATE TABLE "AgentRoleRanking" (
    "id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "agentKey" TEXT NOT NULL,
    "rating" DOUBLE PRECISION NOT NULL DEFAULT 1000,
    "matches" INTEGER NOT NULL DEFAULT 0,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "draws" INTEGER NOT NULL DEFAULT 0,
    "confidence" DOUBLE PRECISION,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AgentRoleRanking_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AgentRoleRanking_role_agentKey_key" ON "AgentRoleRanking"("role", "agentKey");
CREATE INDEX "AgentRoleRanking_role_rating_updatedAt_idx" ON "AgentRoleRanking"("role", "rating", "updatedAt");
