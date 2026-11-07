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

export function findOwnedAttachments(transaction: Prisma.TransactionClient, ids: string[], ownerId: string, chatId: string) {
  return transaction.attachment.findMany({ where: { id: { in: ids }, ownerId, chatId }, orderBy: { createdAt: "asc" } });
}

export function completeAttachment(
  transaction: Prisma.TransactionClient,
  id: string,
  input: { assemblyId: string; url: string; byteSize: bigint; mediaType: string },
) {
  return transaction.attachment.update({ where: { id }, data: { ...input, status: "ready" } });
}

export function failAttachments(transaction: Prisma.TransactionClient, ids: string[]) {
  return transaction.attachment.updateMany({ where: { id: { in: ids }, status: "pending" }, data: { status: "failed" } });
}

export function findReadyUnattachedByUrls(transaction: Prisma.TransactionClient, ownerId: string, chatId: string, urls: string[]) {
  return transaction.attachment.findMany({
    where: { ownerId, chatId, messageId: null, status: "ready", url: { in: urls } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
}

export function attachToMessage(transaction: Prisma.TransactionClient, id: string, messageId: string, position: number) {
  return transaction.attachment.updateMany({ where: { id, messageId: null, status: "ready" }, data: { messageId, position } });
}
