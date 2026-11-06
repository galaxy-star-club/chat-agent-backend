import { jsonValueSchema, type JsonValue } from "@/contracts/json";
import type { Prisma } from "@/generated/prisma/client";

export function createWaitpoint(
  transaction: Prisma.TransactionClient,
  input: { runId: string; idempotencyKey: string; kind: string; payload: JsonValue },
) {
  const payload = jsonValueSchema.parse(input.payload) as Prisma.InputJsonValue;
  return transaction.waitpoint.create({ data: { ...input, payload } });
}

export function findWaitpoint(transaction: Prisma.TransactionClient, id: string) {
  return transaction.waitpoint.findUnique({ where: { id } });
}

export function resolveWaitpoint(
  transaction: Prisma.TransactionClient,
  id: string,
  resolution: JsonValue,
) {
  const parsed = jsonValueSchema.parse(resolution) as Prisma.InputJsonValue;
  return transaction.waitpoint.update({
    where: { id },
    data: { status: "resolved", resolution: parsed, resolvedAt: new Date() },
  });
}
