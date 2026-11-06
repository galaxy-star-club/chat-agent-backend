import { databaseReadinessResponseSchema } from "@/contracts/database-readiness";
import { getFrontendOrigins } from "@/lib/config";
import { preflightHeaders, responseHeaders } from "@/lib/cors";
import { errorResponse, mapErrorToResponse } from "@/lib/error-response";
import { createTraceContext } from "@/lib/trace-context";
import { getDatabaseReadiness } from "./database-readiness.service";

export async function databaseController(request: Request): Promise<Response> {
  const response = await handleDatabaseReadiness(request);
  return request.method === "HEAD"
    ? new Response(null, { status: response.status, headers: response.headers })
    : response;
}

async function handleDatabaseReadiness(request: Request): Promise<Response> {
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

    const result = await getDatabaseReadiness();
    if (result.status === "configuration-error") {
      return errorResponse("CONFIGURATION_ERROR", 503, requestId, headers);
    }
    if (result.status === "unavailable") {
      return errorResponse("DATABASE_UNAVAILABLE", 503, requestId, headers);
    }

    return Response.json(databaseReadinessResponseSchema.parse(result.response), { headers });
  } catch (error) {
    return mapErrorToResponse(error, trace, headers);
  }
}
