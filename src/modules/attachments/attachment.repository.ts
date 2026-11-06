import { jsonValueSchema, type JsonValue } from "@/contracts/json";
import type { Prisma } from "@/generated/prisma/client";

export type CreateAttachmentInput = {
  chatId: string;
  messageId?: string;
  ownerId: string;
  storageKey: string;
  filename: string;
  mediaType: string;
  byteSize: bigint;
  position: number;
  metadata?: JsonValue;
};

export function createAttachment(transaction: Prisma.TransactionClient, input: CreateAttachmentInput) {
  const metadata = input.metadata === undefined
    ? undefined
    : jsonValueSchema.parse(input.metadata) as Prisma.InputJsonValue;
  return transaction.attachment.create({ data: { ...input, metadata } });
}

export function findOwnedAttachment(
  transaction: Prisma.TransactionClient,
  id: string,
  ownerId: string,
) {
  return transaction.attachment.findFirst({ where: { id, ownerId } });
}
