import { chatTitleSchema } from "@/contracts/chats";
import { withTransaction, type DatabaseTransaction } from "@/lib/database.server";
import {
  claimActiveRun,
  createChat,
  deleteOwnedChat,
  findChat,
  findOwnedChat,
  findOwnedChats,
  releaseActiveRun,
  setChatTitleIfEmpty,
  setOwnedChatFavorite,
} from "./chat.repository";
import { decodeKeysetCursor, encodeKeysetCursor } from "@/lib/keyset-cursor";

export interface ChatService {
  create(ownerId: string, title?: string): ReturnType<typeof createOwnedChat>;
  get(ownerId: string, chatId: string): ReturnType<typeof getOwnedChat>;
}

export class ChatNotFoundError extends Error {
  constructor() {
    super("Chat not found.");
    this.name = "ChatNotFoundError";
  }
}

export function createOwnedChat(ownerId: string, title?: string) {
  return withTransaction((transaction) => createChat(transaction, { ownerId, title }));
}

export function getOwnedChat(ownerId: string, chatId: string) {
  return withTransaction((transaction) => findOwnedChat(transaction, chatId, ownerId));
}

export async function requireOwnedChat(ownerId: string, chatId: string) {
  const chat = await getOwnedChat(ownerId, chatId);
  if (!chat) throw new ChatNotFoundError();
  return chat;
}

export async function listOwnedChats(
  ownerId: string,
  input: { query?: string; favorite?: boolean; cursor?: string; limit: number },
) {
  const cursor = decodeKeysetCursor(input.cursor);
  const chats = await withTransaction((transaction) => findOwnedChats(transaction, { ...input, ownerId, cursor }));
  const hasMore = chats.length > input.limit;
  const items = hasMore ? chats.slice(0, input.limit) : chats;
  const last = items.at(-1);
  return {
    items,
    pageInfo: {
      hasMore,
      nextCursor: hasMore && last ? encodeKeysetCursor(last) : null,
    },
  };
}

export async function updateOwnedChatFavorite(
  ownerId: string,
  chatId: string,
  isFavorite: boolean,
) {
  return withTransaction(async (transaction) => {
    const result = await setOwnedChatFavorite(transaction, chatId, ownerId, isFavorite);
    if (result.count !== 1) throw new ChatNotFoundError();
    const chat = await findOwnedChat(transaction, chatId, ownerId);
    if (!chat) throw new ChatNotFoundError();
    return chat;
  });
}

export async function deleteOwnedChatForOwner(ownerId: string, chatId: string) {
  const result = await withTransaction((transaction) => deleteOwnedChat(transaction, chatId, ownerId));
  if (result.count !== 1) throw new ChatNotFoundError();
}

export function getOwnedChatInTransaction(
  transaction: DatabaseTransaction,
  ownerId: string,
  chatId: string,
) {
  return findOwnedChat(transaction, chatId, ownerId);
}

export function getChatInTransaction(transaction: DatabaseTransaction, chatId: string) {
  return findChat(transaction, chatId);
}

export function saveChatTitleIfEmptyInTransaction(
  transaction: DatabaseTransaction,
  chatId: string,
  title: string,
) {
  const parsed = chatTitleSchema.safeParse(title);
  if (!parsed.success) return Promise.resolve({ count: 0 });
  return setChatTitleIfEmpty(transaction, chatId, parsed.data);
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
