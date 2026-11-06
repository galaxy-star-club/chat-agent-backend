/** Latest messages read for one model call. Matches the API's default page size. */
export const contextMessageLimit = 50;

/**
 * Older messages are omitted once this many characters are already included.
 * The newest message is always included, bounded by the admission size limit.
 */
export const contextHistoryCharacterBudget = 100_000;

/** Tool calls accepted from one model response. Further calls are recorded as failed and not executed. */
export const maxToolCallsPerTurn = 8;

/** One provider HTTP call. This is not a stale-lock recovery policy. */
export const providerTimeoutMs = 60_000;

export const maxSkillBytes = 64 * 1024;
export const maxSkillAssetBytes = 32 * 1024;
export const maxStoredTokens = 2_147_483_647;
