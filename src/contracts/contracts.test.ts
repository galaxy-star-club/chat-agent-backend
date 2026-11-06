import { describe, expect, it } from "vitest";
import { z } from "zod";
import { apiSuccessSchema } from "./api";
import { contentBlocksSchema } from "./content";
import { jsonValueSchema } from "./json";
import { cursorPageSchema, cursorPaginationQuerySchema } from "./pagination";
import { messageStatusSchema, runMetadataSchema, runStatusSchema } from "./run";
import { toolCallSchema, toolResultSchema } from "./tools";

describe("shared boundary contracts", () => {
  it("keeps content block order and rejects unknown fields", () => {
    const blocks = [
      { type: "text", text: "answer" },
      { type: "thinking", text: "working" },
      { type: "reasoning", text: "because" },
      { type: "tool_use", call: { id: "call-1", name: "lookup", input: { query: "safe" } } },
      { type: "tool_result", result: { toolCallId: "call-1", status: "completed", output: [1, true, null] } },
      { type: "citation", url: "https://example.com/source", title: "Source" },
      { type: "usage", inputTokens: 4, outputTokens: 8 },
    ];

    expect(contentBlocksSchema.parse(blocks)).toEqual(blocks);
    expect(() => contentBlocksSchema.parse([{ type: "text", text: "answer", provider: "private" }])).toThrow();
    expect(() => contentBlocksSchema.parse([{ type: "citation", url: "file:///private/source" }])).toThrow();
  });

  it("accepts only JSON-compatible tool values", () => {
    expect(toolCallSchema.parse({ id: "call-1", name: "lookup", input: { nested: [1, "two"] } })).toBeTruthy();
    expect(toolResultSchema.parse({ toolCallId: "call-1", status: "completed", output: null })).toBeTruthy();
    expect(toolResultSchema.parse({
      toolCallId: "call-1",
      status: "failed",
      error: { code: "TOOL_FAILED", message: "Tool failed safely." },
    })).toBeTruthy();
    expect(() => jsonValueSchema.parse({ invalid: undefined })).toThrow();
    expect(() => toolCallSchema.parse({ id: "call-1", name: "lookup", input: 1, provider: "x" })).toThrow();
    expect(() => toolResultSchema.parse({
      toolCallId: "call-1",
      status: "failed",
      output: "invalid for failure",
      error: { code: "TOOL_FAILED", message: "Tool failed safely." },
    })).toThrow();
  });

  it("distinguishes completed, failed, and cancelled terminal states", () => {
    expect(runStatusSchema.parse("completed")).toBe("completed");
    expect(runStatusSchema.parse("failed")).toBe("failed");
    expect(runStatusSchema.parse("cancelled")).toBe("cancelled");
    expect(messageStatusSchema.parse("cancelled")).toBe("cancelled");
    expect(() => runStatusSchema.parse("complete")).toThrow();
  });

  it("validates run trace identifiers", () => {
    expect(runMetadataSchema.parse({
      runId: "d9428888-122b-4e1a-9be2-3f1536db24d3",
      status: "running",
      trace: {
        requestId: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
        traceId: "0af7651916cd43dd8448eb211c80319c",
        spanId: "b7ad6b7169203331",
      },
    })).toBeTruthy();
    expect(() => runMetadataSchema.parse({ runId: "run-1", status: "running", trace: {} })).toThrow();
  });

  it("bounds opaque cursor pagination and generic envelopes", () => {
    expect(cursorPaginationQuerySchema.parse({ cursor: "opaque", limit: "100" })).toEqual({ cursor: "opaque", limit: 100 });
    expect(cursorPaginationQuerySchema.parse({})).toEqual({ limit: 50 });
    expect(() => cursorPaginationQuerySchema.parse({ limit: 101 })).toThrow();
    expect(() => cursorPaginationQuerySchema.parse({ cursor: "x", limit: 1, offset: 0 })).toThrow();

    const pageSchema = apiSuccessSchema(cursorPageSchema(z.string()));
    expect(pageSchema.parse({ data: { items: ["one"], pageInfo: { nextCursor: null, hasMore: false } } })).toBeTruthy();
  });
});
