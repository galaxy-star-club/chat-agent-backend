import { afterEach, describe, expect, it, vi } from "vitest";
import { apiErrorSchema, healthResponseSchema } from "@/contracts/health";
import { GET, OPTIONS, HEAD, POST, PUT, PATCH, DELETE } from "@/app/api/v1/health/route";
import * as service from "./health.service";

function request(method = "GET", origin?: string) {
  const headers = new Headers({ "x-request-id": "untrusted-client-value" });
  if (origin !== undefined) headers.set("Origin", origin);
  return new Request("http://localhost:3001/api/v1/health", { method, headers });
}

function expectCommonHeaders(response: Response) {
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("vary")).toBe("Origin");
  expect(response.headers.get("x-request-id")).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  expect(response.headers.has("access-control-allow-credentials")).toBe(false);
}

async function expectError(response: Response, status: number, code: string) {
  expect(response.status).toBe(status);
  expectCommonHeaders(response);
  const body = apiErrorSchema.parse(await response.json());
  expect(body.error.code).toBe(code);
  expect(body.error.requestId).toBe(response.headers.get("x-request-id"));
  return body;
}

afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

function development() {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("FRONTEND_ORIGINS", undefined);
}

describe("health HTTP boundary", () => {
  it("allows public health without an Origin and issues fresh server IDs", async () => {
    development();
    const first = GET(request());
    const second = GET(request());
    expect(first.status).toBe(200);
    expectCommonHeaders(first);
    expect(first.headers.get("x-request-id")).not.toBe(second.headers.get("x-request-id"));
    expect(first.headers.has("access-control-allow-origin")).toBe(false);
    expect(healthResponseSchema.parse(await first.json())).toEqual({ status: "ok", service: "agentic-chat-api", contractVersion: "1.0.0" });
  });

  it("allows only the development default and exposes the request ID", () => {
    development();
    const response = GET(request("GET", "http://localhost:3000"));
    expect(response.status).toBe(200);
    expectCommonHeaders(response);
    expect(response.headers.get("access-control-allow-origin")).toBe("http://localhost:3000");
    expect(response.headers.get("access-control-expose-headers")).toBe("x-request-id");
  });

  it.each(["https://unknown.example", "http://localhost:3000.evil.example", "null", ""])("denies an unlisted Origin %s without reflection", async (origin) => {
    development();
    const response = GET(request("GET", origin));
    await expectError(response, 403, "ORIGIN_NOT_ALLOWED");
    expect(response.headers.has("access-control-allow-origin")).toBe(false);
  });

  it("accepts explicit exact origins and handles bounded OPTIONS", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("FRONTEND_ORIGINS", "https://frontend.example, http://localhost:4000");
    const response = OPTIONS(request("OPTIONS", "https://frontend.example"));
    expect(response.status).toBe(204);
    expectCommonHeaders(response);
    expect(response.headers.get("access-control-allow-origin")).toBe("https://frontend.example");
    expect(response.headers.get("access-control-allow-methods")).toBe("GET, HEAD, OPTIONS");
    expect(response.headers.get("access-control-max-age")).toBe("600");
    expect(response.body).toBeNull();
  });

  it("applies Origin rejection to preflight too", async () => {
    development();
    const response = OPTIONS(request("OPTIONS", "https://unknown.example"));
    await expectError(response, 403, "ORIGIN_NOT_ALLOWED");
    expect(response.headers.has("access-control-allow-origin")).toBe(false);
  });

  it.each([undefined, "", " ", "*", "https://*.example", "https://frontend.example/", "https://frontend.example/path", "https://user:secret@frontend.example", "https://frontend.example?secret=1", "https://frontend.example#fragment", "ftp://frontend.example", "https://frontend.example,", "https://frontend.example,,https://other.example"])("fails safely for missing or invalid production config %s", async (config) => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("FRONTEND_ORIGINS", config);
    const response = GET(request("GET", "https://frontend.example"));
    const body = await expectError(response, 503, "CONFIGURATION_ERROR");
    expect(body.error.message).toBe("Service configuration is unavailable.");
    expect(response.headers.has("access-control-allow-origin")).toBe(false);
  });

  it("does not leak unexpected errors and retains allowed CORS", async () => {
    development();
    vi.spyOn(service, "getHealth").mockImplementation(() => { throw new Error("private credentials"); });
    const response = GET(request("GET", "http://localhost:3000"));
    const body = await expectError(response, 500, "INTERNAL_ERROR");
    expect(JSON.stringify(body)).not.toContain("private credentials");
    expect(response.headers.get("access-control-allow-origin")).toBe("http://localhost:3000");
  });

  it("validates service output against the frozen success contract", async () => {
    development();
    vi.spyOn(service, "getHealth").mockReturnValue({ status: "wrong" } as never);
    await expectError(GET(request()), 500, "INTERNAL_ERROR");
  });

  it.each([POST, PUT, PATCH, DELETE])("rejects unsupported methods with traced JSON and Allow", async (handler) => {
    development();
    const response = handler(request(handler.name, "http://localhost:3000"));
    await expectError(response, 405, "METHOD_NOT_ALLOWED");
    expect(response.headers.get("allow")).toBe("GET, HEAD, OPTIONS");
    expect(response.headers.get("access-control-allow-origin")).toBe("http://localhost:3000");
  });

  it("keeps HEAD success and error bodyless with traced headers", () => {
    development();
    for (const origin of [undefined, "https://unknown.example"]) {
      const response = HEAD(request("HEAD", origin));
      expect(response.status).toBe(origin ? 403 : 200);
      expectCommonHeaders(response);
      expect(response.body).toBeNull();
    }
  });
});
