import { afterEach, describe, expect, it, vi } from "vitest";
import { attachmentController } from "./attachment.controller";

afterEach(() => vi.unstubAllEnvs());

describe("attachmentController", () => {
  it("allows the authenticated upload preflight headers", async () => {
    vi.stubEnv("FRONTEND_ORIGINS", "https://chat-agent-frontend.vercel.app");
    vi.stubEnv("CLERK_PUBLISHABLE_KEY", "pk_test");
    vi.stubEnv("CLERK_SECRET_KEY", "sk_test");
    const response = await attachmentController(new Request("https://backend.example/attachments", {
      method: "OPTIONS",
      headers: { Origin: "https://chat-agent-frontend.vercel.app" },
    }), "0e07ed4b-3838-4b0f-875a-6bdbafdeeed0", "options");

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-methods")).toBe("POST, OPTIONS");
    expect(response.headers.get("access-control-allow-headers")).toBe("Authorization, Content-Type");
  });
});
