import { task } from "@trigger.dev/sdk";
import { withTransaction } from "@/lib/database.server";
import { agentRunPayloadSchema, agentRunTaskId } from "@/modules/agent-runs/trigger-dispatch";
import { getAgentRunInTransaction } from "@/modules/agent-runs/agent-run.service";
import { getMessageInTransaction } from "@/modules/messages/message.service";

export const agentRunTask = task({
  id: agentRunTaskId,
  run: async (payload: unknown) => {
    const input = agentRunPayloadSchema.parse(payload);
    return withTransaction(async (transaction) => {
      const run = await getAgentRunInTransaction(transaction, input.runId);
      if (!run || run.chatId !== input.chatId) throw new Error("Admitted run was not found.");
      const message = await getMessageInTransaction(transaction, input.messageId);
      if (!message || message.chatId !== input.chatId || message.runId !== input.runId) {
        throw new Error("Admitted message was not found.");
      }
      return { runId: run.id, status: run.status };
    });
  },
});
