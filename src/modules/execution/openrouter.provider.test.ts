import { afterEach, describe, expect, it, vi } from "vitest";
import { streamFreeModel } from "./openrouter.provider";

afterEach(() => vi.unstubAllGlobals());

function sseResponse(events: unknown[]) {
  const body = `${events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("")}data: [DONE]\n\n`;
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}

describe("streamFreeModel", () => {
  it("keeps a reply when a stream chunk sets reasoning to null", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => sseResponse([
      { model: "example/free-model:free", choices: [{ delta: { content: "Hello there." } }] },
      { model: "example/free-model:free", choices: [{ delta: { content: null, reasoning: null }, finish_reason: "stop" }] },
    ])));
    const result = await streamFreeModel({
      apiKey: "test-key",
      messages: [{ role: "user", content: "Say hello in one sentence." }],
      tools: [],
    });
    expect(result.code).toBe("ok");
    expect(result.text).toBe("Hello there.");
    expect(result.model).toBe("example/free-model:free");
  });

  it("rejects a routed model that is not free", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => sseResponse([
      { model: "openai/gpt-4o", choices: [{ delta: { content: "Hello" } }] },
    ])));
    const result = await streamFreeModel({
      apiKey: "test-key",
      messages: [{ role: "user", content: "Hi" }],
      tools: [],
    });
    expect(result.code).toBe("invalid_provider_output");
    expect(result.text).toBe("");
  });
});
