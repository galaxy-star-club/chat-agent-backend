import { currentSessionResponseSchema } from "@/contracts/auth";
import { getClerkConfig, getFrontendOrigins } from "@/lib/config";
import { preflightHeaders, responseHeaders } from "@/lib/cors";
import { errorResponse, mapErrorToResponse } from "@/lib/error-response";
import { readRequestIdentity } from "@/lib/request-auth.server";
import { createTraceContext } from "@/lib/trace-context";
import { getCurrentSession } from "./auth.service";

export async function authController(request: Request): Promise<Response> {
  const response = await handleAuth(request);
  return request.method === "HEAD"
    ? new Response(null, { status: response.status, headers: response.headers })
    : response;
}

async function handleAuth(request: Request): Promise<Response> {
  const trace = createTraceContext();
  const requestId = trace.requestId;
  let headers = responseHeaders(requestId);
  try {
    const origins = getFrontendOrigins();
    const clerkConfig = getClerkConfig();
    if (!origins || !clerkConfig) {
      return errorResponse("CONFIGURATION_ERROR", 503, requestId, headers);
    }

    const origin = request.headers.get("origin");
    if (origin !== null && !origins.has(origin)) {
      return errorResponse("ORIGIN_NOT_ALLOWED", 403, requestId, headers);
    }
    headers = responseHeaders(requestId, origin ?? undefined);

    if (request.method === "OPTIONS") {
      preflightHeaders(headers, "Authorization");
      return new Response(null, { status: 204, headers });
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      headers.set("Allow", "GET, HEAD, OPTIONS");
      return errorResponse("METHOD_NOT_ALLOWED", 405, requestId, headers);
    }

    const identity = readRequestIdentity(request, clerkConfig.secretKey);
    if (!identity) {
      return errorResponse("AUTHENTICATION_REQUIRED", 401, requestId, headers);
    }

    const session = currentSessionResponseSchema.parse(getCurrentSession(identity));
    return Response.json(session, { headers });
  } catch (error) {
    return mapErrorToResponse(error, trace, headers);
  }
}
