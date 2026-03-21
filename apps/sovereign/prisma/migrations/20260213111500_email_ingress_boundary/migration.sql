-- Email ingress boundary and pipeline outcome persistence.
CREATE TABLE "public"."InboundEmailEvent" (
    "id" TEXT NOT NULL,
    "externalMessageId" TEXT,
    "channel" TEXT NOT NULL DEFAULT 'email',
    "senderEmail" TEXT NOT NULL,
    "senderName" TEXT,
    "subject" TEXT NOT NULL,
    "bodyText" TEXT NOT NULL,
    "authorized" BOOLEAN NOT NULL DEFAULT false,
    "authorizationReason" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "nextAttemptAt" TIMESTAMP(3),
    "lastFailureCode" TEXT,
    "lastFailureMessage" TEXT,
    "threadId" TEXT,
    "taskId" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InboundEmailEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InboundEmailEvent_externalMessageId_key"
ON "public"."InboundEmailEvent"("externalMessageId");

CREATE INDEX "InboundEmailEvent_status_createdAt_idx"
ON "public"."InboundEmailEvent"("status", "createdAt");

CREATE INDEX "InboundEmailEvent_senderEmail_createdAt_idx"
ON "public"."InboundEmailEvent"("senderEmail", "createdAt");

CREATE INDEX "InboundEmailEvent_channel_createdAt_idx"
ON "public"."InboundEmailEvent"("channel", "createdAt");
