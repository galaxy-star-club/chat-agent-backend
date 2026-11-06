import type { Prisma } from "@/generated/prisma/client";

export function loadRunSkill(
  transaction: Prisma.TransactionClient,
  input: { runId: string; name: string; contentHash: string; instructions: string },
) {
  return transaction.loadedRunSkill.create({ data: input });
}

export function findLoadedRunSkill(
  transaction: Prisma.TransactionClient,
  runId: string,
  name: string,
  contentHash: string,
) {
  return transaction.loadedRunSkill.findUnique({
    where: { runId_name_contentHash: { runId, name, contentHash } },
  });
}

export function listLoadedRunSkills(transaction: Prisma.TransactionClient, runId: string) {
  return transaction.loadedRunSkill.findMany({
    where: { runId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: 50,
  });
}
