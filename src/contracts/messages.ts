import { z } from "zod";
import { contentBlocksSchema } from "./content";
import { cursorPageSchema } from "./pagination";
import { messageStatusSchema } from "./run";

export const messageRoleSchema = z.enum(["user", "assistant", "system", "tool"]);

export const messageSchema = z.strictObject({
  id: z.uuid(),
  chatId: z.uuid(),
  runId: z.uuid().nullable(),
  role: messageRoleSchema,
  status: messageStatusSchema,
  content: contentBlocksSchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const messageListResponseSchema = cursorPageSchema(messageSchema);

export type MessageRecord = z.infer<typeof messageSchema>;
