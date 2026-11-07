import { ZodError } from "zod";
import { apiSuccessSchema } from "@/contracts/api";
import { chatIdSchema } from "@/contracts/chats";
import { agentRunRecordSchema } from "@/contracts/run";
import { getClerkConfig, getFrontendOrigins } from "@/lib/config";
import { responseHeaders } from "@/lib/cors";
import { errorResponse, mapErrorToResponse } from "@/lib/error-response";
import { readRequestIdentity } from "@/lib/request-auth.server";
import { createTraceContext } from "@/lib/trace-context";
import { logRun } from "@/lib/logger";
import { executeAdmittedRun } from "@/modules/execution/execute-run.service";
import { getOwnedAgentRunRecord } from "./agent-run.service";

const allowedMethods = ["GET", "HEAD", "OPTIONS"];

export async function agentRunController(request: Request, rawChatId: string, rawRunId: string): Promise<Response> {
  const trace = createTraceContext();
  const requestId = trace.requestId;
  let headers = responseHeaders(requestId);
  try {
    const origins = getFrontendOrigins();
    const clerkConfig = getClerkConfig();
    if (!origins || !clerkConfig) return errorResponse("CONFIGURATION_ERROR", 503, requestId, headers);
    const origin = request.headers.get("origin");
    if (origin !== null && !origins.has(origin)) return errorResponse("ORIGIN_NOT_ALLOWED", 403, requestId, headers);
    headers = responseHeaders(requestId, origin ?? undefined, true);
    if (request.method === "OPTIONS") {
      headers.set("Allow", allowedMethods.join(", "));
      headers.set("Access-Control-Allow-Methods", allowedMethods.join(", "));
      headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
      headers.set("Access-Control-Allow-Credentials", "true");
      headers.set("Access-Control-Max-Age", "600");
      return new Response(null, { status: 204, headers });
    }
    if (!allowedMethods.includes(request.method)) {
      headers.set("Allow", allowedMethods.join(", "));
      return errorResponse("METHOD_NOT_ALLOWED", 405, requestId, headers);
    }
    const identity = readRequestIdentity(request, clerkConfig.secretKey);
    if (!identity) return errorResponse("AUTHENTICATION_REQUIRED", 401, requestId, headers);
    const chatId = chatIdSchema.parse(rawChatId);
    const runId = chatIdSchema.parse(rawRunId);
    const run = await getOwnedAgentRunRecord(identity.userId, chatId, runId);
    if (!run) return errorResponse("NOT_FOUND", 404, requestId, headers);
    if (run.status === "pending") {
      after(() => executeAdmittedRun(run.id).catch((error: unknown) => {
        logRun("error", "agent_run_recovery_failed", run.traceId, { runId: run.id, name: error instanceof Error ? error.name : "Error" });
      }));
    }
    const response = Response.json(apiSuccessSchema(agentRunRecordSchema).parse({ data: run }), { headers });
    return request.method === "HEAD" ? new Response(null, { status: response.status, headers: response.headers }) : response;
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) return errorResponse("INVALID_REQUEST", 400, requestId, headers);
    return mapErrorToResponse(error, trace, headers);
  }
}
import { after } from "next/server";
