import { jsonValueSchema, type JsonValue } from "@/contracts/json";
import type { Prisma } from "@/generated/prisma/client";

export function findCreditLedgerEntry(
  transaction: Prisma.TransactionClient,
  accountId: string,
  idempotencyKey: string,
) {
  return transaction.creditLedgerEntry.findUnique({
    where: { accountId_idempotencyKey: { accountId, idempotencyKey } },
  });
}

export function createCreditLedgerEntry(
  transaction: Prisma.TransactionClient,
  input: {
    accountId: string;
    runId?: string;
    idempotencyKey: string;
    deltaBalance: bigint;
    deltaReserved: bigint;
    resultingBalance: bigint;
    resultingReserved: bigint;
    reason: string;
    metadata?: JsonValue;
  },
) {
  const metadata = input.metadata === undefined
    ? undefined
    : jsonValueSchema.parse(input.metadata) as Prisma.InputJsonValue;
  return transaction.creditLedgerEntry.create({ data: { ...input, metadata } });
}
