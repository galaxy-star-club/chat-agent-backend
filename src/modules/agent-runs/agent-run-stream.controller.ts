import { ZodError } from "zod";
import { chatIdSchema } from "@/contracts/chats";
import { getClerkConfig, getFrontendOrigins } from "@/lib/config";
import { responseHeaders } from "@/lib/cors";
import { errorResponse, mapErrorToResponse } from "@/lib/error-response";
import { readRequestIdentity } from "@/lib/request-auth.server";
import { createTraceContext } from "@/lib/trace-context";
import { executeAdmittedRun } from "@/modules/execution/execute-run.service";
import { getOwnedAgentRunRecord } from "./agent-run.service";

const encoder = new TextEncoder();

export async function agentRunStreamController(request: Request, rawChatId: string, rawRunId: string): Promise<Response> {
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
      headers.set("Allow", "GET, OPTIONS");
      headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
      headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
      headers.set("Access-Control-Allow-Credentials", "true");
      headers.set("Access-Control-Max-Age", "600");
      return new Response(null, { status: 204, headers });
    }
    if (request.method !== "GET") return errorResponse("METHOD_NOT_ALLOWED", 405, requestId, headers);
    const identity = readRequestIdentity(request, clerkConfig.secretKey);
    if (!identity) return errorResponse("AUTHENTICATION_REQUIRED", 401, requestId, headers);
    const chatId = chatIdSchema.parse(rawChatId);
    const runId = chatIdSchema.parse(rawRunId);
    const run = await getOwnedAgentRunRecord(identity.userId, chatId, runId);
    if (!run) return errorResponse("NOT_FOUND", 404, requestId, headers);
    headers.set("Content-Type", "text/event-stream; charset=utf-8");
    headers.set("Connection", "keep-alive");
    headers.set("X-Accel-Buffering", "no");
    return new Response(new ReadableStream({
      start(controller) {
        const send = (event: string, data: unknown) => controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        void (async () => {
          try {
            const outcome = run.status === "pending"
              ? await executeAdmittedRun(run.id, async (event) => send(event.type, event.message))
              : { runId: run.id, status: run.status };
            send("done", outcome);
          } catch {
            send("error", { message: "The agent run failed." });
          } finally {
            controller.close();
          }
        })();
      },
    }), { headers });
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) return errorResponse("INVALID_REQUEST", 400, requestId, headers);
    return mapErrorToResponse(error, trace, headers);
  }
}
