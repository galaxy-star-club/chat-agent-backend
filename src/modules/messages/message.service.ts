import type { ContentBlock } from "@/contracts/content";
import type { MessageStatus } from "@/contracts/run";
import { withTransaction, type DatabaseTransaction } from "@/lib/database.server";
import { getAgentRunInTransaction } from "@/modules/agent-runs/agent-run.service";
import { getOwnedChatInTransaction } from "@/modules/chats/chat.service";
import { ChatNotFoundError } from "@/modules/chats/chat.service";
import { decodeKeysetCursor, encodeKeysetCursor } from "@/lib/keyset-cursor";
import { createMessage, findMessage, findMessageByClientRequestId, findMessagesForChat, findRecentMessages, updateMessage } from "./message.repository";

export interface MessageService {
  create(input: CreateOwnedMessageInput): ReturnType<typeof createOwnedMessage>;
}

export type CreateOwnedMessageInput = {
  ownerId: string;
  chatId: string;
  runId?: string;
  clientRequestId?: string;
  role: "user" | "assistant" | "system" | "tool";
  status?: MessageStatus;
  content: ContentBlock[];
};

export function createOwnedMessage(input: CreateOwnedMessageInput) {
  return withTransaction(async (transaction) => {
    const chat = await getOwnedChatInTransaction(transaction, input.ownerId, input.chatId);
    if (!chat) throw new Error("Chat not found.");
    if (input.runId) {
      const run = await getAgentRunInTransaction(transaction, input.runId);
      if (!run || run.chatId !== input.chatId) throw new Error("Agent run not found.");
    }
    return createMessage(transaction, {
      chatId: input.chatId,
      runId: input.runId,
      clientRequestId: input.clientRequestId,
      role: input.role,
      status: input.status,
      content: input.content,
    });
  });
}

export function getMessageInTransaction(transaction: DatabaseTransaction, id: string) {
  return findMessage(transaction, id);
}

export function createUserMessageInTransaction(
  transaction: DatabaseTransaction,
  input: CreateOwnedMessageInput & { clientRequestId: string; runId: string },
) {
  return createMessage(transaction, {
    chatId: input.chatId,
    runId: input.runId,
    clientRequestId: input.clientRequestId,
    role: "user",
    status: "completed",
    content: input.content,
  });
}

export function updateMessageInTransaction(
  transaction: DatabaseTransaction,
  id: string,
  input: { content: ContentBlock[]; status: MessageStatus },
) {
  return updateMessage(transaction, id, input);
}

export function listRecentMessagesInTransaction(
  transaction: DatabaseTransaction,
  chatId: string,
  limit: number,
) {
  return findRecentMessages(transaction, chatId, limit);
}

export function createMessageInTransaction(
  transaction: DatabaseTransaction,
  input: CreateOwnedMessageInput & { clientRequestId: string; runId: string },
) {
  return createMessage(transaction, {
    chatId: input.chatId,
    runId: input.runId,
    clientRequestId: input.clientRequestId,
    role: input.role,
    status: input.status,
    content: input.content,
  });
}

export function findOwnedMessageByClientRequestInTransaction(
  transaction: DatabaseTransaction,
  chatId: string,
  clientRequestId: string,
) {
  return findMessageByClientRequestId(transaction, chatId, clientRequestId);
}

export async function listOwnedChatMessages(
  ownerId: string,
  chatId: string,
  input: { cursor?: string; limit: number },
) {
  const cursor = decodeKeysetCursor(input.cursor);
  const messages = await withTransaction(async (transaction) => {
    const chat = await getOwnedChatInTransaction(transaction, ownerId, chatId);
    if (!chat) throw new ChatNotFoundError();
    return findMessagesForChat(transaction, chatId, cursor, input.limit);
  });
  const hasMore = messages.length > input.limit;
  const descendingItems = hasMore ? messages.slice(0, input.limit) : messages;
  const last = descendingItems.at(-1);
  return {
    items: [...descendingItems].reverse(),
    pageInfo: {
      hasMore,
      nextCursor: hasMore && last ? encodeKeysetCursor(last) : null,
    },
  };
}
