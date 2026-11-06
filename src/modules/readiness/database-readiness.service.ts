import {
  DATABASE_READINESS_CONTRACT_VERSION,
  type DatabaseReadinessResponse,
} from "@/contracts/database-readiness";
import { getDatabaseUrl } from "@/lib/config";
import { readDatabaseReadiness } from "./database-readiness.repository";

export type DatabaseReadinessResult =
  | { status: "ready"; response: DatabaseReadinessResponse }
  | { status: "configuration-error" }
  | { status: "unavailable" };

export async function getDatabaseReadiness(): Promise<DatabaseReadinessResult> {
  if (!getDatabaseUrl()) return { status: "configuration-error" };

  try {
    await readDatabaseReadiness();
    return {
      status: "ready",
      response: {
        status: "ready",
        dependency: "database",
        contractVersion: DATABASE_READINESS_CONTRACT_VERSION,
      },
    };
  } catch {
    return { status: "unavailable" };
  }
}
