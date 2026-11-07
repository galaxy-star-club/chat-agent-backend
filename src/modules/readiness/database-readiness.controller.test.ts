import { afterEach, describe, expect, it, vi } from "vitest";
import { databaseReadinessResponseSchema } from "@/contracts/database-readiness";
import { apiErrorSchema } from "@/contracts/health";
import { GET, HEAD, OPTIONS, POST } from "@/app/api/v1/readiness/database/route";
import * as service from "./database-readiness.service";

function request(method = "GET", origin?: string): Request {
  const headers = new Headers();
  if (origin) headers.set("Origin", origin);
  return new Request("http://localhost:3001/api/v1/readiness/database", { method, headers });
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("database readiness HTTP boundary", () => {
  it("returns only the validated readiness contract", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.spyOn(service, "getDatabaseReadiness").mockResolvedValue({
      status: "ready",
      response: { status: "ready", dependency: "database", contractVersion: "1.0.0" },
    });

    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(databaseReadinessResponseSchema.parse(await response.json())).toEqual({
      status: "ready",
      dependency: "database",
      contractVersion: "1.0.0",
    });
  });

  it("fails safely when runtime database configuration is missing", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DATABASE_URL", undefined);
    const response = await GET(request());
    expect(response.status).toBe(503);
    expect(apiErrorSchema.parse(await response.json()).error.code).toBe("CONFIGURATION_ERROR");
  });

  it("does not leak a database failure", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.spyOn(service, "getDatabaseReadiness").mockResolvedValue({ status: "unavailable" });
    const response = await GET(request());
    const body = apiErrorSchema.parse(await response.json());
    expect(response.status).toBe(503);
    expect(body.error).toMatchObject({ code: "DATABASE_UNAVAILABLE", message: "Database is unavailable." });
  });

  it("keeps preflight and method handling independent of the database", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("FRONTEND_ORIGINS", undefined);
    const readiness = vi.spyOn(service, "getDatabaseReadiness");
    const preflight = await OPTIONS(request("OPTIONS", "http://localhost:3000"));
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("allow")).toBe("GET, HEAD, OPTIONS");
    expect((await POST(request("POST"))).status).toBe(405);
    expect(readiness).not.toHaveBeenCalled();
  });

  it("keeps HEAD bodyless", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.spyOn(service, "getDatabaseReadiness").mockResolvedValue({
      status: "ready",
      response: { status: "ready", dependency: "database", contractVersion: "1.0.0" },
    });
    const response = await HEAD(request("HEAD"));
    expect(response.status).toBe(200);
    expect(response.body).toBeNull();
  });
});
