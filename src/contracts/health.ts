import { z } from "zod";

export const CONTRACT_VERSION = "1.0.0";

export const healthResponseSchema = z.strictObject({
  status: z.literal("ok"),
  service: z.literal("agentic-chat-api"),
  contractVersion: z.literal(CONTRACT_VERSION),
});

export const apiErrorSchema = z.strictObject({
  error: z.strictObject({
    code: z.enum(["ORIGIN_NOT_ALLOWED", "CONFIGURATION_ERROR", "INTERNAL_ERROR"]),
    message: z.string().min(1),
    requestId: z.uuid(),
  }),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
export type ApiError = z.infer<typeof apiErrorSchema>;
