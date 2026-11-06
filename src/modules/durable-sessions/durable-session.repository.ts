import { jsonValueSchema, type JsonValue } from "@/contracts/json";
import type { Prisma } from "@/generated/prisma/client";

export function createDurableSession(
  transaction: Prisma.TransactionClient,
  input: {
    runId: string;
    idempotencyKey: string;
    provider: string;
    externalId: string;
    state: JsonValue;
    expiresAt?: Date;
  },
) {
  const state = jsonValueSchema.parse(input.state) as Prisma.InputJsonValue;
  return transaction.durableSession.create({ data: { ...input, state } });
}

export function findDurableSession(transaction: Prisma.TransactionClient, id: string) {
  return transaction.durableSession.findUnique({ where: { id } });
}

export function findDurableSessionByKey(
  transaction: Prisma.TransactionClient,
  runId: string,
  idempotencyKey: string,
) {
  return transaction.durableSession.findUnique({
    where: { runId_idempotencyKey: { runId, idempotencyKey } },
  });
}

export function updateDurableSessionState(
  transaction: Prisma.TransactionClient,
  id: string,
  state: JsonValue,
) {
  const parsed = jsonValueSchema.parse(state) as Prisma.InputJsonValue;
  return transaction.durableSession.update({ where: { id }, data: { state: parsed } });
}
