import { apiErrorSchema, type ApiError } from "@/contracts/health";

type ErrorCode = ApiError["error"]["code"];
const messages: Record<ErrorCode, string> = {
  AUTHENTICATION_REQUIRED: "Authentication is required.",
  CONFIGURATION_ERROR: "Service configuration is unavailable.",
  DATABASE_UNAVAILABLE: "Database is unavailable.",
  ORIGIN_NOT_ALLOWED: "Origin is not allowed.",
  METHOD_NOT_ALLOWED: "Method is not allowed.",
  INTERNAL_ERROR: "An internal error occurred.",
};

export function errorResponse(code: ErrorCode, status: number, requestId: string, headers: Headers): Response {
  const body = apiErrorSchema.parse({ error: { code, message: messages[code], requestId } });
  return Response.json(body, { status, headers });
}
