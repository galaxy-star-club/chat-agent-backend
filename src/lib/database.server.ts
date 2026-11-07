import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Prisma } from "@/generated/prisma/client";
import { getRuntimeDatabaseUrl } from "./config";

let client: PrismaClient | undefined;

export type DatabaseTransaction = Prisma.TransactionClient;

export function getPrisma(): PrismaClient | null {
  const databaseUrl = getRuntimeDatabaseUrl();
  if (!databaseUrl) return null;

  client ??= new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
  return client;
}

export async function withTransaction<T>(work: (transaction: DatabaseTransaction) => Promise<T>): Promise<T> {
  const prisma = getPrisma();
  if (!prisma) throw new Error("Database configuration is unavailable.");
  return prisma.$transaction(work, { maxWait: 10_000, timeout: 20_000 });
}
