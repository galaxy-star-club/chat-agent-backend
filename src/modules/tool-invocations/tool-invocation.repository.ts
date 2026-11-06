import { toolCallSchema, toolResultSchema, type ToolCall, type ToolResult } from "@/contracts/tools";
import type { Prisma } from "@/generated/prisma/client";

export function createToolInvocation(
  transaction: Prisma.TransactionClient,
  input: { runId: string; messageId?: string; call: ToolCall },
) {
  const call = toolCallSchema.parse(input.call);
  return transaction.toolInvocation.create({
    data: {
      runId: input.runId,
      messageId: input.messageId,
      callId: call.id,
      name: call.name,
      input: call.input as Prisma.InputJsonValue,
    },
  });
}

export function completeToolInvocation(
  transaction: Prisma.TransactionClient,
  runId: string,
  result: ToolResult,
) {
  const parsed = toolResultSchema.parse(result);
  return transaction.toolInvocation.update({
    where: { runId_callId: { runId, callId: parsed.toolCallId } },
    data: {
      status: parsed.status,
      result: parsed as Prisma.InputJsonValue,
      finishedAt: new Date(),
    },
  });
}
