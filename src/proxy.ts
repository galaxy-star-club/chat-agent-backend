import { NextResponse } from "next/server";
import { getClerkConfig, getFrontendOrigins } from "@/lib/config";
import { responseHeaders } from "@/lib/cors";
import { errorResponse, mapErrorToResponse } from "@/lib/error-response";
import { authenticateSession, requestIdentityHeader, sealIdentity } from "@/lib/request-auth.server";
import { createTraceContext } from "@/lib/trace-context";

const publicPaths = new Set(["/api/v1/health", "/api/v1/readiness/database"]);

export async function proxy(request: Request): Promise<Response> {
  const url = new URL(request.url);
  if (publicPaths.has(url.pathname) || request.method === "OPTIONS") return NextResponse.next();

  const trace = createTraceContext();
  const requestId = trace.requestId;
  let headers = responseHeaders(requestId);
  try {
    const origins = getFrontendOrigins();
    const clerkConfig = getClerkConfig();
    if (!origins || !clerkConfig) return proxyResponse(errorResponse("CONFIGURATION_ERROR", 503, requestId, headers));

    const origin = request.headers.get("origin");
    if (origin !== null && !origins.has(origin)) return proxyResponse(errorResponse("ORIGIN_NOT_ALLOWED", 403, requestId, headers));
    headers = responseHeaders(requestId, origin ?? undefined);

    const session = await authenticateSession(request, clerkConfig, origins);
    if (session.kind === "handshake" && isDocumentNavigation(request)) {
      return proxyResponse(new Response(null, { status: 307, headers: session.headers }));
    }
  if (session.kind !== "authenticated") {
    return proxyResponse(errorResponse("AUTHENTICATION_REQUIRED", 401, requestId, headers));
  }

    const requestHeaders = new Headers(request.headers);
    requestHeaders.delete(requestIdentityHeader);
    requestHeaders.set(requestIdentityHeader, sealIdentity(session.identity, clerkConfig.secretKey));
    const response = NextResponse.next({ request: { headers: requestHeaders } });
    appendSetCookies(response.headers, session.headers);
    return response;
  } catch (error) {
    return proxyResponse(mapErrorToResponse(error, trace, headers));
  }
}

export const config = {
  matcher: ["/api/v1/:path*"],
};

function isDocumentNavigation(request: Request): boolean {
  return request.headers.get("sec-fetch-dest") === "document" || request.headers.get("sec-fetch-mode") === "navigate";
}

function appendSetCookies(target: Headers, source: Headers): void {
  for (const cookie of source.getSetCookie()) target.append("set-cookie", cookie);
}

function proxyResponse(response: Response): Response {
  return new NextResponse(response.body, { status: response.status, headers: response.headers });
}
