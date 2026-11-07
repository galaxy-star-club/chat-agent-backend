import { chatTitleSchema } from "@/contracts/chats";

const maxTitleWords = 5;
const maxTitleLength = 48;

export function shortChatTitle(raw: string): string | null {
  const firstLine = raw.split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? "";
  let title = firstLine;
  for (let pass = 0; pass < 4; pass += 1) {
    const next = title.replace(/^["'`]+|["'`]+$/g, "").replace(/^[.?!]+|[.?!]+$/g, "").replace(/^title\s*:\s*/i, "").trim();
    if (next === title) break;
    title = next;
  }
  title = title.split(/\s+/).filter(Boolean).slice(0, maxTitleWords).join(" ").slice(0, maxTitleLength).trim();
  const parsed = chatTitleSchema.safeParse(title);
  return parsed.success ? parsed.data : null;
}

export function titleFromModelOutput(text: string, reasoning: string): string | null {
  const fromText = shortChatTitle(text);
  if (fromText) return fromText;
  const line = reasoning.split(/\r?\n/).map((item) => item.trim()).find(Boolean) ?? "";
  const words = line.split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > maxTitleWords) return null;
  return shortChatTitle(line);
}
