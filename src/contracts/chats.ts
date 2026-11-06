import { z } from "zod";
import { cursorPageSchema, cursorPaginationQuerySchema } from "./pagination";

export const chatIdSchema = z.uuid();
export const chatTitleSchema = z.string().trim().min(1).max(200);

export const createChatRequestSchema = z.strictObject({
  title: chatTitleSchema.optional(),
});

export const updateFavoriteRequestSchema = z.strictObject({
  isFavorite: z.boolean(),
});

export const chatListQuerySchema = cursorPaginationQuerySchema.extend({
  query: z.string().trim().min(1).max(200).optional(),
  favorite: z.enum(["true", "false"]).transform((value) => value === "true").optional(),
});

export const chatSchema = z.strictObject({
  id: chatIdSchema,
  title: z.string().nullable(),
  isFavorite: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const chatListResponseSchema = cursorPageSchema(chatSchema);

export type ChatListQuery = z.infer<typeof chatListQuerySchema>;
export type ChatRecord = z.infer<typeof chatSchema>;
