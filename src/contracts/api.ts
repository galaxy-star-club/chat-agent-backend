import { z } from "zod";

export const requestIdSchema = z.uuid();

export const apiErrorCodeSchema = z.enum([
  "AUTHENTICATION_REQUIRED",
  "ORIGIN_NOT_ALLOWED",
  "CONFIGURATION_ERROR",
  "DATABASE_UNAVAILABLE",
  "INTERNAL_ERROR",
  "METHOD_NOT_ALLOWED",
]);

export const apiErrorSchema = z.strictObject({
  error: z.strictObject({
    code: apiErrorCodeSchema,
    message: z.string().min(1),
    requestId: requestIdSchema,
  }),
});

export function apiSuccessSchema<T extends z.ZodType>(data: T) {
  return z.strictObject({ data });
}

export type ApiError = z.infer<typeof apiErrorSchema>;
export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>;
export type ApiSuccess<T> = { data: T };
