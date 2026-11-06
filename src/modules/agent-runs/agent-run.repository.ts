import type { RunStatus } from "@/contracts/run";
import type { Prisma } from "@/generated/prisma/client";

export type AgentRunOutcome = {
  startedAt?: Date;
  finishedAt?: Date;
  requestedModel?: string | null;
  routedModel?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  errorCode?: string | null;
  errorMessage?: string | null;
};

export function createAgentRun(
  transaction: Prisma.TransactionClient,
  input: { chatId: string; idempotencyKey: string; traceId: string },
) {
  return transaction.agentRun.create({ data: input });
}

export function findAgentRunByIdempotencyKey(
  transaction: Prisma.TransactionClient,
  chatId: string,
  idempotencyKey: string,
) {
  return transaction.agentRun.findUnique({
    where: { chatId_idempotencyKey: { chatId, idempotencyKey } },
  });
}

export function findAgentRun(transaction: Prisma.TransactionClient, id: string) {
  return transaction.agentRun.findUnique({ where: { id } });
}

export function countOwnedRunsSince(transaction: Prisma.TransactionClient, ownerId: string, since: Date) {
  return transaction.agentRun.count({
    where: { createdAt: { gte: since }, chat: { ownerId } },
  });
}

export function findOwnedAgentRun(
  transaction: Prisma.TransactionClient,
  id: string,
  ownerId: string,
) {
  return transaction.agentRun.findFirst({ where: { id, chat: { ownerId } } });
}

export function updateAgentRunStatus(
  transaction: Prisma.TransactionClient,
  id: string,
  status: RunStatus,
  timestamps: { startedAt?: Date; finishedAt?: Date } = {},
) {
  return transaction.agentRun.update({ where: { id }, data: { status, ...timestamps } });
}

export function compareAndSetAgentRun(
  transaction: Prisma.TransactionClient,
  id: string,
  from: RunStatus,
  to: RunStatus,
  outcome: AgentRunOutcome = {},
) {
  return transaction.agentRun.updateMany({
    where: { id, status: from },
    data: { status: to, ...outcome },
  });
}

export function saveAgentRunProgress(
  transaction: Prisma.TransactionClient,
  id: string,
  outcome: Pick<AgentRunOutcome, "requestedModel" | "routedModel" | "inputTokens" | "outputTokens">,
) {
  return transaction.agentRun.updateMany({
    where: { id, status: { in: ["running", "waiting"] } },
    data: outcome,
  });
}
