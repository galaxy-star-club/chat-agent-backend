import { Prisma } from "@/generated/prisma/client";

export type ChatCursor = { createdAt: Date; id: string };
export type FindOwnedChatsInput = {
  ownerId: string;
  query?: string;
  favorite?: boolean;
  cursor?: ChatCursor;
  limit: number;
};

export function createChat(
  transaction: Prisma.TransactionClient,
  input: { ownerId: string; title?: string },
) {
  return transaction.chat.create({ data: input });
}

export function findOwnedChat(transaction: Prisma.TransactionClient, id: string, ownerId: string) {
  return transaction.chat.findFirst({ where: { id, ownerId } });
}

export function findChat(transaction: Prisma.TransactionClient, id: string) {
  return transaction.chat.findUnique({ where: { id } });
}

export function findOwnedChats(transaction: Prisma.TransactionClient, input: FindOwnedChatsInput) {
  const filters: Prisma.ChatWhereInput[] = [
    { ownerId: input.ownerId },
    ...(input.favorite === undefined ? [] : [{ isFavorite: input.favorite }]),
    ...(input.query
      ? [{
        OR: [
          { title: { contains: input.query, mode: Prisma.QueryMode.insensitive } },
          {
            messages: {
              some: {
                content: {
                  string_contains: input.query,
                },
              },
            },
          },
        ],
      }]
      : []),
    ...(input.cursor
      ? [{
        OR: [
          { createdAt: { lt: input.cursor.createdAt } },
          { createdAt: input.cursor.createdAt, id: { lt: input.cursor.id } },
        ],
      }]
      : []),
  ];
  return transaction.chat.findMany({
    where: { AND: filters },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: input.limit + 1,
  });
}

export function setOwnedChatFavorite(
  transaction: Prisma.TransactionClient,
  id: string,
  ownerId: string,
  isFavorite: boolean,
) {
  return transaction.chat.updateMany({ where: { id, ownerId }, data: { isFavorite } });
}

export function deleteOwnedChat(transaction: Prisma.TransactionClient, id: string, ownerId: string) {
  return transaction.chat.deleteMany({ where: { id, ownerId } });
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
