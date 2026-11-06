import { z } from "zod";
import { modelNameSchema, runErrorSchema } from "@/contracts/run";

export const executionSessionSchema = z.strictObject({
  version: z.literal(1),
  phase: z.enum(["ready", "requesting", "tools", "finalizing"]),
  turn: z.number().int().nonnegative(),
  closedBlocks: z.number().int().nonnegative(),
  assistantMessageId: z.uuid().nullable(),
  routedModel: modelNameSchema.nullable(),
  usage: z.strictObject({
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
  }).nullable(),
  outcome: z.strictObject({
    status: z.enum(["completed", "failed", "cancelled"]),
    code: runErrorSchema.shape.code.nullable(),
    message: runErrorSchema.shape.message.nullable(),
  }).nullable(),
}).refine((session) => session.phase !== "finalizing" || session.outcome !== null, {
  path: ["outcome"],
});

export type ExecutionSession = z.infer<typeof executionSessionSchema>;
export type RunOutcome = NonNullable<ExecutionSession["outcome"]>;

export function initialSession(): ExecutionSession {
  return {
    version: 1,
    phase: "ready",
    turn: 0,
    closedBlocks: 0,
    assistantMessageId: null,
    routedModel: null,
    usage: null,
    outcome: null,
  };
}

export const executionSessionKey = "execution";
export const executionProvider = "openrouter";
