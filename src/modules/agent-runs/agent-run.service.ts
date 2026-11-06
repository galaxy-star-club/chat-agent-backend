import type { RunStatus } from "@/contracts/run";
import { withTransaction, type DatabaseTransaction } from "@/lib/database.server";
import {
  claimChatActiveRun,
  getOwnedChatInTransaction,
  releaseChatActiveRun,
} from "@/modules/chats/chat.service";
import {
  createAgentRun,
  findAgentRun,
  findAgentRunByIdempotencyKey,
  findOwnedAgentRun,
  updateAgentRunStatus,
} from "./agent-run.repository";

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
    const run = await updateAgentRunStatus(transaction, input.runId, input.status, {
      finishedAt: new Date(),
    });
    await releaseChatActiveRun(transaction, input.chatId, input.runId);
    return run;
  });
}

export function getAgentRunInTransaction(transaction: DatabaseTransaction, id: string) {
  return findAgentRun(transaction, id);
}

export function getOwnedAgentRunInTransaction(
  transaction: DatabaseTransaction,
  ownerId: string,
  id: string,
) {
  return findOwnedAgentRun(transaction, id, ownerId);
}
