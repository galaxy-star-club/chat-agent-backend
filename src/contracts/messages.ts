import { z } from "zod";
import { contentBlocksSchema } from "./content";
import { cursorPageSchema } from "./pagination";
import { messageStatusSchema, runStatusSchema } from "./run";
import { traceContextSchema } from "./trace";

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

export const plainTextMaxCharacters = 1_000_000;

export const submitMessageRequestSchema = z.strictObject({
  idempotencyKey: z.uuid(),
  text: z.string().min(1).max(plainTextMaxCharacters).refine((value) => value.trim().length > 0),
});

export const messageAdmissionResponseSchema = z.strictObject({
  chatId: z.uuid(),
  messageId: z.uuid(),
  runId: z.uuid(),
  status: runStatusSchema,
  trace: traceContextSchema,
});

export type MessageRecord = z.infer<typeof messageSchema>;
export type SubmitMessageRequest = z.infer<typeof submitMessageRequestSchema>;
export type MessageAdmissionResponse = z.infer<typeof messageAdmissionResponseSchema>;
