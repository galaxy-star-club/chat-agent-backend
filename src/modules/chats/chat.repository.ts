import type { Prisma } from "@/generated/prisma/client";

export function createChat(
  transaction: Prisma.TransactionClient,
  input: { ownerId: string; title?: string },
) {
  return transaction.chat.create({ data: input });
}

export function findOwnedChat(transaction: Prisma.TransactionClient, id: string, ownerId: string) {
  return transaction.chat.findFirst({ where: { id, ownerId } });
}

export function claimActiveRun(
  transaction: Prisma.TransactionClient,
  chatId: string,
  runId: string,
) {
  return transaction.chat.updateMany({
    where: { id: chatId, activeRunId: null },
    data: { activeRunId: runId },
  });
}

export function releaseActiveRun(
  transaction: Prisma.TransactionClient,
  chatId: string,
  runId: string,
) {
  return transaction.chat.updateMany({
    where: { id: chatId, activeRunId: runId },
    data: { activeRunId: null },
  });
}
