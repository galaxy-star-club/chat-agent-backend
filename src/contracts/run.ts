import { z } from "zod";
import { traceContextSchema } from "./trace";

export const runStatusSchema = z.enum([
  "pending",
  "running",
  "waiting",
  "completed",
  "failed",
  "cancelled",
]);

export const messageStatusSchema = z.enum(["streaming", "completed", "failed", "cancelled"]);

export const runMetadataSchema = z.strictObject({
  runId: z.uuid(),
  status: runStatusSchema,
  trace: traceContextSchema,
});

export const runErrorSchema = z.strictObject({
  code: z.string().regex(/^[a-z0-9_]{1,64}$/),
  message: z.string().min(1).max(300),
});

export const modelNameSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/);

export const runUsageSchema = z.strictObject({
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
});

export const agentRunRecordSchema = z.strictObject({
  id: z.uuid(),
  chatId: z.uuid(),
  status: runStatusSchema,
  requestedModel: modelNameSchema.nullable(),
  routedModel: modelNameSchema.nullable(),
  usage: runUsageSchema.nullable(),
  error: runErrorSchema.nullable(),
  traceId: z.string().regex(/^[0-9a-f]{32}$/),
});

export type RunStatus = z.infer<typeof runStatusSchema>;
export type MessageStatus = z.infer<typeof messageStatusSchema>;
export type RunMetadata = z.infer<typeof runMetadataSchema>;
export type RunError = z.infer<typeof runErrorSchema>;
export type AgentRunRecord = z.infer<typeof agentRunRecordSchema>;
