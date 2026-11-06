import type { RunStatus } from "@/contracts/run";
import type { Prisma } from "@/generated/prisma/client";

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
