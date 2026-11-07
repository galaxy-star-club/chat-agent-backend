import { z } from "zod";
import { freeModelId } from "@/lib/config";
import { jsonValueSchema, type JsonValue } from "@/contracts/json";
import { plainTextMaxCharacters } from "@/contracts/messages";
import { modelNameSchema } from "@/contracts/run";
import { maxStoredTokens, providerTimeoutMs } from "./execution-policy";
import type { ProviderMessage } from "./context";

const endpoint = "https://openrouter.ai/api/v1/chat/completions";
const maxEvents = 10_000;

const usageSchema = z.object({
  prompt_tokens: z.number().int().nonnegative().max(maxStoredTokens).nullish(),
  completion_tokens: z.number().int().nonnegative().max(maxStoredTokens).nullish(),
});
const toolCallDeltaSchema = z.object({
  index: z.number().int().nonnegative().nullish(),
  id: z.string().nullish(),
  function: z.object({
    name: z.string().nullish(),
    arguments: z.string().nullish(),
  }).nullish(),
});
// Free-model streams send null for unused fields such as delta.reasoning. Rejecting null drops a usable reply.
const chunkSchema = z.object({
  model: z.string().nullish(),
  error: z.object({ code: z.union([z.string(), z.number()]).nullish() }).nullish(),
  usage: usageSchema.nullish(),
  choices: z.array(z.object({
    finish_reason: z.string().nullish(),
    delta: z.object({
      content: z.string().nullish(),
      reasoning: z.string().nullish(),
      reasoning_content: z.string().nullish(),
      tool_calls: z.array(toolCallDeltaSchema).nullish(),
    }).nullish(),
    message: z.object({
      content: z.string().nullish(),
      reasoning: z.string().nullish(),
      tool_calls: z.array(z.object({
        id: z.string().nullish(),
        function: z.object({ name: z.string().nullish(), arguments: z.string().nullish() }).nullish(),
      })).nullish(),
    }).nullish(),
  })).nullish(),
});

export type ProviderTool = {
  type: "function";
  function: { name: string; description: string; parameters: JsonValue };
};

export type ModelCallResult = {
  text: string;
  reasoning: string;
  calls: Array<{ id: string; name: string; arguments: JsonValue }>;
  malformed: Array<{ id: string; name: string }>;
  model: string | null;
  usage: { inputTokens: number; outputTokens: number } | null;
  code: "ok" | "empty_response" | "provider_rate_limited" | "provider_unavailable" | "provider_interrupted" | "invalid_provider_output" | "output_too_large";
};

type Draft = { text: string; reasoning: string };
type ToolDraft = { id: string; name: string; arguments: string };

export async function streamFreeModel(input: {
  apiKey: string;
  messages: ProviderMessage[];
  tools: ProviderTool[];
  onDraft?: (draft: Draft) => Promise<void>;
  onDelta?: (draft: Draft) => Promise<void>;
  /** Title calls use a short non-streaming completion. The chat reply stays streamed. */
  maxTokens?: number;
  disableReasoning?: boolean;
}): Promise<ModelCallResult> {
  const empty = result("", "", [], [], null, null, "provider_unavailable");
  const limited = input.maxTokens;
  if (limited !== undefined && (!Number.isInteger(limited) || limited < 1 || limited > 64)) {
    return result("", "", [], [], null, null, "invalid_provider_output");
  }
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(providerTimeoutMs),
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: freeModelId,
        messages: input.messages.map(wireMessage),
        ...(input.tools.length > 0 ? { tools: input.tools } : {}),
        ...(limited === undefined
          ? { stream: true, stream_options: { include_usage: true } }
          : {
            stream: false,
            max_tokens: limited,
            ...(input.disableReasoning ? { reasoning: { enabled: false } } : {}),
          }),
      }),
    });
  } catch {
    return empty;
  }
  if (response.status === 429) return result("", "", [], [], null, null, "provider_rate_limited");
  if (response.status === 401 || response.status === 403 || response.status >= 500) return empty;
  if (!response.ok || !response.body) return result("", "", [], [], null, null, "invalid_provider_output");

  const state = { text: "", reasoning: "", tools: new Map<number, ToolDraft>(), model: null as string | null, usage: null as ModelCallResult["usage"], events: 0, flushed: 0 };
  try {
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const parsed = chunkSchema.safeParse(await response.json());
      if (!parsed.success) return result(state.text, state.reasoning, [], [], state.model, state.usage, "invalid_provider_output");
      applyChunk(state, parsed.data);
    } else {
      for await (const data of sseData(response.body)) {
        state.events += 1;
        if (state.events > maxEvents) return result(state.text, state.reasoning, [], [], state.model, state.usage, "provider_interrupted");
        if (data === "[DONE]") break;
        let payload: unknown;
        try {
          payload = JSON.parse(data);
        } catch {
          return result(state.text, state.reasoning, [], [], state.model, state.usage, "invalid_provider_output");
        }
        const parsed = chunkSchema.safeParse(payload);
        if (!parsed.success) return result(state.text, state.reasoning, [], [], state.model, state.usage, "invalid_provider_output");
        const sizeBefore = state.text.length + state.reasoning.length;
        const outcome = applyChunk(state, parsed.data);
        if (outcome) return result(state.text, state.reasoning, [], [], state.model, state.usage, outcome);
        if (input.onDelta && state.text.length + state.reasoning.length > sizeBefore) await input.onDelta({ text: state.text, reasoning: state.reasoning });
        if (state.text.length >= plainTextMaxCharacters || state.reasoning.length >= plainTextMaxCharacters) {
          return result(state.text, state.reasoning, [], [], state.model, state.usage, "output_too_large");
        }
        if (input.onDraft && state.text.length + state.reasoning.length - state.flushed >= 80) {
          state.flushed = state.text.length + state.reasoning.length;
          await input.onDraft({ text: state.text, reasoning: state.reasoning });
        }
      }
    }
  } catch {
    return result(state.text, state.reasoning, [], [], state.model, state.usage, state.text || state.reasoning ? "provider_interrupted" : "provider_unavailable");
  }
  if (input.onDraft && (state.text || state.reasoning)) await input.onDraft({ text: state.text, reasoning: state.reasoning });
  const assembled = assembleCalls(state.tools);
  if (!state.text && !state.reasoning && assembled.calls.length === 0 && assembled.malformed.length === 0) {
    return result(state.text, state.reasoning, [], [], state.model, state.usage, "empty_response");
  }
  return result(state.text, state.reasoning, assembled.calls, assembled.malformed, state.model, state.usage, "ok");
}

function result(
  text: string,
  reasoning: string,
  calls: ModelCallResult["calls"],
  malformed: ModelCallResult["malformed"],
  model: string | null,
  usage: ModelCallResult["usage"],
  code: ModelCallResult["code"],
): ModelCallResult {
  return { text, reasoning, calls, malformed, model, usage, code };
}

function applyChunk(state: { text: string; reasoning: string; tools: Map<number, ToolDraft>; model: string | null; usage: ModelCallResult["usage"] }, chunk: z.infer<typeof chunkSchema>): ModelCallResult["code"] | null {
  if (chunk.error) return String(chunk.error.code) === "429" ? "provider_rate_limited" : "invalid_provider_output";
  const model = approvedModel(chunk.model);
  if (chunk.model && !model) return "invalid_provider_output";
  if (model) state.model = model;
  if (chunk.usage?.prompt_tokens !== undefined || chunk.usage?.completion_tokens !== undefined) {
    state.usage = {
      inputTokens: chunk.usage.prompt_tokens ?? state.usage?.inputTokens ?? 0,
      outputTokens: chunk.usage.completion_tokens ?? state.usage?.outputTokens ?? 0,
    };
  }
  for (const choice of chunk.choices ?? []) {
    const delta = choice.delta;
    if (delta?.content) state.text += delta.content;
    const reasoning = delta?.reasoning ?? delta?.reasoning_content;
    if (reasoning) state.reasoning += reasoning;
    delta?.tool_calls?.forEach((call, position) => {
      const index = call.index ?? position;
      const current = state.tools.get(index) ?? { id: "", name: "", arguments: "" };
      state.tools.set(index, {
        id: call.id || current.id,
        name: call.function?.name || current.name,
        arguments: current.arguments + (call.function?.arguments ?? ""),
      });
    });
    if (choice.message) {
      if (choice.message.content) state.text += choice.message.content;
      if (choice.message.reasoning) state.reasoning += choice.message.reasoning;
      choice.message.tool_calls?.forEach((call, index) => {
        state.tools.set(index, {
          id: call.id ?? "",
          name: call.function?.name ?? "",
          arguments: call.function?.arguments ?? "",
        });
      });
    }
  }
  return null;
}

function assembleCalls(tools: Map<number, ToolDraft>): Pick<ModelCallResult, "calls" | "malformed"> {
  const calls: ModelCallResult["calls"] = [];
  const malformed: ModelCallResult["malformed"] = [];
  const seen = new Set<string>();
  for (const [index, call] of [...tools.entries()].sort((left, right) => left[0] - right[0])) {
    const id = call.id.trim();
    const name = call.name.trim();
    const fallbackId = `malformed-${index}`;
    if (!id || !name || id.length > 200 || name.length > 100 || seen.has(id)) {
      malformed.push({ id: fallbackId, name: name || "unknown" });
      continue;
    }
    try {
      const input = jsonValueSchema.parse(JSON.parse(call.arguments || ""));
      seen.add(id);
      calls.push({ id, name, arguments: input });
    } catch {
      malformed.push({ id, name });
    }
  }
  return { calls, malformed };
}

function approvedModel(model: string | null | undefined): string | null {
  if (!model) return null;
  const parsed = modelNameSchema.safeParse(model);
  if (!parsed.success) return null;
  if (parsed.data !== freeModelId && !parsed.data.endsWith(":free")) return null;
  return parsed.data;
}

function wireMessage(message: ProviderMessage): JsonValue {
  if (message.role === "tool") return { role: "tool", tool_call_id: message.toolCallId, content: message.content };
  if (message.role === "assistant") {
    return {
      role: "assistant",
      content: message.content,
      ...(message.toolCalls.length > 0
        ? { tool_calls: message.toolCalls.map((call) => ({ id: call.id, type: "function", function: { name: call.name, arguments: call.arguments } })) }
        : {}),
    };
  }
  return { role: message.role, content: message.content };
}

async function* sseData(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
      const parts = buffer.split(/\r?\n\r?\n/);
      buffer = parts.pop() ?? "";
      for (const part of parts) {
        const data = part.split(/\r?\n/).flatMap((line) => line.startsWith("data:") ? [line.slice(5).trim()] : []).join("\n");
        if (data) yield data;
      }
      if (done) break;
    }
  } finally {
    reader.releaseLock();
  }
}
