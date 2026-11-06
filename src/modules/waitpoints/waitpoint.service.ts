import type { JsonValue } from "@/contracts/json";
import { withTransaction } from "@/lib/database.server";
import { getOwnedAgentRunInTransaction } from "@/modules/agent-runs/agent-run.service";
import { createWaitpoint, findWaitpoint, resolveWaitpoint } from "./waitpoint.repository";

export interface WaitpointService {
  create(input: CreateWaitpointInput): ReturnType<typeof recordWaitpoint>;
  resolve(input: ResolveWaitpointInput): ReturnType<typeof recordWaitpointResolution>;
}

export type CreateWaitpointInput = {
  ownerId: string;
  runId: string;
  idempotencyKey: string;
  kind: string;
  payload: JsonValue;
};

export function recordWaitpoint(input: CreateWaitpointInput) {
  return withTransaction(async (transaction) => {
    const run = await getOwnedAgentRunInTransaction(transaction, input.ownerId, input.runId);
    if (!run) throw new Error("Agent run not found.");
    return createWaitpoint(transaction, {
      runId: input.runId,
      idempotencyKey: input.idempotencyKey,
      kind: input.kind,
      payload: input.payload,
    });
  });
}

export type ResolveWaitpointInput = { ownerId: string; id: string; resolution: JsonValue };

export function recordWaitpointResolution(input: ResolveWaitpointInput) {
  return withTransaction(async (transaction) => {
    const waitpoint = await findWaitpoint(transaction, input.id);
    if (!waitpoint) throw new Error("Waitpoint not found.");
    const run = await getOwnedAgentRunInTransaction(
      transaction,
      input.ownerId,
      waitpoint.runId,
    );
    if (!run) throw new Error("Waitpoint not found.");
    return resolveWaitpoint(transaction, input.id, input.resolution);
  });
}
