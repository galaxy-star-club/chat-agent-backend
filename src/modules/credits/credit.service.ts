import type { JsonValue } from "@/contracts/json";
import { withTransaction } from "@/lib/database.server";
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
  return withTransaction(async (transaction) => {
    if (input.runId) {
      const run = await getOwnedAgentRunInTransaction(transaction, input.ownerId, input.runId);
      if (!run) throw new Error("Agent run not found.");
    }
    const account = await findOrCreateCreditAccount(transaction, input.ownerId);
    const existing = await findCreditLedgerEntry(transaction, account.id, input.idempotencyKey);
    if (existing) return existing;

    const updated = await updateCreditBalances(
      transaction,
      account.id,
      input.deltaBalance,
      input.deltaReserved,
    );
    if (updated.balance < 0n || updated.reserved < 0n || updated.reserved > updated.balance) {
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
  });
}
