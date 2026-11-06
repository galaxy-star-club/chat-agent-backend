import { z } from "zod";
import { toolCallSchema, toolResultSchema } from "./tools";

const textBlock = (type: "text" | "thinking" | "reasoning") => z.strictObject({
  type: z.literal(type),
  text: z.string().min(1),
});

export const contentBlockSchema = z.discriminatedUnion("type", [
  textBlock("text"),
  textBlock("thinking"),
  textBlock("reasoning"),
  z.strictObject({ type: z.literal("tool_use"), call: toolCallSchema }),
  z.strictObject({ type: z.literal("tool_result"), result: toolResultSchema }),
  z.strictObject({
    type: z.literal("citation"),
    url: z.url().refine((url) => url.startsWith("http://") || url.startsWith("https://")),
    title: z.string().min(1).optional(),
  }),
  z.strictObject({
    type: z.literal("usage"),
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
  }),
]);

export const contentBlocksSchema = z.array(contentBlockSchema);

export type ContentBlock = z.infer<typeof contentBlockSchema>;
