-- CreateEnum
CREATE TYPE "AlphaContextPackageSnapshotKind" AS ENUM ('ACTIVATED', 'HANDOVER_PACKAGE', 'TRANSFER_OUT', 'TRANSFER_IN', 'CLOSED');

-- CreateTable
CREATE TABLE "TaskPromptPackageInvariant" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "sourceKind" TEXT NOT NULL,
    "sourceRef" TEXT,
    "issueNumber" INTEGER,
    "snapshotHash" TEXT NOT NULL,
    "promptText" TEXT NOT NULL,
    "packageBody" TEXT,
    "packageSections" JSONB,
    "payloadSnapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskPromptPackageInvariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlphaContextPackageInvariant" (
    "id" TEXT NOT NULL,
    "windowId" TEXT NOT NULL,
    "projectKey" TEXT NOT NULL,
    "projectName" TEXT NOT NULL,
    "snapshotKind" "AlphaContextPackageSnapshotKind" NOT NULL,
    "predecessorSnapshotId" TEXT,
    "sourceRef" TEXT,
    "snapshotHash" TEXT NOT NULL,
    "handoverRef" TEXT,
    "handoverPackageRef" TEXT,
    "continuationPromptRef" TEXT,
    "continuityNote" TEXT,
    "payloadSnapshot" JSONB,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AlphaContextPackageInvariant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TaskPromptPackageInvariant_taskId_key" ON "TaskPromptPackageInvariant"("taskId");

-- CreateIndex
CREATE INDEX "TaskPromptPackageInvariant_issueNumber_createdAt_idx" ON "TaskPromptPackageInvariant"("issueNumber", "createdAt");

-- CreateIndex
CREATE INDEX "TaskPromptPackageInvariant_sourceKind_createdAt_idx" ON "TaskPromptPackageInvariant"("sourceKind", "createdAt");

-- CreateIndex
CREATE INDEX "TaskPromptPackageInvariant_createdAt_idx" ON "TaskPromptPackageInvariant"("createdAt");

-- CreateIndex
CREATE INDEX "AlphaContextPackageInvariant_projectKey_createdAt_idx" ON "AlphaContextPackageInvariant"("projectKey", "createdAt");

-- CreateIndex
CREATE INDEX "AlphaContextPackageInvariant_windowId_createdAt_idx" ON "AlphaContextPackageInvariant"("windowId", "createdAt");

-- CreateIndex
CREATE INDEX "AlphaContextPackageInvariant_snapshotKind_createdAt_idx" ON "AlphaContextPackageInvariant"("snapshotKind", "createdAt");

-- CreateIndex
CREATE INDEX "AlphaContextPackageInvariant_predecessorSnapshotId_idx" ON "AlphaContextPackageInvariant"("predecessorSnapshotId");

-- AddForeignKey
ALTER TABLE "TaskPromptPackageInvariant" ADD CONSTRAINT "TaskPromptPackageInvariant_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "AgentTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlphaContextPackageInvariant" ADD CONSTRAINT "AlphaContextPackageInvariant_windowId_fkey" FOREIGN KEY ("windowId") REFERENCES "AlphaContextWindow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlphaContextPackageInvariant" ADD CONSTRAINT "AlphaContextPackageInvariant_predecessorSnapshotId_fkey" FOREIGN KEY ("predecessorSnapshotId") REFERENCES "AlphaContextPackageInvariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlphaContextPackageInvariant" ADD CONSTRAINT "AlphaContextPackageInvariant_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Enforce append-only immutability for invariants.
CREATE FUNCTION "prevent_prompt_package_invariant_mutation"()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Prompt/package invariant records are immutable.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "TaskPromptPackageInvariant_no_update"
BEFORE UPDATE ON "TaskPromptPackageInvariant"
FOR EACH ROW EXECUTE FUNCTION "prevent_prompt_package_invariant_mutation"();

CREATE TRIGGER "TaskPromptPackageInvariant_no_delete"
BEFORE DELETE ON "TaskPromptPackageInvariant"
FOR EACH ROW EXECUTE FUNCTION "prevent_prompt_package_invariant_mutation"();

CREATE TRIGGER "AlphaContextPackageInvariant_no_update"
BEFORE UPDATE ON "AlphaContextPackageInvariant"
FOR EACH ROW EXECUTE FUNCTION "prevent_prompt_package_invariant_mutation"();

CREATE TRIGGER "AlphaContextPackageInvariant_no_delete"
BEFORE DELETE ON "AlphaContextPackageInvariant"
FOR EACH ROW EXECUTE FUNCTION "prevent_prompt_package_invariant_mutation"();
