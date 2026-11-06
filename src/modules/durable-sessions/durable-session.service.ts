import type { JsonValue } from "@/contracts/json";
import { withTransaction } from "@/lib/database.server";
import { getOwnedAgentRunInTransaction } from "@/modules/agent-runs/agent-run.service";
import {
  createDurableSession,
  findDurableSession,
  updateDurableSessionState,
} from "./durable-session.repository";

export interface DurableSessionService {
  create(input: CreateDurableSessionInput): ReturnType<typeof recordDurableSession>;
  updateState(input: UpdateDurableSessionStateInput): ReturnType<typeof recordDurableSessionState>;
}

export type CreateDurableSessionInput = {
  ownerId: string;
  runId: string;
  idempotencyKey: string;
  provider: string;
  externalId: string;
  state: JsonValue;
  expiresAt?: Date;
};

export function recordDurableSession(input: CreateDurableSessionInput) {
  return withTransaction(async (transaction) => {
    const run = await getOwnedAgentRunInTransaction(transaction, input.ownerId, input.runId);
    if (!run) throw new Error("Agent run not found.");
    return createDurableSession(transaction, {
      runId: input.runId,
      idempotencyKey: input.idempotencyKey,
      provider: input.provider,
      externalId: input.externalId,
      state: input.state,
      expiresAt: input.expiresAt,
    });
  });
}

export type UpdateDurableSessionStateInput = { ownerId: string; id: string; state: JsonValue };

export function recordDurableSessionState(input: UpdateDurableSessionStateInput) {
  return withTransaction(async (transaction) => {
    const session = await findDurableSession(transaction, input.id);
    if (!session) throw new Error("Durable session not found.");
    const run = await getOwnedAgentRunInTransaction(transaction, input.ownerId, session.runId);
    if (!run) throw new Error("Durable session not found.");
    return updateDurableSessionState(transaction, input.id, input.state);
  });
}
