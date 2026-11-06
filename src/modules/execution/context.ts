import { contentBlocksSchema, type ContentBlock } from "@/contracts/content";
import type { SkillSummary } from "./skills";
import { contextHistoryCharacterBudget } from "./execution-policy";

export type ContextMessage = {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: unknown;
};

export type ProviderMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string; toolCalls: Array<{ id: string; name: string; arguments: string }> }
  | { role: "tool"; toolCallId: string; content: string };

export function systemPrompt(catalog: SkillSummary[]): string {
  const skills = catalog.length === 0
    ? "No skills are installed."
    : catalog.map((skill) => `- ${skill.name}: ${skill.description}`).join("\n");
  return [
    "You are the assistant for this chat.",
    "Use a tool only when it is needed.",
    "Skill instructions are not included here. Call load_skill before following a skill, then read_skill_asset for a file in that skill.",
    "Available skills:",
    skills,
  ].join("\n");
}

export function selectContext(messages: ContextMessage[]): ContextMessage[] {
  const newest = messages.at(-1);
  if (!newest) return [];
  const selected = [newest];
  let used = textSize(newest.content);
  for (let index = messages.length - 2; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message) continue;
    const size = textSize(message.content);
    if (used >= contextHistoryCharacterBudget || used + size > contextHistoryCharacterBudget) break;
    selected.push(message);
    used += size;
  }
  const ordered = selected.toReversed();
  while (ordered[0]?.role === "tool") ordered.shift();
  return ordered;
}

export function toProviderMessages(messages: ContextMessage[]): ProviderMessage[] {
  const providerMessages: ProviderMessage[] = [];
  for (const message of messages) {
    const blocks = parseBlocks(message.content);
    if (message.role === "user") {
      const content = textOf(blocks);
      if (content) providerMessages.push({ role: "user", content });
    } else if (message.role === "assistant") {
      const content = textOf(blocks);
      const toolCalls = blocks.flatMap((block) => block.type === "tool_use"
        ? [{ id: block.call.id, name: block.call.name, arguments: JSON.stringify(block.call.input) }]
        : []);
      if (content || toolCalls.length > 0) providerMessages.push({ role: "assistant", content, toolCalls });
    } else if (message.role === "tool") {
      const result = blocks.find((block) => block.type === "tool_result");
      if (result?.type === "tool_result") {
        const content = result.result.status === "completed"
          ? JSON.stringify(result.result.output)
          : result.result.error.message;
        providerMessages.push({ role: "tool", toolCallId: result.result.toolCallId, content });
      }
    }
  }
  return providerMessages;
}

export function parseBlocks(content: unknown): ContentBlock[] {
  const parsed = contentBlocksSchema.safeParse(content);
  return parsed.success ? parsed.data : [];
}

export function draftBlocks(draft: { text: string; reasoning: string }): ContentBlock[] {
  return [
    ...(draft.reasoning ? [{ type: "reasoning" as const, text: draft.reasoning }] : []),
    ...(draft.text ? [{ type: "text" as const, text: draft.text }] : []),
  ];
}

export function withUsage(blocks: ContentBlock[], usage: { inputTokens: number; outputTokens: number } | null): ContentBlock[] {
  const rest = blocks.filter((block) => block.type !== "usage");
  return usage ? [...rest, { type: "usage", ...usage }] : rest;
}

function textOf(blocks: ContentBlock[]): string {
  return blocks.flatMap((block) => block.type === "text" ? [block.text] : []).join("\n\n");
}

function textSize(content: unknown): number {
  return parseBlocks(content).reduce((total, block) => {
    if (block.type === "text" || block.type === "thinking" || block.type === "reasoning") return total + block.text.length;
    if (block.type === "tool_result") {
      const output = block.result.status === "completed" ? JSON.stringify(block.result.output) : block.result.error.message;
      return total + output.length;
    }
    return total;
  }, 0);
}
