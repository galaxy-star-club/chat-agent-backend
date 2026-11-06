import { agentRunRecordSchema, runStatusSchema, type AgentRunRecord, type RunStatus } from "@/contracts/run";
import { withTransaction, type DatabaseTransaction } from "@/lib/database.server";
import {
  claimChatActiveRun,
  getOwnedChatInTransaction,
  releaseChatActiveRun,
} from "@/modules/chats/chat.service";
import {
  compareAndSetAgentRun,
  countOwnedRunsSince,
  createAgentRun,
  findAgentRun,
  findAgentRunByIdempotencyKey,
  findOwnedAgentRun,
  saveAgentRunProgress,
  type AgentRunOutcome,
} from "./agent-run.repository";
import { runError } from "./run-errors";
import { assertRunTransition, isTerminalRunStatus } from "./run-transitions";

export interface AgentRunService {
  start(input: StartAgentRunInput): ReturnType<typeof startAgentRun>;
  finish(input: FinishAgentRunInput): ReturnType<typeof finishAgentRun>;
}

export type StartAgentRunInput = {
  ownerId: string;
  chatId: string;
  idempotencyKey: string;
  traceId: string;
};

export function startAgentRun(input: StartAgentRunInput) {
  return withTransaction(async (transaction) => {
    const chat = await getOwnedChatInTransaction(transaction, input.ownerId, input.chatId);
    if (!chat) throw new Error("Chat not found.");

    const existing = await findAgentRunByIdempotencyKey(
      transaction,
      input.chatId,
      input.idempotencyKey,
    );
    if (existing) return existing;

    const run = await createAgentRun(transaction, {
      chatId: input.chatId,
      idempotencyKey: input.idempotencyKey,
      traceId: input.traceId,
    });
    const claimed = await claimChatActiveRun(transaction, input.chatId, run.id);
    if (claimed.count !== 1) throw new Error("Chat already has an active run.");
    return run;
  });
}

export type FinishAgentRunInput = {
  ownerId: string;
  chatId: string;
  runId: string;
  status: Extract<RunStatus, "completed" | "failed" | "cancelled">;
};

export function finishAgentRun(input: FinishAgentRunInput) {
  return withTransaction(async (transaction) => {
    const chat = await getOwnedChatInTransaction(transaction, input.ownerId, input.chatId);
    if (!chat || chat.activeRunId !== input.runId) throw new Error("Active run not found.");
    const current = await findAgentRun(transaction, input.runId);
    if (!current || current.chatId !== input.chatId) throw new Error("Active run not found.");
    const status = runStatusSchema.parse(current.status);
    if (status === input.status) return current;
    assertRunTransition(status, input.status);
    const changed = await compareAndSetAgentRun(transaction, input.runId, status, input.status, {
      finishedAt: new Date(),
    });
    if (changed.count !== 1) throw new Error("Active run not found.");
    await releaseChatActiveRun(transaction, input.chatId, input.runId);
    return findAgentRun(transaction, input.runId);
  });
}

export function getAgentRunInTransaction(transaction: DatabaseTransaction, id: string) {
  return findAgentRun(transaction, id);
}

export function findAgentRunByIdempotencyInTransaction(
  transaction: DatabaseTransaction,
  chatId: string,
  idempotencyKey: string,
) {
  return findAgentRunByIdempotencyKey(transaction, chatId, idempotencyKey);
}

export function countRecentOwnedRunsInTransaction(
  transaction: DatabaseTransaction,
  ownerId: string,
  since: Date,
) {
  return countOwnedRunsSince(transaction, ownerId, since);
}

export function createPendingRunInTransaction(
  transaction: DatabaseTransaction,
  input: { chatId: string; idempotencyKey: string; traceId: string },
) {
  return createAgentRun(transaction, input);
}

export async function markRunFailedInTransaction(transaction: DatabaseTransaction, runId: string) {
  const failure = runError("dispatch_failed");
  const changed = await compareAndSetAgentRun(transaction, runId, "pending", "failed", {
    finishedAt: new Date(),
    errorCode: failure.code,
    errorMessage: failure.message,
  });
  if (changed.count !== 1) return null;
  return findAgentRun(transaction, runId);
}

export function transitionAgentRunInTransaction(
  transaction: DatabaseTransaction,
  id: string,
  from: RunStatus,
  to: RunStatus,
  outcome: AgentRunOutcome = {},
) {
  assertRunTransition(from, to);
  return compareAndSetAgentRun(transaction, id, from, to, outcome);
}

export function saveRunProgressInTransaction(
  transaction: DatabaseTransaction,
  id: string,
  outcome: Pick<AgentRunOutcome, "requestedModel" | "routedModel" | "inputTokens" | "outputTokens">,
) {
  return saveAgentRunProgress(transaction, id, outcome);
}

export async function getOwnedAgentRunRecord(
  ownerId: string,
  chatId: string,
  runId: string,
): Promise<AgentRunRecord | null> {
  const run = await withTransaction(async (transaction) => {
    const chat = await getOwnedChatInTransaction(transaction, ownerId, chatId);
    if (!chat) return null;
    const found = await findAgentRun(transaction, runId);
    if (!found || found.chatId !== chatId) return null;
    return found;
  });
  if (!run) return null;
  return toAgentRunRecord(run);
}

export function toAgentRunRecord(run: {
  id: string;
  chatId: string;
  status: string;
  requestedModel: string | null;
  routedModel: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  errorCode: string | null;
  errorMessage: string | null;
  traceId: string;
}): AgentRunRecord {
  const usage = run.inputTokens !== null && run.outputTokens !== null
    ? { inputTokens: run.inputTokens, outputTokens: run.outputTokens }
    : null;
  const error = run.errorCode && run.errorMessage ? { code: run.errorCode, message: run.errorMessage } : null;
  return agentRunRecordSchema.parse({
    id: run.id,
    chatId: run.chatId,
    status: runStatusSchema.parse(run.status),
    requestedModel: run.requestedModel,
    routedModel: run.routedModel,
    usage,
    error,
    traceId: run.traceId,
  });
}

export { isTerminalRunStatus };

export function getOwnedAgentRunInTransaction(
  transaction: DatabaseTransaction,
  ownerId: string,
  id: string,
) {
  return findOwnedAgentRun(transaction, id, ownerId);
}
