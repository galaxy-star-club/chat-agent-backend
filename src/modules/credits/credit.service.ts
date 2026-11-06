import type { JsonValue } from "@/contracts/json";
import { withTransaction, type DatabaseTransaction } from "@/lib/database.server";
import { initialCreditBalance } from "@/modules/admission/admission-policy";
import { getOwnedAgentRunInTransaction } from "@/modules/agent-runs/agent-run.service";
import { findOrCreateCreditAccount, updateCreditBalances } from "./credit-account.repository";
import { createCreditLedgerEntry, findCreditLedgerEntry } from "./credit-ledger-entry.repository";

export interface CreditService {
  apply(input: ApplyCreditChangeInput): ReturnType<typeof applyCreditChange>;
}

export type ApplyCreditChangeInput = {
  ownerId: string;
  runId?: string;
  idempotencyKey: string;
  deltaBalance: bigint;
  deltaReserved: bigint;
  reason: string;
  metadata?: JsonValue;
};

export function applyCreditChange(input: ApplyCreditChangeInput) {
  return withTransaction((transaction) => applyCreditChangeInTransaction(transaction, input));
}

export async function lockCreditAccountInTransaction(transaction: DatabaseTransaction, ownerId: string) {
  const account = await findOrCreateCreditAccount(transaction, ownerId, initialCreditBalance);
  return updateCreditBalances(transaction, account.id, BigInt(0), BigInt(0));
}

export async function applyCreditChangeInTransaction(
  transaction: DatabaseTransaction,
  input: ApplyCreditChangeInput,
) {
  if (input.runId) {
    const run = await getOwnedAgentRunInTransaction(transaction, input.ownerId, input.runId);
    if (!run) throw new Error("Agent run not found.");
  }
  const account = await findOrCreateCreditAccount(transaction, input.ownerId, initialCreditBalance);
  const existing = await findCreditLedgerEntry(transaction, account.id, input.idempotencyKey);
  if (existing) return existing;

  const updated = await updateCreditBalances(
    transaction,
    account.id,
    input.deltaBalance,
    input.deltaReserved,
  );
  if (updated.balance < BigInt(0) || updated.reserved < BigInt(0) || updated.reserved > updated.balance) {
    throw new Error("Credit balance invariant violated.");
  }

  return createCreditLedgerEntry(transaction, {
    accountId: account.id,
    runId: input.runId,
    idempotencyKey: input.idempotencyKey,
    deltaBalance: input.deltaBalance,
    deltaReserved: input.deltaReserved,
    resultingBalance: updated.balance,
    resultingReserved: updated.reserved,
    reason: input.reason,
    metadata: input.metadata,
  });
}

export async function settleFreeModelRunInTransaction(
  transaction: DatabaseTransaction,
  input: { ownerId: string; runId: string; metadata: JsonValue },
) {
  const account = await findOrCreateCreditAccount(transaction, input.ownerId, initialCreditBalance);
  const admission = await findCreditLedgerEntry(transaction, account.id, `admission:${input.runId}`);
  return applyCreditChangeInTransaction(transaction, {
    ownerId: input.ownerId,
    runId: input.runId,
    idempotencyKey: `settlement:${input.runId}`,
    deltaBalance: BigInt(0),
    deltaReserved: -(admission?.deltaReserved ?? BigInt(0)),
    reason: "free_model_settlement",
    metadata: input.metadata,
  });
}

export async function refundAdmissionReservationInTransaction(
  transaction: DatabaseTransaction,
  ownerId: string,
  runId: string,
) {
  const account = await findOrCreateCreditAccount(transaction, ownerId, initialCreditBalance);
  const admission = await findCreditLedgerEntry(transaction, account.id, `admission:${runId}`);
  if (!admission) return null;
  return applyCreditChangeInTransaction(transaction, {
    ownerId,
    runId,
    idempotencyKey: `admission-refund:${runId}`,
    deltaBalance: BigInt(0),
    deltaReserved: -admission.deltaReserved,
    reason: "admission_refund",
  });
}
