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

export type RunStatus = z.infer<typeof runStatusSchema>;
export type MessageStatus = z.infer<typeof messageStatusSchema>;
export type RunMetadata = z.infer<typeof runMetadataSchema>;
