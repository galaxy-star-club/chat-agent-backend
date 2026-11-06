import { z } from "zod";
import { jsonValueSchema } from "./json";

export const toolCallSchema = z.strictObject({
  id: z.string().min(1).max(200),
  name: z.string().min(1).max(100),
  input: jsonValueSchema,
});

const toolResultBase = {
  toolCallId: z.string().min(1).max(200),
};

export const toolResultErrorSchema = z.strictObject({
  code: z.string().min(1).max(100),
  message: z.string().min(1),
});

export const toolResultSchema = z.discriminatedUnion("status", [
  z.strictObject({ ...toolResultBase, status: z.literal("completed"), output: jsonValueSchema }),
  z.strictObject({ ...toolResultBase, status: z.literal("failed"), error: toolResultErrorSchema }),
  z.strictObject({ ...toolResultBase, status: z.literal("cancelled"), error: toolResultErrorSchema }),
]);

export type ToolCall = z.infer<typeof toolCallSchema>;
export type ToolResult = z.infer<typeof toolResultSchema>;
