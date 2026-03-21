-- CreateEnum
CREATE TYPE "public"."AgentReadiness" AS ENUM ('NOT_READY', 'READY', 'PAUSED');

-- AlterEnum
ALTER TYPE "public"."TaskStatus" ADD VALUE 'MANUAL_REQUIRED';

-- AlterTable
ALTER TABLE "public"."Agent"
ADD COLUMN "readiness" "public"."AgentReadiness" NOT NULL DEFAULT 'NOT_READY',
ADD COLUMN "smokeTestPassedAt" TIMESTAMP(3);
