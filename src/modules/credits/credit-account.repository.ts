import type { Prisma } from "@/generated/prisma/client";

export function findOrCreateCreditAccount(transaction: Prisma.TransactionClient, ownerId: string) {
  return transaction.creditAccount.upsert({
    where: { ownerId },
    create: { ownerId },
    update: {},
  });
}

export function updateCreditBalances(
  transaction: Prisma.TransactionClient,
  id: string,
  deltaBalance: bigint,
  deltaReserved: bigint,
) {
  return transaction.creditAccount.update({
    where: { id },
    data: {
      balance: { increment: deltaBalance },
      reserved: { increment: deltaReserved },
    },
  });
}
