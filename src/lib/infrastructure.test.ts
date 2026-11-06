import { afterEach, describe, expect, it, vi } from "vitest";
import { traceContextSchema } from "@/contracts/trace";
import { mapErrorToResponse } from "./error-response";
import { redact } from "./logger";
import { createTraceContext } from "./trace-context";

afterEach(() => vi.restoreAllMocks());

describe("request infrastructure", () => {
  it("creates validated trace identifiers", () => {
    expect(traceContextSchema.parse(createTraceContext())).toBeTruthy();
  });

  it("redacts nested secrets and errors without mutating safe fields", () => {
    expect(redact({
      authorization: "Bearer private",
      nested: { apiKey: "private", safe: "visible" },
      error: new Error("credential value"),
    })).toEqual({
      authorization: "[REDACTED]",
      nested: { apiKey: "[REDACTED]", safe: "visible" },
      error: { name: "Error" },
    });
  });

  it("maps unexpected errors to a safe traced response and structured log", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const trace = createTraceContext();
    const response = mapErrorToResponse(new Error("database password"), trace, new Headers());

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: { code: "INTERNAL_ERROR", message: "An internal error occurred.", requestId: trace.requestId },
    });
    const log = consoleError.mock.calls[0]?.[0];
    expect(JSON.parse(String(log))).toMatchObject({ level: "error", event: "request_failed", ...trace, error: { name: "Error" } });
    expect(String(log)).not.toContain("database password");
  });

  it.each([
    "database password",
    { message: "token=private", authorization: "Bearer private" },
  ])("does not log a non-Error thrown value", (error) => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mapErrorToResponse(error, createTraceContext(), new Headers());

    const log = String(consoleError.mock.calls[0]?.[0]);
    expect(log).toContain('"name":"Error"');
    expect(log).not.toContain("database password");
    expect(log).not.toContain("token=private");
    expect(log).not.toContain("Bearer private");
  });
});
