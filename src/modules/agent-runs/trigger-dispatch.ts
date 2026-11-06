import { tasks } from "@trigger.dev/sdk";
import { z } from "zod";

export const agentRunTaskId = "agent-run";

export const agentRunPayloadSchema = z.strictObject({
  runId: z.uuid(),
});

export class DispatchNotConfiguredError extends Error {
  constructor() {
    super("Durable dispatch is not configured.");
    this.name = "DispatchNotConfiguredError";
  }
}

export function triggerDispatchConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.TRIGGER_SECRET_KEY?.trim());
}

export async function dispatchAdmittedRun(input: z.input<typeof agentRunPayloadSchema>): Promise<void> {
  if (!triggerDispatchConfigured()) throw new DispatchNotConfiguredError();
  const payload = agentRunPayloadSchema.parse(input);
  await tasks.trigger(agentRunTaskId, payload, { idempotencyKey: payload.runId });
}
