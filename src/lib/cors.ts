export function responseHeaders(requestId: string, allowedOrigin?: string): Headers {
  const headers = new Headers({
    "Cache-Control": "no-store",
    Vary: "Origin",
    "x-request-id": requestId,
  });
  if (allowedOrigin) {
    headers.set("Access-Control-Allow-Origin", allowedOrigin);
    headers.set("Access-Control-Allow-Credentials", "true");
    headers.set("Access-Control-Expose-Headers", "x-request-id");
  }
  return headers;
}

export function preflightHeaders(headers: Headers, allowedHeaders?: string): void {
  headers.set("Allow", "GET, HEAD, OPTIONS");
  headers.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
  if (allowedHeaders) headers.set("Access-Control-Allow-Headers", allowedHeaders);
  headers.set("Access-Control-Max-Age", "600");
}
