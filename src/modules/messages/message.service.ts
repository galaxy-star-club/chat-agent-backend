import type { ContentBlock } from "@/contracts/content";
import type { MessageStatus } from "@/contracts/run";
import { withTransaction, type DatabaseTransaction } from "@/lib/database.server";
import { getAgentRunInTransaction } from "@/modules/agent-runs/agent-run.service";
import { getOwnedChatInTransaction } from "@/modules/chats/chat.service";
import { createMessage, findMessage } from "./message.repository";

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
