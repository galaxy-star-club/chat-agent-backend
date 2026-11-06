import { z } from "zod";
export { apiErrorSchema, type ApiError } from "./api";

export const CONTRACT_VERSION = "1.0.0";

export const healthResponseSchema = z.strictObject({
  status: z.literal("ok"),
  service: z.literal("agentic-chat-api"),
  contractVersion: z.literal(CONTRACT_VERSION),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
