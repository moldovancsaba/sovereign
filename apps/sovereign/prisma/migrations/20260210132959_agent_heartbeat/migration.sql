-- AlterTable
ALTER TABLE "public"."Agent" ADD COLUMN     "lastHeartbeatAt" TIMESTAMP(3),
ADD COLUMN     "lastHeartbeatMeta" JSONB;
