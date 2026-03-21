-- LLD-006: pgvector + memory kinds + provenance (768-dim default for Ollama nomic-embed-text)
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateEnum
CREATE TYPE "ProjectMemoryKind" AS ENUM ('THREAD', 'PROJECT', 'AGENT', 'EVIDENCE', 'PO_PRODUCT', 'DECISION', 'OTHER');

-- AlterTable
ALTER TABLE "ProjectMemory" ADD COLUMN "kind" "ProjectMemoryKind" NOT NULL DEFAULT 'THREAD';
ALTER TABLE "ProjectMemory" ADD COLUMN "sourceKind" TEXT;
ALTER TABLE "ProjectMemory" ADD COLUMN "sourceUrl" TEXT;
ALTER TABLE "ProjectMemory" ADD COLUMN "sourceAgentKey" TEXT;
ALTER TABLE "ProjectMemory" ADD COLUMN "createdByUserId" TEXT;
ALTER TABLE "ProjectMemory" ADD COLUMN "embeddingModel" TEXT;
ALTER TABLE "ProjectMemory" ADD COLUMN "embeddingDimensions" INTEGER;
ALTER TABLE "ProjectMemory" ADD COLUMN "embedding" vector(768);

-- CreateIndex
CREATE INDEX "ProjectMemory_projectSessionId_kind_idx" ON "ProjectMemory"("projectSessionId", "kind");

-- AddForeignKey
ALTER TABLE "ProjectMemory" ADD CONSTRAINT "ProjectMemory_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
