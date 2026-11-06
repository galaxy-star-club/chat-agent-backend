import { apiErrorSchema, type ApiErrorCode } from "@/contracts/api";
import type { TraceContext } from "@/contracts/trace";
import { logError } from "./logger";

const messages: Record<ApiErrorCode, string> = {
  AUTHENTICATION_REQUIRED: "Authentication is required.",
  CONFIGURATION_ERROR: "Service configuration is unavailable.",
  DATABASE_UNAVAILABLE: "Database is unavailable.",
  ORIGIN_NOT_ALLOWED: "Origin is not allowed.",
  METHOD_NOT_ALLOWED: "Method is not allowed.",
  INTERNAL_ERROR: "An internal error occurred.",
};

export function errorResponse(code: ApiErrorCode, status: number, requestId: string, headers: Headers): Response {
  const body = apiErrorSchema.parse({ error: { code, message: messages[code], requestId } });
  return Response.json(body, { status, headers });
}

export function mapErrorToResponse(error: unknown, trace: TraceContext, headers: Headers): Response {
  logError("request_failed", trace, { error: error instanceof Error ? error : new Error("Unknown thrown value") });
  return errorResponse("INTERNAL_ERROR", 500, trace.requestId, headers);
}
