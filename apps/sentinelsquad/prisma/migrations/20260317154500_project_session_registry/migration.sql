-- CreateEnum
CREATE TYPE "public"."ProjectSessionStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateTable
CREATE TABLE "public"."ProjectSession" (
    "id" TEXT NOT NULL,
    "rootPath" TEXT NOT NULL,
    "relPath" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "status" "public"."ProjectSessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "metadata" JSONB,
    "lastOpenedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProjectSession_rootPath_relPath_key" ON "public"."ProjectSession"("rootPath", "relPath");

-- CreateIndex
CREATE INDEX "ProjectSession_status_lastOpenedAt_idx" ON "public"."ProjectSession"("status", "lastOpenedAt");

-- CreateIndex
CREATE INDEX "ProjectSession_displayName_idx" ON "public"."ProjectSession"("displayName");

-- AddForeignKey
ALTER TABLE "public"."ProjectSession" ADD CONSTRAINT "ProjectSession_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
