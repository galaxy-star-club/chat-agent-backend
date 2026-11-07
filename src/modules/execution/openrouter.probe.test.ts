import { writeFileSync } from "node:fs";
import { config } from "dotenv";
import { describe, it } from "vitest";
import { z } from "zod";
import { providerTools } from "./tool-registry";
import { streamFreeModel } from "./openrouter.provider";
import { systemPrompt } from "./context";
import { maxStoredTokens } from "./execution-policy";
import { plainTextMaxCharacters } from "@/contracts/messages";

config();

function shape(value: unknown, depth = 0): unknown {
  if (depth > 4) return typeof value;
  if (value === null) return "null";
  if (Array.isArray(value)) return value.slice(0, 2).map((item) => shape(item, depth + 1));
  if (typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, shape(item, depth + 1)]));
  }
  if (typeof value === "string") return `string(${value.length})`;
  return typeof value;
}

const apiKey = process.env.OPENROUTER_API_KEY?.trim();

describe("openrouter probe", () => {
  it.skipIf(!apiKey)("prints a sanitized provider response", async () => {
    if (!apiKey) return;
    const tools = providerTools();
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(60_000),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openrouter/free",
        messages: [
          { role: "system", content: systemPrompt([]) },
          { role: "user", content: "Say hello in one sentence." },
        ],
        tools,
        stream: true,
        stream_options: { include_usage: true },
      }),
    });
    const raw = await response.text();
    const redacted = raw.replace(/sk-or-[A-Za-z0-9_-]+/g, "[key]").replace(/Bearer\s+\S+/g, "Bearer [key]");
    const events = redacted.split(/\r?\n/).filter((line) => line.startsWith("data:")).slice(0, 6).map((line) => {
      const data = line.slice(5).trim();
      if (data === "[DONE]") return "[DONE]";
      try {
        return shape(JSON.parse(data));
      } catch {
        return `unparsed(${data.slice(0, 80)})`;
      }
    });
    const usageSchema = z.object({
      prompt_tokens: z.number().int().nonnegative().max(maxStoredTokens).optional(),
      completion_tokens: z.number().int().nonnegative().max(maxStoredTokens).optional(),
    });
    const toolCallDeltaSchema = z.object({
      index: z.number().int().nonnegative().optional(),
      id: z.string().optional(),
      function: z.object({
        name: z.string().optional(),
        arguments: z.string().optional(),
      }).optional(),
    });
    const chunkSchema = z.object({
      model: z.string().optional(),
      error: z.object({ code: z.union([z.string(), z.number()]).optional() }).optional(),
      usage: usageSchema.optional(),
      choices: z.array(z.object({
        finish_reason: z.string().nullable().optional(),
        delta: z.object({
          content: z.string().optional(),
          reasoning: z.string().optional(),
          reasoning_content: z.string().optional(),
          tool_calls: z.array(toolCallDeltaSchema).optional(),
        }).optional(),
        message: z.object({
          content: z.string().nullable().optional(),
          reasoning: z.string().nullable().optional(),
          tool_calls: z.array(z.object({
            id: z.string().optional(),
            function: z.object({ name: z.string().optional(), arguments: z.string().optional() }).optional(),
          })).optional(),
        }).optional(),
      })).optional(),
    });
    const failures: unknown[] = [];
    let text = 0;
    let reasoning = 0;
    for (const line of redacted.split(/\r?\n/)) {
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      let payload: unknown;
      try {
        payload = JSON.parse(data);
      } catch {
        failures.push({ kind: "json", sample: data.slice(0, 180) });
        break;
      }
      const parsed = chunkSchema.safeParse(payload);
      if (!parsed.success) {
        failures.push({
          issues: parsed.error.issues.slice(0, 6).map((issue) => ({ path: issue.path, code: issue.code, message: issue.message })),
          shape: shape(payload),
        });
        if (failures.length >= 3) break;
        continue;
      }
      const chunk = parsed.data;
      for (const choice of chunk.choices ?? []) {
        text += choice.delta?.content?.length ?? 0;
        reasoning += (choice.delta?.reasoning ?? choice.delta?.reasoning_content ?? "").length;
      }
      if (text >= plainTextMaxCharacters || reasoning >= plainTextMaxCharacters) {
        failures.push({ kind: "too_large", text, reasoning });
        break;
      }
    }
    const variants = [
      { name: "reasoning-off", body: { reasoning: { enabled: false }, max_tokens: 32, stream: false } },
      { name: "effort-none", body: { reasoning: { effort: "none" }, max_tokens: 32, stream: false } },
      { name: "exclude", body: { reasoning: { exclude: true }, max_tokens: 64, stream: false } },
    ];
    const titleTrials = [];
    for (const variant of variants) {
      const titleResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(60_000),
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "openrouter/free",
          messages: [
            { role: "system", content: "Name this task in two to five words. Reply with the title only." },
            { role: "user", content: "Say hello in one sentence." },
          ],
          ...variant.body,
        }),
      });
      const titleRaw = (await titleResponse.text()).replace(/sk-or-[A-Za-z0-9_-]+/g, "[key]");
      let titleShape: unknown = titleRaw.slice(0, 400);
      try {
        const parsed = JSON.parse(titleRaw) as { model?: string; error?: { message?: string; code?: unknown }; choices?: Array<{ message?: { content?: unknown; reasoning?: unknown } }> };
        const reasoning = parsed.choices?.[0]?.message?.reasoning;
        titleShape = {
          model: parsed.model,
          error: parsed.error ? { code: parsed.error.code, message: String(parsed.error.message ?? "").slice(0, 180) } : null,
          content: parsed.choices?.[0]?.message?.content,
          reasoningType: reasoning === null ? "null" : typeof reasoning,
          reasoningSample: typeof reasoning === "string" ? reasoning.slice(0, 80) : null,
        };
      } catch {
        titleShape = titleRaw.slice(0, 400);
      }
      titleTrials.push({ name: variant.name, status: titleResponse.status, titleShape });
    }
    const result = await streamFreeModel({
      apiKey,
      messages: [
        { role: "system", content: systemPrompt([]) },
        { role: "user", content: "Say hello in one sentence." },
      ],
      tools,
    });
    writeFileSync("/tmp/openrouter-probe.json", JSON.stringify({
      status: response.status,
      contentType: response.headers.get("content-type"),
      bodyLength: redacted.length,
      bodyStart: redacted.slice(0, 500),
      events,
      failures,
      accumulated: { text, reasoning },
      titleTrials,
      result: {
        code: result.code,
        model: result.model,
        textLength: result.text.length,
        reasoningLength: result.reasoning.length,
        calls: result.calls.length,
        malformed: result.malformed.length,
      },
    }, null, 2));
  }, 180_000);
});
