import { withTransaction } from "@/lib/database.server";
import { getOwnedAgentRunInTransaction } from "@/modules/agent-runs/agent-run.service";
import { loadRunSkill } from "./loaded-run-skill.repository";

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
