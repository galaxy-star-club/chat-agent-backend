import { z } from "zod";

export const CONTRACT_VERSION = "1.0.0";

export const healthResponseSchema = z.strictObject({
  status: z.literal("ok"),
  service: z.literal("agentic-chat-api"),
  contractVersion: z.literal(CONTRACT_VERSION),
});

export const apiErrorSchema = z.strictObject({
  error: z.strictObject({
    code: z.enum([
      "AUTHENTICATION_REQUIRED",
      "ORIGIN_NOT_ALLOWED",
      "CONFIGURATION_ERROR",
      "INTERNAL_ERROR",
      "METHOD_NOT_ALLOWED",
    ]),
    message: z.string().min(1),
    requestId: z.uuid(),
  }),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
export type ApiError = z.infer<typeof apiErrorSchema>;
