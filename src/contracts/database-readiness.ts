import { z } from "zod";

export const DATABASE_READINESS_CONTRACT_VERSION = "1.0.0";

export const databaseReadinessResponseSchema = z.strictObject({
  status: z.literal("ready"),
  dependency: z.literal("database"),
  contractVersion: z.literal(DATABASE_READINESS_CONTRACT_VERSION),
});

export type DatabaseReadinessResponse = z.infer<typeof databaseReadinessResponseSchema>;
