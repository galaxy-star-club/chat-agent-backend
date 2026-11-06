import type { RunError } from "@/contracts/run";

export const runErrorMessages = {
  dispatch_failed: "The run could not be dispatched. Your message is saved. You can send again.",
  model_not_configured: "The free model is not configured. Your message is saved.",
  execution_not_configured: "Run execution is not configured. Your message is saved.",
  run_not_active: "This run is no longer the active run for the chat.",
  provider_rate_limited: "The model is rate limited. Your message is saved. You can send again later.",
  provider_unavailable: "The model could not be reached. Your message is saved. You can send again.",
  provider_interrupted: "The reply stopped early. Any saved reply is still in the chat. You can send again.",
  empty_response: "The model returned an empty reply. Your message is saved. You can send again.",
  invalid_provider_output: "The model returned an unusable reply. Your message is saved. You can send again.",
  output_too_large: "The model reply was too large to store. Any saved reply is still in the chat.",
  max_turns: "The run reached its turn limit. Any saved reply is still in the chat. You can send again.",
  stored_state_invalid: "The saved conversation could not be read. Your message is saved. You can send again.",
  tool_limit: "The model asked for too many tools. Any saved reply is still in the chat.",
} as const;

export type RunErrorCode = keyof typeof runErrorMessages;

export function runError(code: RunErrorCode): RunError {
  return { code, message: runErrorMessages[code] };
}
