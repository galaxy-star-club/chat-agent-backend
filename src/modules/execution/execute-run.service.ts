import { contentBlocksSchema, type ContentBlock } from "@/contracts/content";
import type { JsonValue } from "@/contracts/json";
import { messageRoleSchema } from "@/contracts/messages";
import { runStatusSchema, type MessageStatus, type RunStatus } from "@/contracts/run";
import { toolCallSchema, type ToolResult } from "@/contracts/tools";
import { getMaxModelTurns, getOpenRouterConfig } from "@/lib/config";
import { withTransaction, type DatabaseTransaction } from "@/lib/database.server";
import { logRun } from "@/lib/logger";
import {
  getAgentRunInTransaction,
  isTerminalRunStatus,
  saveRunProgressInTransaction,
  transitionAgentRunInTransaction,
} from "@/modules/agent-runs/agent-run.service";
import { runError, type RunErrorCode } from "@/modules/agent-runs/run-errors";
import { shortChatTitle } from "@/modules/chats/chat-title";
import { getChatInTransaction, releaseChatActiveRun, saveChatTitleIfEmptyInTransaction } from "@/modules/chats/chat.service";
import { refundAdmissionReservationInTransaction, settleFreeModelRunInTransaction } from "@/modules/credits/credit.service";
import {
  createDurableSessionInTransaction,
  findDurableSessionByKeyInTransaction,
  updateDurableSessionStateInTransaction,
} from "@/modules/durable-sessions/durable-session.service";
import {
  createMessageInTransaction,
  findOwnedMessageByClientRequestInTransaction,
  getMessageInTransaction,
  listRecentMessagesInTransaction,
  updateMessageInTransaction,
} from "@/modules/messages/message.service";
import { listLoadedSkillsInTransaction, saveLoadedSkillInTransaction } from "@/modules/run-skills/loaded-run-skill.service";
import {
  completeToolInvocationInTransaction,
  createToolInvocationInTransaction,
  findToolInvocationInTransaction,
  listToolInvocationsInTransaction,
  markToolRunningInTransaction,
} from "@/modules/tool-invocations/tool-invocation.service";
import { draftBlocks, parseBlocks, selectContext, systemPrompt, toProviderMessages, withUsage, type ContextMessage } from "./context";
import { contextMessageLimit, maxStoredTokens, maxToolCallsPerTurn } from "./execution-policy";
import { executionProvider, executionSessionKey, executionSessionSchema, initialSession, type ExecutionSession, type RunOutcome } from "./execution-session";
import { streamFreeModel, type ModelCallResult } from "./openrouter.provider";
import { failureFromTool, providerTools, skillCatalog, toolByName, toolFailure, type ToolFailureCode } from "./tool-registry";

type Scope = { runId: string; chatId: string; ownerId: string; traceId: string };
type Loaded = { scope: Scope; status: RunStatus; eligible: boolean };

export async function executeAdmittedRun(runId: string): Promise<{ runId: string; status: RunStatus }> {
  const loaded = await withTransaction((transaction) => loadRun(transaction, runId));
  if (!loaded) throw new Error("Admitted run was not found.");
  const { scope } = loaded;
  try {
    if (isTerminalRunStatus(loaded.status) || !loaded.eligible) {
      const outcome = loaded.eligible || isTerminalRunStatus(loaded.status) ? null : failed("run_not_active");
      await finalize(scope, outcome);
      return { runId, status: outcome?.status ?? loaded.status };
    }
    const turns = getMaxModelTurns();
    const model = getOpenRouterConfig();
    if (turns === null || !model) {
      const outcome = failed(turns === null ? "execution_not_configured" : "model_not_configured");
      await finalize(scope, outcome);
      return { runId, status: outcome.status };
    }
    const started = await ensureRunning(scope, model.model);
    if (isTerminalRunStatus(started)) {
      await finalize(scope, null);
      return { runId, status: started };
    }
    await nameUntitledChat(scope);
    logRun("info", "agent_run_started", scope.traceId, { runId, model: model.model });
    const catalog = await skillCatalog();
    for (let guard = 0; guard < turns + 2; guard += 1) {
      const snapshot = await readRun(scope.runId);
      if (!snapshot || isTerminalRunStatus(snapshot)) {
        await finalize(scope, null);
        return { runId, status: snapshot ?? "failed" };
      }
      const session = await ensureSession(scope);
      if (!session) {
        const outcome = failed("stored_state_invalid");
        await finalize(scope, outcome);
        return { runId, status: outcome.status };
      }
      if (session.phase === "finalizing" && session.outcome) {
        await finalize(scope, session.outcome);
        return { runId, status: session.outcome.status };
      }
      if (session.phase === "requesting") {
        const outcome = failed("provider_interrupted");
        await finalize(scope, outcome);
        return { runId, status: outcome.status };
      }
      if (session.phase === "tools") {
        await executeTools(scope, catalog);
        continue;
      }
      if (session.turn >= turns) {
        const outcome = failed("max_turns");
        await finalize(scope, outcome);
        return { runId, status: outcome.status };
      }
      const outcome = await requestModelTurn(scope, session, catalog, model.apiKey);
      if (outcome) {
        await finalize(scope, outcome);
        logRun(outcome.status === "completed" ? "info" : "error", "agent_run_finished", scope.traceId, { runId, status: outcome.status, code: outcome.code });
        return { runId, status: outcome.status };
      }
    }
    const outcome = failed("max_turns");
    await finalize(scope, outcome);
    return { runId, status: outcome.status };
  } catch (error) {
    logRun("error", "agent_run_failed", scope.traceId, { runId, name: error instanceof Error ? error.name : "Error" });
    throw error;
  }
}

async function nameUntitledChat(scope: Scope): Promise<void> {
  try {
    const source = await withTransaction(async (transaction) => {
      const chat = await getChatInTransaction(transaction, scope.chatId);
      if (!chat || chat.title?.trim()) return null;
      const history = await contextFrom(transaction, scope.chatId);
      const firstUser = history?.find((message) => message.role === "user");
      const text = firstUser ? plainUserText(firstUser.content) : "";
      return text ? text.slice(0, 2_000) : null;
    });
    if (!source) return;
    const title = shortChatTitle(source);
    if (!title) {
      logRun("error", "agent_chat_title", scope.traceId, { runId: scope.runId, code: "invalid_source", titled: false });
      return;
    }
    await withTransaction((transaction) => saveChatTitleIfEmptyInTransaction(transaction, scope.chatId, title));
    logRun("info", "agent_chat_title", scope.traceId, { runId: scope.runId, code: "from_message", titled: true });
  } catch (error) {
    logRun("error", "agent_chat_title", scope.traceId, { runId: scope.runId, name: error instanceof Error ? error.name : "Error" });
  }
}

function plainUserText(content: unknown): string {
  return parseBlocks(content).flatMap((block) => block.type === "text" ? [block.text] : []).join("\n").trim();
}

async function loadRun(transaction: DatabaseTransaction, runId: string): Promise<Loaded | null> {
  const run = await getAgentRunInTransaction(transaction, runId);
  if (!run) return null;
  const chat = await getChatInTransaction(transaction, run.chatId);
  if (!chat) return null;
  const status = runStatusSchema.parse(run.status);
  return {
    scope: { runId: run.id, chatId: chat.id, ownerId: chat.ownerId, traceId: run.traceId },
    status,
    eligible: chat.activeRunId === run.id && (status === "pending" || status === "running" || status === "waiting"),
  };
}

async function ensureRunning(scope: Scope, model: string): Promise<RunStatus> {
  return withTransaction(async (transaction) => {
    const run = await getAgentRunInTransaction(transaction, scope.runId);
    if (!run) return "failed";
    const status = runStatusSchema.parse(run.status);
    if (status !== "pending") return status;
    const changed = await transitionAgentRunInTransaction(transaction, scope.runId, "pending", "running", {
      startedAt: new Date(),
      requestedModel: model,
    });
    if (changed.count === 1) return "running";
    const current = await getAgentRunInTransaction(transaction, scope.runId);
    return current ? runStatusSchema.parse(current.status) : "failed";
  });
}

async function requestModelTurn(scope: Scope, session: ExecutionSession, catalog: Awaited<ReturnType<typeof skillCatalog>>, apiKey: string): Promise<RunOutcome | null> {
  const prepared = await withTransaction(async (transaction) => {
    const run = await getAgentRunInTransaction(transaction, scope.runId);
    if (!run) return null;
    const status = runStatusSchema.parse(run.status);
    if (status === "waiting") {
      const changed = await transitionAgentRunInTransaction(transaction, scope.runId, "waiting", "running");
      if (changed.count !== 1) return null;
    }
    const message = await ensureAssistantMessage(transaction, scope);
    const blocks = parseBlocks(message.content).filter((block) => block.type !== "usage");
    await updateMessageInTransaction(transaction, message.id, { content: blocks, status: "streaming" });
    const next: ExecutionSession = { ...session, phase: "requesting", assistantMessageId: message.id, closedBlocks: blocks.length };
    await saveSession(transaction, scope, next);
    const history = await contextFrom(transaction, scope.chatId);
    return { session: next, history };
  });
  if (!prepared) return failed("stored_state_invalid");
  if (!prepared.history) return failed("stored_state_invalid");
  if (!prepared.history.some((message) => message.role === "user")) return failed("stored_state_invalid");

  const result = await streamFreeModel({
    apiKey,
    messages: [{ role: "system", content: systemPrompt(catalog) }, ...toProviderMessages(selectContext(prepared.history))],
    tools: providerTools(),
    onDraft: async (draft) => {
      await withTransaction((transaction) => writeDraft(transaction, scope, prepared.session.closedBlocks, draft));
    },
  });
  return commitModelResult(scope, prepared.session, result);
}

async function commitModelResult(scope: Scope, session: ExecutionSession, result: ModelCallResult): Promise<RunOutcome | null> {
  const usage = combineUsage(session.usage, result.usage);
  const routedModel = result.model ?? session.routedModel;
  if (usage === "overflow" || result.code !== "ok") {
    const outcome = failed(usage === "overflow" || result.code === "ok" ? "output_too_large" : result.code);
    await withTransaction(async (transaction) => {
      await saveRunProgressInTransaction(transaction, scope.runId, {
        routedModel,
        inputTokens: usage === "overflow" ? session.usage?.inputTokens ?? null : usage?.inputTokens ?? null,
        outputTokens: usage === "overflow" ? session.usage?.outputTokens ?? null : usage?.outputTokens ?? null,
      });
      if (result.code === "invalid_provider_output") await writeDraft(transaction, scope, session.closedBlocks, { text: "", reasoning: "" });
      else await writeDraft(transaction, scope, session.closedBlocks, { text: result.text, reasoning: result.reasoning });
      await saveSession(transaction, scope, { ...session, phase: "finalizing", routedModel, usage: usage === "overflow" ? session.usage : usage, outcome });
    });
    return outcome;
  }

  const accepted = result.calls.slice(0, maxToolCallsPerTurn);
  const overflow = result.calls.slice(maxToolCallsPerTurn).map((call) => ({ id: call.id, name: call.name, code: "tool_limit" as const }));
  const rejected = [
    ...result.malformed.map((call) => ({ ...call, code: "malformed_tool_call" as const })),
    ...overflow,
  ];
  await withTransaction(async (transaction) => {
    const prefix = await prefixBlocks(transaction, scope, session.closedBlocks);
    const blocks: ContentBlock[] = [
      ...prefix,
      ...draftBlocks({ text: result.text, reasoning: result.reasoning }),
      ...accepted.map((call) => ({ type: "tool_use" as const, call: { id: call.id, name: call.name, input: call.arguments } })),
      ...rejected.map((call) => ({ type: "tool_use" as const, call: { id: safeCallId(call.id), name: safeToolName(call.name), input: null } })),
    ];
    const message = await ensureAssistantMessage(transaction, scope);
    await updateMessageInTransaction(transaction, message.id, { content: blocks, status: "streaming" });
    for (const call of accepted) {
      await ensureInvocation(transaction, scope, message.id, { id: call.id, name: call.name, input: call.arguments });
    }
    for (const call of rejected) {
      const toolCall = { id: safeCallId(call.id), name: safeToolName(call.name), input: null };
      await ensureInvocation(transaction, scope, message.id, toolCall);
      await failInvocation(transaction, scope, message.id, toolCall.id, call.code === "tool_limit" ? "tool_limit" : "invalid_tool_input");
    }
    const finished = accepted.length === 0 && rejected.length === 0;
    const outcome = finished ? { status: "completed" as const, code: null, message: null } : null;
    await saveRunProgressInTransaction(transaction, scope.runId, { routedModel, inputTokens: usage?.inputTokens ?? null, outputTokens: usage?.outputTokens ?? null });
    await saveSession(transaction, scope, {
      ...session,
      phase: accepted.length > 0 ? "tools" : finished ? "finalizing" : "ready",
      turn: session.turn + 1,
      closedBlocks: blocks.length,
      assistantMessageId: message.id,
      routedModel,
      usage,
      outcome,
    });
  });
  if (accepted.length === 0 && rejected.length === 0) return { status: "completed", code: null, message: null };
  return null;
}

async function executeTools(scope: Scope, catalog: Awaited<ReturnType<typeof skillCatalog>>): Promise<void> {
  const pending = await withTransaction((transaction) => listToolInvocationsInTransaction(transaction, scope.runId));
  for (const invocation of pending) {
    if (invocation.status === "completed" || invocation.status === "failed" || invocation.status === "cancelled") {
      await ensureToolMessage(scope, invocation.callId, invocation.messageId, storedResult(invocation.result, invocation.callId));
      continue;
    }
    const tool = toolByName(invocation.name);
    const loadedSkills = await withTransaction((transaction) => listLoadedSkillsInTransaction(transaction, scope.runId));
    const context = {
      catalog,
      loadedSkills: loadedSkills.map((skill) => ({ name: skill.name, contentHash: skill.contentHash, instructions: skill.instructions })),
    };
    if (!tool) {
      await failInvocationDirect(scope, invocation.messageId, invocation.callId, "unknown_tool");
      continue;
    }
    if (tool.estimateCredits(invocation.input) > BigInt(0)) {
      await failInvocationDirect(scope, invocation.messageId, invocation.callId, "credit_policy_missing");
      continue;
    }
    if (!tool.eligible(invocation.input, context)) {
      await failInvocationDirect(scope, invocation.messageId, invocation.callId, "not_eligible");
      continue;
    }
    if (invocation.status === "running" && !tool.idempotent) {
      await failInvocationDirect(scope, invocation.messageId, invocation.callId, "tool_interrupted");
      continue;
    }
    if (invocation.status === "pending") {
      const claimed = await withTransaction((transaction) => markToolRunningInTransaction(transaction, scope.runId, invocation.callId));
      if (claimed.count !== 1) continue;
    }
    try {
      const output = await tool.execute(invocation.input, context);
      const effect = tool.effect(output);
      await withTransaction(async (transaction) => {
        if (effect) {
          await saveLoadedSkillInTransaction(transaction, {
            runId: scope.runId,
            name: effect.name,
            contentHash: effect.contentHash,
            instructions: effect.instructions,
          });
        }
        const result: ToolResult = { toolCallId: invocation.callId, status: "completed", output };
        await completeToolInvocationInTransaction(transaction, scope.runId, result);
        await createToolMessage(transaction, scope, invocation.messageId, result);
      });
    } catch (error) {
      const failure = failureFromTool(error);
      await failInvocationDirect(scope, invocation.messageId, invocation.callId, failure.code);
    }
  }
  await withTransaction(async (transaction) => {
    const session = await readSession(transaction, scope.runId);
    if (session) await saveSession(transaction, scope, { ...session, phase: "ready" });
  });
}

async function finalize(scope: Scope, outcome: RunOutcome | null): Promise<void> {
  await withTransaction(async (transaction) => {
    const run = await getAgentRunInTransaction(transaction, scope.runId);
    const chat = await getChatInTransaction(transaction, scope.chatId);
    if (!run || !chat || chat.ownerId !== scope.ownerId || run.chatId !== chat.id) return;
    let status = runStatusSchema.parse(run.status);
    if (!isTerminalRunStatus(status)) {
      if (!outcome) throw new Error("Missing run outcome.");
      const changed = await transitionAgentRunInTransaction(transaction, scope.runId, status, outcome.status, {
        finishedAt: new Date(),
        errorCode: outcome.code,
        errorMessage: outcome.message,
      });
      if (changed.count === 1) {
        status = outcome.status;
        await closeAssistant(transaction, scope, messageStatusFor(status), run.inputTokens, run.outputTokens);
      } else {
        const current = await getAgentRunInTransaction(transaction, scope.runId);
        if (!current) return;
        status = runStatusSchema.parse(current.status);
      }
    }
    if (!isTerminalRunStatus(status)) return;
    await releaseChatActiveRun(transaction, scope.chatId, scope.runId);
    const saved = await getAgentRunInTransaction(transaction, scope.runId);
    const metadata: JsonValue = {
      requestedModel: saved?.requestedModel ?? null,
      routedModel: saved?.routedModel ?? null,
      inputTokens: saved?.inputTokens ?? null,
      outputTokens: saved?.outputTokens ?? null,
      applicationCredits: 0,
    };
    if (status === "completed") await settleFreeModelRunInTransaction(transaction, { ownerId: scope.ownerId, runId: scope.runId, metadata });
    else await refundAdmissionReservationInTransaction(transaction, scope.ownerId, scope.runId);
  });
}

async function ensureSession(scope: Scope): Promise<ExecutionSession | null> {
  return withTransaction(async (transaction) => {
    const existing = await readSession(transaction, scope.runId);
    if (existing) return existing;
    const created = initialSession();
    try {
      await createDurableSessionInTransaction(transaction, {
        runId: scope.runId,
        idempotencyKey: executionSessionKey,
        provider: executionProvider,
        externalId: scope.runId,
        state: created,
      });
      return created;
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      return readSession(transaction, scope.runId);
    }
  });
}

async function readSession(transaction: DatabaseTransaction, runId: string): Promise<ExecutionSession | null> {
  const existing = await findDurableSessionByKeyInTransaction(transaction, runId, executionSessionKey);
  if (!existing) return null;
  const parsed = executionSessionSchema.safeParse(existing.state);
  return parsed.success ? parsed.data : null;
}

async function saveSession(transaction: DatabaseTransaction, scope: Scope, session: ExecutionSession): Promise<void> {
  const parsed = executionSessionSchema.parse(session);
  const existing = await findDurableSessionByKeyInTransaction(transaction, scope.runId, executionSessionKey);
  if (!existing) {
    await createDurableSessionInTransaction(transaction, {
      runId: scope.runId,
      idempotencyKey: executionSessionKey,
      provider: executionProvider,
      externalId: scope.runId,
      state: parsed,
    });
    return;
  }
  await updateDurableSessionStateInTransaction(transaction, existing.id, parsed);
}

async function ensureAssistantMessage(transaction: DatabaseTransaction, scope: Scope) {
  const clientRequestId = `assistant:${scope.runId}`;
  const existing = await findOwnedMessageByClientRequestInTransaction(transaction, scope.chatId, clientRequestId);
  if (existing) return existing;
  try {
    return await createMessageInTransaction(transaction, {
      ownerId: scope.ownerId,
      chatId: scope.chatId,
      runId: scope.runId,
      clientRequestId,
      role: "assistant",
      status: "streaming",
      content: [],
    });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const raced = await findOwnedMessageByClientRequestInTransaction(transaction, scope.chatId, clientRequestId);
    if (!raced) throw error;
    return raced;
  }
}

async function closeAssistant(transaction: DatabaseTransaction, scope: Scope, status: MessageStatus, inputTokens: number | null, outputTokens: number | null) {
  const message = await ensureAssistantMessage(transaction, scope);
  const usage = inputTokens !== null && outputTokens !== null ? { inputTokens, outputTokens } : null;
  await updateMessageInTransaction(transaction, message.id, { content: withUsage(parseBlocks(message.content), usage), status });
}

async function writeDraft(transaction: DatabaseTransaction, scope: Scope, closedBlocks: number, draft: { text: string; reasoning: string }) {
  const message = await ensureAssistantMessage(transaction, scope);
  const prefix = parseBlocks(message.content).slice(0, closedBlocks);
  return updateMessageInTransaction(transaction, message.id, { content: [...prefix, ...draftBlocks(draft)], status: "streaming" });
}


async function prefixBlocks(transaction: DatabaseTransaction, scope: Scope, closedBlocks: number): Promise<ContentBlock[]> {
  const message = await ensureAssistantMessage(transaction, scope);
  return parseBlocks(message.content).slice(0, closedBlocks);
}

async function contextFrom(transaction: DatabaseTransaction, chatId: string): Promise<ContextMessage[] | null> {
  const messages = await listRecentMessagesInTransaction(transaction, chatId, contextMessageLimit);
  const chronological: ContextMessage[] = [];
  for (const message of messages.toReversed()) {
    const role = messageRoleSchema.safeParse(message.role);
    if (!role.success || role.data === "system") continue;
    if (!contentBlocksSchema.safeParse(message.content).success) return null;
    chronological.push({ id: message.id, role: role.data, content: message.content });
  }
  return chronological;
}

async function ensureInvocation(transaction: DatabaseTransaction, scope: Scope, messageId: string, call: { id: string; name: string; input: JsonValue }) {
  const parsed = toolCallSchema.parse(call);
  const existing = await findToolInvocationInTransaction(transaction, scope.runId, parsed.id);
  if (existing) return existing;
  try {
    return await createToolInvocationInTransaction(transaction, { runId: scope.runId, messageId, call: parsed });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    return findToolInvocationInTransaction(transaction, scope.runId, parsed.id);
  }
}

async function failInvocation(transaction: DatabaseTransaction, scope: Scope, messageId: string | null, callId: string, code: ToolFailureCode) {
  const failure = toolFailure(code);
  const result: ToolResult = { toolCallId: callId, status: "failed", error: failure };
  await completeToolInvocationInTransaction(transaction, scope.runId, result);
  await createToolMessage(transaction, scope, messageId, result);
}

async function failInvocationDirect(scope: Scope, messageId: string | null, callId: string, code: ToolFailureCode) {
  await withTransaction((transaction) => failInvocation(transaction, scope, messageId, callId, code));
}

async function ensureToolMessage(scope: Scope, callId: string, messageId: string | null, result: ToolResult | null) {
  if (!result) return;
  await withTransaction((transaction) => createToolMessage(transaction, scope, messageId, result));
}

async function createToolMessage(transaction: DatabaseTransaction, scope: Scope, messageId: string | null, result: ToolResult) {
  const clientRequestId = `tool:${scope.runId}:${result.toolCallId}`;
  const existing = await findOwnedMessageByClientRequestInTransaction(transaction, scope.chatId, clientRequestId);
  if (existing) return existing;
  if (messageId) {
    const parent = await getMessageInTransaction(transaction, messageId);
    if (!parent || parent.chatId !== scope.chatId) return null;
  }
  try {
    return await createMessageInTransaction(transaction, {
      ownerId: scope.ownerId,
      chatId: scope.chatId,
      runId: scope.runId,
      clientRequestId,
      role: "tool",
      status: result.status === "completed" ? "completed" : "failed",
      content: [{ type: "tool_result", result }],
    });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    return findOwnedMessageByClientRequestInTransaction(transaction, scope.chatId, clientRequestId);
  }
}

function storedResult(result: unknown, callId: string): ToolResult | null {
  if (!result || typeof result !== "object") return null;
  const parsed = contentBlocksSchema.safeParse([{ type: "tool_result", result }]);
  if (!parsed.success) return null;
  const block = parsed.data[0];
  if (block?.type !== "tool_result" || block.result.toolCallId !== callId) return null;
  return block.result;
}

function combineUsage(current: ExecutionSession["usage"], next: ModelCallResult["usage"]): ExecutionSession["usage"] | "overflow" {
  if (!next) return current;
  const inputTokens = (current?.inputTokens ?? 0) + next.inputTokens;
  const outputTokens = (current?.outputTokens ?? 0) + next.outputTokens;
  if (inputTokens > maxStoredTokens || outputTokens > maxStoredTokens) return "overflow";
  return { inputTokens, outputTokens };
}

async function readRun(runId: string): Promise<RunStatus | null> {
  const run = await withTransaction((transaction) => getAgentRunInTransaction(transaction, runId));
  return run ? runStatusSchema.parse(run.status) : null;
}

function failed(code: RunErrorCode): RunOutcome {
  const error = runError(code);
  return { status: "failed", code: error.code, message: error.message };
}

function messageStatusFor(status: RunStatus): MessageStatus {
  if (status === "completed") return "completed";
  if (status === "cancelled") return "cancelled";
  return "failed";
}

function safeCallId(id: string): string {
  const trimmed = id.trim();
  return trimmed.length > 0 && trimmed.length <= 200 ? trimmed : "malformed-call";
}

function safeToolName(name: string): string {
  const trimmed = name.trim();
  return trimmed.length > 0 && trimmed.length <= 100 ? trimmed : "unknown";
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}
