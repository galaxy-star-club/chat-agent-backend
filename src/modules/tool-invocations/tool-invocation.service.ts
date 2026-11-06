import type { ToolCall, ToolResult } from "@/contracts/tools";
import { withTransaction } from "@/lib/database.server";
import { getOwnedAgentRunInTransaction } from "@/modules/agent-runs/agent-run.service";
import { getMessageInTransaction } from "@/modules/messages/message.service";
import { completeToolInvocation, createToolInvocation } from "./tool-invocation.repository";

export interface ToolInvocationService {
  recordCall(input: RecordToolCallInput): ReturnType<typeof recordToolCall>;
  recordResult(input: RecordToolResultInput): ReturnType<typeof recordToolResult>;
}

export type RecordToolCallInput = {
  ownerId: string;
  runId: string;
  messageId?: string;
  call: ToolCall;
};

export function recordToolCall(input: RecordToolCallInput) {
  return withTransaction(async (transaction) => {
    const run = await getOwnedAgentRunInTransaction(transaction, input.ownerId, input.runId);
    if (!run) throw new Error("Agent run not found.");
    if (input.messageId) {
      const message = await getMessageInTransaction(transaction, input.messageId);
      if (!message || message.chatId !== run.chatId) throw new Error("Message not found.");
    }
    return createToolInvocation(transaction, {
      runId: input.runId,
      messageId: input.messageId,
      call: input.call,
    });
  });
}

export type RecordToolResultInput = { ownerId: string; runId: string; result: ToolResult };

export function recordToolResult(input: RecordToolResultInput) {
  return withTransaction(async (transaction) => {
    const run = await getOwnedAgentRunInTransaction(transaction, input.ownerId, input.runId);
    if (!run) throw new Error("Agent run not found.");
    return completeToolInvocation(transaction, input.runId, input.result);
  });
}
