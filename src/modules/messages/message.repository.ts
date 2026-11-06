import { contentBlocksSchema, type ContentBlock } from "@/contracts/content";
import type { MessageStatus } from "@/contracts/run";
import type { Prisma } from "@/generated/prisma/client";

export type CreateMessageInput = {
  chatId: string;
  runId?: string;
  clientRequestId?: string;
  role: "user" | "assistant" | "system" | "tool";
  status?: MessageStatus;
  content: ContentBlock[];
};

export function createMessage(transaction: Prisma.TransactionClient, input: CreateMessageInput) {
  const content = contentBlocksSchema.parse(input.content) as Prisma.InputJsonValue;
  return transaction.message.create({ data: { ...input, content } });
}

export function findMessage(transaction: Prisma.TransactionClient, id: string) {
  return transaction.message.findUnique({ where: { id } });
}

export function findMessageByClientRequestId(
  transaction: Prisma.TransactionClient,
  chatId: string,
  clientRequestId: string,
) {
  return transaction.message.findUnique({
    where: { chatId_clientRequestId: { chatId, clientRequestId } },
  });
}

export function findMessagesForChat(
  transaction: Prisma.TransactionClient,
  chatId: string,
  cursor: { createdAt: Date; id: string } | undefined,
  limit: number,
) {
  return transaction.message.findMany({
    where: {
      chatId,
      ...(cursor
        ? {
          OR: [
            { createdAt: { lt: cursor.createdAt } },
            { createdAt: cursor.createdAt, id: { lt: cursor.id } },
          ],
        }
        : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
  });
}
