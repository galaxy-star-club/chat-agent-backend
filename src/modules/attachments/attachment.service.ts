import type { JsonValue } from "@/contracts/json";
import { withTransaction } from "@/lib/database.server";
import { getOwnedChatInTransaction } from "@/modules/chats/chat.service";
import { getMessageInTransaction } from "@/modules/messages/message.service";
import { createAttachment } from "./attachment.repository";

export interface AttachmentService {
  create(input: CreateOwnedAttachmentInput): ReturnType<typeof createOwnedAttachment>;
}

export type CreateOwnedAttachmentInput = {
  ownerId: string;
  chatId: string;
  messageId?: string;
  storageKey: string;
  filename: string;
  mediaType: string;
  byteSize: bigint;
  position: number;
  metadata?: JsonValue;
};

export function createOwnedAttachment(input: CreateOwnedAttachmentInput) {
  return withTransaction(async (transaction) => {
    const chat = await getOwnedChatInTransaction(transaction, input.ownerId, input.chatId);
    if (!chat) throw new Error("Chat not found.");
    if (input.messageId) {
      const message = await getMessageInTransaction(transaction, input.messageId);
      if (!message || message.chatId !== input.chatId) throw new Error("Message not found.");
    }
    return createAttachment(transaction, input);
  });
}
