ALTER TABLE "AgentRun" ADD COLUMN "requestedModel" TEXT;
ALTER TABLE "AgentRun" ADD COLUMN "routedModel" TEXT;
ALTER TABLE "AgentRun" ADD COLUMN "inputTokens" INTEGER;
ALTER TABLE "AgentRun" ADD COLUMN "outputTokens" INTEGER;
ALTER TABLE "AgentRun" ADD COLUMN "errorCode" TEXT;
ALTER TABLE "AgentRun" ADD COLUMN "errorMessage" TEXT;
