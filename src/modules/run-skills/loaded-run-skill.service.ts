import { withTransaction, type DatabaseTransaction } from "@/lib/database.server";
import { getOwnedAgentRunInTransaction } from "@/modules/agent-runs/agent-run.service";
import { findLoadedRunSkill, listLoadedRunSkills, loadRunSkill } from "./loaded-run-skill.repository";

export interface LoadedRunSkillService {
  load(input: LoadedSkillInput): ReturnType<typeof recordLoadedSkill>;
}

export type LoadedSkillInput = {
  ownerId: string;
  runId: string;
  name: string;
  contentHash: string;
  instructions: string;
};

export function listLoadedSkillsInTransaction(transaction: DatabaseTransaction, runId: string) {
  return listLoadedRunSkills(transaction, runId);
}

export async function saveLoadedSkillInTransaction(
  transaction: DatabaseTransaction,
  input: Omit<LoadedSkillInput, "ownerId">,
) {
  const existing = await findLoadedRunSkill(transaction, input.runId, input.name, input.contentHash);
  if (existing) return existing;
  try {
    return await loadRunSkill(transaction, input);
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const raced = await findLoadedRunSkill(transaction, input.runId, input.name, input.contentHash);
    if (!raced) throw error;
    return raced;
  }
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

export function recordLoadedSkill(input: LoadedSkillInput) {
  return withTransaction(async (transaction) => {
    const run = await getOwnedAgentRunInTransaction(transaction, input.ownerId, input.runId);
    if (!run) throw new Error("Agent run not found.");
    return loadRunSkill(transaction, {
      runId: input.runId,
      name: input.name,
      contentHash: input.contentHash,
      instructions: input.instructions,
    });
  });
}
