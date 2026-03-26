-- Agent group registry and nested membership foundation
CREATE TABLE "AgentGroup" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AgentGroup_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AgentGroup_key_key" ON "AgentGroup"("key");

CREATE TABLE "AgentGroupMember" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "memberType" TEXT NOT NULL,
    "memberAgentKey" TEXT,
    "memberGroupId" TEXT,
    "role" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AgentGroupMember_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AgentGroupMember_groupId_createdAt_idx" ON "AgentGroupMember"("groupId", "createdAt");
CREATE INDEX "AgentGroupMember_memberType_createdAt_idx" ON "AgentGroupMember"("memberType", "createdAt");
CREATE INDEX "AgentGroupMember_memberAgentKey_idx" ON "AgentGroupMember"("memberAgentKey");
CREATE INDEX "AgentGroupMember_memberGroupId_idx" ON "AgentGroupMember"("memberGroupId");
