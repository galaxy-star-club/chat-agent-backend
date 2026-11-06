import { withTransaction, type DatabaseTransaction } from "@/lib/database.server";
import {
  claimActiveRun,
  createChat,
  findOwnedChat,
  releaseActiveRun,
} from "./chat.repository";

export interface ChatService {
  create(ownerId: string, title?: string): ReturnType<typeof createOwnedChat>;
  get(ownerId: string, chatId: string): ReturnType<typeof getOwnedChat>;
}

export function createOwnedChat(ownerId: string, title?: string) {
  return withTransaction((transaction) => createChat(transaction, { ownerId, title }));
}

export function getOwnedChat(ownerId: string, chatId: string) {
  return withTransaction((transaction) => findOwnedChat(transaction, chatId, ownerId));
}

export function getOwnedChatInTransaction(
  transaction: DatabaseTransaction,
  ownerId: string,
  chatId: string,
) {
  return findOwnedChat(transaction, chatId, ownerId);
}

export function claimChatActiveRun(
  transaction: DatabaseTransaction,
  chatId: string,
  runId: string,
) {
  return claimActiveRun(transaction, chatId, runId);
}

export function releaseChatActiveRun(
  transaction: DatabaseTransaction,
  chatId: string,
  runId: string,
) {
  return releaseActiveRun(transaction, chatId, runId);
}
