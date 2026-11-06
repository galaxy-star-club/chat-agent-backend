import { contentBlocksSchema } from "@/contracts/content";
import { runStatusSchema, type RunStatus } from "@/contracts/run";
import type { TraceContext } from "@/contracts/trace";
import { withTransaction, type DatabaseTransaction } from "@/lib/database.server";
import {
  countRecentOwnedRunsInTransaction,
  createPendingRunInTransaction,
  findAgentRunByIdempotencyInTransaction,
  getOwnedAgentRunInTransaction,
  markRunFailedInTransaction,
} from "@/modules/agent-runs/agent-run.service";
import { dispatchAdmittedRun, triggerDispatchConfigured, DispatchNotConfiguredError } from "@/modules/agent-runs/trigger-dispatch";
import { ChatNotFoundError, claimChatActiveRun, getOwnedChatInTransaction, releaseChatActiveRun } from "@/modules/chats/chat.service";
import {
  applyCreditChangeInTransaction,
  lockCreditAccountInTransaction,
  refundAdmissionReservationInTransaction,
} from "@/modules/credits/credit.service";
import {
  createUserMessageInTransaction,
  findOwnedMessageByClientRequestInTransaction,
} from "@/modules/messages/message.service";
import { admissionReservation, submissionWindowMs, submissionsPerMinute } from "./admission-policy";

export { DispatchNotConfiguredError };

export class ActiveRunError extends Error {
  constructor() {
    super("Chat already has an active run.");
    this.name = "ActiveRunError";
  }
}

export class IdempotencyConflictError extends Error {
  constructor() {
    super("Idempotency key was reused with different content.");
    this.name = "IdempotencyConflictError";
  }
}

export class RateLimitError extends Error {
  constructor() {
    super("Message rate limit exceeded.");
    this.name = "RateLimitError";
  }
}

export class InsufficientCreditError extends Error {
  constructor() {
    super("Credit balance is not enough for admission.");
    this.name = "InsufficientCreditError";
  }
}

export type MessageAdmission = {
  chatId: string;
  messageId: string;
  runId: string;
  status: RunStatus;
  traceId: string;
  replay: boolean;
};

type AdmitInput = {
  ownerId: string;
  chatId: string;
  idempotencyKey: string;
  text: string;
  trace: TraceContext;
};

export async function admitOwnedMessage(input: AdmitInput): Promise<MessageAdmission> {
  if (!triggerDispatchConfigured()) throw new DispatchNotConfiguredError();
  let admission: MessageAdmission;
  try {
    admission = await withTransaction((transaction) => admitInTransaction(transaction, input));
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    admission = await withTransaction((transaction) => replayAdmission(transaction, input));
  }
  if (admission.status !== "pending") return admission;
  try {
    await dispatchAdmittedRun({
      chatId: admission.chatId,
      messageId: admission.messageId,
      runId: admission.runId,
    });
    return admission;
  } catch {
    return failAdmittedRun({
      ownerId: input.ownerId,
      chatId: admission.chatId,
      messageId: admission.messageId,
      runId: admission.runId,
    });
  }
}

async function admitInTransaction(transaction: DatabaseTransaction, input: AdmitInput): Promise<MessageAdmission> {
  const chat = await getOwnedChatInTransaction(transaction, input.ownerId, input.chatId);
  if (!chat) throw new ChatNotFoundError();
  const existing = await findAgentRunByIdempotencyInTransaction(transaction, input.chatId, input.idempotencyKey);
  if (existing) return reconcileAdmission(transaction, existing, input.text);

  const account = await lockCreditAccountInTransaction(transaction, input.ownerId);
  const raced = await findAgentRunByIdempotencyInTransaction(transaction, input.chatId, input.idempotencyKey);
  if (raced) return reconcileAdmission(transaction, raced, input.text);

  const since = new Date(Date.now() - submissionWindowMs);
  const recent = await countRecentOwnedRunsInTransaction(transaction, input.ownerId, since);
  if (recent >= submissionsPerMinute) throw new RateLimitError();

  const lockedChat = await getOwnedChatInTransaction(transaction, input.ownerId, input.chatId);
  if (!lockedChat) throw new ChatNotFoundError();
  if (lockedChat.activeRunId) throw new ActiveRunError();

  const reservation = admissionReservation(account.balance - account.reserved);
  if (reservation === null) throw new InsufficientCreditError();

  const run = await createPendingRunInTransaction(transaction, {
    chatId: input.chatId,
    idempotencyKey: input.idempotencyKey,
    traceId: input.trace.traceId,
  });
  const message = await createUserMessageInTransaction(transaction, {
    ownerId: input.ownerId,
    chatId: input.chatId,
    runId: run.id,
    clientRequestId: input.idempotencyKey,
    role: "user",
    content: [{ type: "text", text: input.text }],
  });
  const claimed = await claimChatActiveRun(transaction, input.chatId, run.id);
  if (claimed.count !== 1) throw new ActiveRunError();
  await applyCreditChangeInTransaction(transaction, {
    ownerId: input.ownerId,
    runId: run.id,
    idempotencyKey: `admission:${run.id}`,
    deltaBalance: BigInt(0),
    deltaReserved: reservation,
    reason: "free_model_admission",
  });
  return admissionFrom(run, message.id, false);
}

async function replayAdmission(transaction: DatabaseTransaction, input: AdmitInput): Promise<MessageAdmission> {
  const chat = await getOwnedChatInTransaction(transaction, input.ownerId, input.chatId);
  if (!chat) throw new ChatNotFoundError();
  const run = await findAgentRunByIdempotencyInTransaction(transaction, input.chatId, input.idempotencyKey);
  if (!run) throw new Error("Admission conflict could not be recovered.");
  return reconcileAdmission(transaction, run, input.text);
}

async function reconcileAdmission(
  transaction: DatabaseTransaction,
  run: { id: string; chatId: string; idempotencyKey: string; status: string; traceId: string },
  text: string,
): Promise<MessageAdmission> {
  const message = await findOwnedMessageByClientRequestInTransaction(transaction, run.chatId, run.idempotencyKey);
  if (!message || message.runId !== run.id || storedText(message.content) !== text) throw new IdempotencyConflictError();
  return admissionFrom(run, message.id, true);
}

async function failAdmittedRun(input: {
  ownerId: string;
  chatId: string;
  messageId: string;
  runId: string;
}): Promise<MessageAdmission> {
  return withTransaction(async (transaction) => {
    const run = await getOwnedAgentRunInTransaction(transaction, input.ownerId, input.runId);
    if (!run || run.chatId !== input.chatId) throw new Error("Agent run not found.");
    if (run.status !== "pending") return admissionFrom(run, input.messageId, true);
    await refundAdmissionReservationInTransaction(transaction, input.ownerId, input.runId);
    const failed = await markRunFailedInTransaction(transaction, input.runId);
    await releaseChatActiveRun(transaction, input.chatId, input.runId);
    return admissionFrom(failed, input.messageId, false);
  });
}

function admissionFrom(
  run: { id: string; chatId: string; status: string; traceId: string },
  messageId: string,
  replay: boolean,
): MessageAdmission {
  return {
    chatId: run.chatId,
    messageId,
    runId: run.id,
    status: runStatusSchema.parse(run.status),
    traceId: run.traceId,
    replay,
  };
}

function storedText(content: unknown): string | null {
  const parsed = contentBlocksSchema.safeParse(content);
  if (!parsed.success || parsed.data.length !== 1) return null;
  const block = parsed.data[0];
  return block?.type === "text" ? block.text : null;
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}
