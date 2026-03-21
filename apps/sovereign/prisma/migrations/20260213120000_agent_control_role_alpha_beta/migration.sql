-- Enforce Alpha/Beta role model at agent level.
CREATE TYPE "public"."AgentControlRole" AS ENUM ('ALPHA', 'BETA');

ALTER TABLE "public"."Agent"
ADD COLUMN "controlRole" "public"."AgentControlRole" NOT NULL DEFAULT 'BETA';
