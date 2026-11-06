import type { Prisma } from "@/generated/prisma/client";

export function loadRunSkill(
  transaction: Prisma.TransactionClient,
  input: { runId: string; name: string; contentHash: string; instructions: string },
) {
  return transaction.loadedRunSkill.create({ data: input });
}
