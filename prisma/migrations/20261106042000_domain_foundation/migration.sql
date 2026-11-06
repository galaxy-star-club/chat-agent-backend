CREATE SCHEMA IF NOT EXISTS "public";

CREATE TYPE "MessageRole" AS ENUM ('user', 'assistant', 'system', 'tool');
CREATE TYPE "MessageStatus" AS ENUM ('streaming', 'completed', 'failed', 'cancelled');
CREATE TYPE "AgentRunStatus" AS ENUM ('pending', 'running', 'waiting', 'completed', 'failed', 'cancelled');
CREATE TYPE "AttachmentStatus" AS ENUM ('pending', 'ready', 'failed');
CREATE TYPE "ToolInvocationStatus" AS ENUM ('pending', 'running', 'completed', 'failed', 'cancelled');
CREATE TYPE "WaitpointStatus" AS ENUM ('pending', 'resolved', 'cancelled');

CREATE TABLE "Chat" (
    "id" UUID NOT NULL,
    "ownerId" TEXT NOT NULL,
    "title" TEXT,
    "activeRunId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Chat_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Message" (
    "id" UUID NOT NULL,
    "chatId" UUID NOT NULL,
    "runId" UUID,
    "clientRequestId" TEXT,
    "role" "MessageRole" NOT NULL,
    "status" "MessageStatus" NOT NULL DEFAULT 'completed',
    "content" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AgentRun" (
    "id" UUID NOT NULL,
    "chatId" UUID NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "status" "AgentRunStatus" NOT NULL DEFAULT 'pending',
    "traceId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AgentRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Attachment" (
    "id" UUID NOT NULL,
    "chatId" UUID NOT NULL,
    "messageId" UUID,
    "ownerId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mediaType" TEXT NOT NULL,
    "byteSize" BIGINT NOT NULL,
    "position" INTEGER NOT NULL,
    "status" "AttachmentStatus" NOT NULL DEFAULT 'pending',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ToolInvocation" (
    "id" UUID NOT NULL,
    "runId" UUID NOT NULL,
    "messageId" UUID,
    "callId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "ToolInvocationStatus" NOT NULL DEFAULT 'pending',
    "input" JSONB NOT NULL,
    "result" JSONB,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ToolInvocation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LoadedRunSkill" (
    "id" UUID NOT NULL,
    "runId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "instructions" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LoadedRunSkill_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Waitpoint" (
    "id" UUID NOT NULL,
    "runId" UUID NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" "WaitpointStatus" NOT NULL DEFAULT 'pending',
    "payload" JSONB NOT NULL,
    "resolution" JSONB,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Waitpoint_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DurableSession" (
    "id" UUID NOT NULL,
    "runId" UUID NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "state" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DurableSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CreditAccount" (
    "id" UUID NOT NULL,
    "ownerId" TEXT NOT NULL,
    "balance" BIGINT NOT NULL DEFAULT 0,
    "reserved" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CreditAccount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CreditLedgerEntry" (
    "id" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "runId" UUID,
    "idempotencyKey" TEXT NOT NULL,
    "deltaBalance" BIGINT NOT NULL,
    "deltaReserved" BIGINT NOT NULL,
    "resultingBalance" BIGINT NOT NULL,
    "resultingReserved" BIGINT NOT NULL,
    "reason" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CreditLedgerEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Chat_activeRunId_key" ON "Chat"("activeRunId");
CREATE INDEX "Chat_ownerId_createdAt_id_idx" ON "Chat"("ownerId", "createdAt", "id");
CREATE INDEX "Message_chatId_createdAt_id_idx" ON "Message"("chatId", "createdAt", "id");
CREATE INDEX "Message_runId_createdAt_id_idx" ON "Message"("runId", "createdAt", "id");
CREATE UNIQUE INDEX "Message_chatId_clientRequestId_key" ON "Message"("chatId", "clientRequestId");
CREATE INDEX "AgentRun_chatId_createdAt_id_idx" ON "AgentRun"("chatId", "createdAt", "id");
CREATE INDEX "AgentRun_status_createdAt_id_idx" ON "AgentRun"("status", "createdAt", "id");
CREATE UNIQUE INDEX "AgentRun_chatId_idempotencyKey_key" ON "AgentRun"("chatId", "idempotencyKey");
CREATE UNIQUE INDEX "Attachment_storageKey_key" ON "Attachment"("storageKey");
CREATE INDEX "Attachment_chatId_createdAt_id_idx" ON "Attachment"("chatId", "createdAt", "id");
CREATE INDEX "Attachment_ownerId_createdAt_id_idx" ON "Attachment"("ownerId", "createdAt", "id");
CREATE UNIQUE INDEX "Attachment_messageId_position_key" ON "Attachment"("messageId", "position");
CREATE INDEX "ToolInvocation_runId_createdAt_id_idx" ON "ToolInvocation"("runId", "createdAt", "id");
CREATE UNIQUE INDEX "ToolInvocation_runId_callId_key" ON "ToolInvocation"("runId", "callId");
CREATE INDEX "LoadedRunSkill_runId_createdAt_id_idx" ON "LoadedRunSkill"("runId", "createdAt", "id");
CREATE UNIQUE INDEX "LoadedRunSkill_runId_name_contentHash_key" ON "LoadedRunSkill"("runId", "name", "contentHash");
CREATE INDEX "Waitpoint_runId_createdAt_id_idx" ON "Waitpoint"("runId", "createdAt", "id");
CREATE INDEX "Waitpoint_status_createdAt_id_idx" ON "Waitpoint"("status", "createdAt", "id");
CREATE UNIQUE INDEX "Waitpoint_runId_idempotencyKey_key" ON "Waitpoint"("runId", "idempotencyKey");
CREATE INDEX "DurableSession_runId_createdAt_id_idx" ON "DurableSession"("runId", "createdAt", "id");
CREATE UNIQUE INDEX "DurableSession_runId_idempotencyKey_key" ON "DurableSession"("runId", "idempotencyKey");
CREATE UNIQUE INDEX "DurableSession_provider_externalId_key" ON "DurableSession"("provider", "externalId");
CREATE UNIQUE INDEX "CreditAccount_ownerId_key" ON "CreditAccount"("ownerId");
CREATE INDEX "CreditLedgerEntry_accountId_createdAt_id_idx" ON "CreditLedgerEntry"("accountId", "createdAt", "id");
CREATE INDEX "CreditLedgerEntry_runId_createdAt_id_idx" ON "CreditLedgerEntry"("runId", "createdAt", "id");
CREATE UNIQUE INDEX "CreditLedgerEntry_accountId_idempotencyKey_key" ON "CreditLedgerEntry"("accountId", "idempotencyKey");

ALTER TABLE "Chat" ADD CONSTRAINT "Chat_activeRunId_fkey" FOREIGN KEY ("activeRunId") REFERENCES "AgentRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Message" ADD CONSTRAINT "Message_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "Chat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Message" ADD CONSTRAINT "Message_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AgentRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "Chat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "Chat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ToolInvocation" ADD CONSTRAINT "ToolInvocation_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AgentRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ToolInvocation" ADD CONSTRAINT "ToolInvocation_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LoadedRunSkill" ADD CONSTRAINT "LoadedRunSkill_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AgentRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Waitpoint" ADD CONSTRAINT "Waitpoint_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AgentRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DurableSession" ADD CONSTRAINT "DurableSession_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AgentRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CreditLedgerEntry" ADD CONSTRAINT "CreditLedgerEntry_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "CreditAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CreditLedgerEntry" ADD CONSTRAINT "CreditLedgerEntry_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AgentRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
