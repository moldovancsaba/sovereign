-- AlterEnum
ALTER TYPE "public"."ThreadEventKind" ADD VALUE 'JUDGEMENT';

-- AlterTable
ALTER TABLE "public"."AgentTask" ADD COLUMN     "escalatedAt" TIMESTAMP(3),
ADD COLUMN     "judgementConfidence" DOUBLE PRECISION,
ADD COLUMN     "judgementReason" TEXT,
ADD COLUMN     "judgementVote" TEXT;
