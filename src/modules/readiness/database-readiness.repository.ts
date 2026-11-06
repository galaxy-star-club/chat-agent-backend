import { getPrisma } from "@/lib/database.server";

export async function readDatabaseReadiness(): Promise<void> {
  const prisma = getPrisma();
  if (!prisma) throw new Error("Database configuration is unavailable.");
  await prisma.$queryRaw`SELECT 1`;
}
