import type { ToolCall, ToolResult } from "@/contracts/tools";
import { withTransaction } from "@/lib/database.server";
import { getOwnedAgentRunInTransaction } from "@/modules/agent-runs/agent-run.service";
import { getMessageInTransaction } from "@/modules/messages/message.service";
import type { DatabaseTransaction } from "@/lib/database.server";
import {
  completeToolInvocation,
  createToolInvocation,
  findToolInvocation,
  listToolInvocations,
  markToolInvocationRunning,
} from "./tool-invocation.repository";

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

export function listToolInvocationsInTransaction(transaction: DatabaseTransaction, runId: string) {
  return listToolInvocations(transaction, runId);
}

export function findToolInvocationInTransaction(
  transaction: DatabaseTransaction,
  runId: string,
  callId: string,
) {
  return findToolInvocation(transaction, runId, callId);
}

export function createToolInvocationInTransaction(
  transaction: DatabaseTransaction,
  input: { runId: string; messageId?: string; call: ToolCall },
) {
  return createToolInvocation(transaction, input);
}

export function markToolRunningInTransaction(
  transaction: DatabaseTransaction,
  runId: string,
  callId: string,
) {
  return markToolInvocationRunning(transaction, runId, callId);
}

export function completeToolInvocationInTransaction(
  transaction: DatabaseTransaction,
  runId: string,
  result: ToolResult,
) {
  return completeToolInvocation(transaction, runId, result);
}

export function recordToolResult(input: RecordToolResultInput) {
  return withTransaction(async (transaction) => {
    const run = await getOwnedAgentRunInTransaction(transaction, input.ownerId, input.runId);
    if (!run) throw new Error("Agent run not found.");
    return completeToolInvocation(transaction, input.runId, input.result);
  });
}
