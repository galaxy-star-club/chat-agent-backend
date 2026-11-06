import { healthResponseSchema } from "@/contracts/health";
import { getFrontendOrigins } from "@/lib/config";
import { preflightHeaders, responseHeaders } from "@/lib/cors";
import { errorResponse, mapErrorToResponse } from "@/lib/error-response";
import { createTraceContext } from "@/lib/trace-context";
import { getHealth } from "./health.service";

export function healthController(request: Request): Response {
  const response = handleHealth(request);
  return request.method === "HEAD"
    ? new Response(null, { status: response.status, headers: response.headers })
    : response;
}

function handleHealth(request: Request): Response {
  const trace = createTraceContext();
  const requestId = trace.requestId;
  let headers = responseHeaders(requestId);
  try {
    const origins = getFrontendOrigins();
    if (!origins) return errorResponse("CONFIGURATION_ERROR", 503, requestId, headers);

    const origin = request.headers.get("origin");
    if (origin !== null && !origins.has(origin)) {
      return errorResponse("ORIGIN_NOT_ALLOWED", 403, requestId, headers);
    }
    headers = responseHeaders(requestId, origin ?? undefined);
    if (request.method === "OPTIONS") {
      preflightHeaders(headers);
      return new Response(null, { status: 204, headers });
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      headers.set("Allow", "GET, HEAD, OPTIONS");
      return errorResponse("METHOD_NOT_ALLOWED", 405, requestId, headers);
    }
    const health = healthResponseSchema.parse(getHealth());
    return Response.json(health, { headers });
  } catch (error) {
    return mapErrorToResponse(error, trace, headers);
  }
}
