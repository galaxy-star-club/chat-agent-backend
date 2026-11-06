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

export function findToolInvocation(
  transaction: Prisma.TransactionClient,
  runId: string,
  callId: string,
) {
  return transaction.toolInvocation.findUnique({ where: { runId_callId: { runId, callId } } });
}

export function listToolInvocations(transaction: Prisma.TransactionClient, runId: string) {
  return transaction.toolInvocation.findMany({
    where: { runId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: 100,
  });
}

export function markToolInvocationRunning(
  transaction: Prisma.TransactionClient,
  runId: string,
  callId: string,
) {
  return transaction.toolInvocation.updateMany({
    where: { runId, callId, status: "pending" },
    data: { status: "running", startedAt: new Date() },
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
