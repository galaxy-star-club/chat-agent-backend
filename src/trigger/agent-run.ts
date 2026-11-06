import { task } from "@trigger.dev/sdk";
import { agentRunPayloadSchema, agentRunTaskId } from "@/modules/agent-runs/trigger-dispatch";
import { executeAdmittedRun } from "@/modules/execution/execute-run.service";

export const agentRunTask = task({
  id: agentRunTaskId,
  retry: { maxAttempts: 3, minTimeoutInMs: 1_000, maxTimeoutInMs: 10_000, factor: 2, randomize: false },
  run: async (payload: unknown) => {
    const input = agentRunPayloadSchema.parse(payload);
    return executeAdmittedRun(input.runId);
  },
});
