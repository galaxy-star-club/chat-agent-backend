import { ZodError } from "zod";
import { apiSuccessSchema } from "@/contracts/api";
import { chatIdSchema } from "@/contracts/chats";
import { contentBlocksSchema } from "@/contracts/content";
import { messageListResponseSchema, type MessageRecord } from "@/contracts/messages";
import { cursorPaginationQuerySchema } from "@/contracts/pagination";
import { getClerkConfig, getFrontendOrigins } from "@/lib/config";
import { responseHeaders } from "@/lib/cors";
import { errorResponse, mapErrorToResponse } from "@/lib/error-response";
import { InvalidCursorError } from "@/lib/keyset-cursor";
import { authenticateRequest } from "@/lib/request-auth.server";
import { createTraceContext } from "@/lib/trace-context";
import { ChatNotFoundError } from "@/modules/chats/chat.service";
import { listOwnedChatMessages } from "./message.service";

const allowedMethods = ["GET", "HEAD", "OPTIONS"];

export async function messageController(request: Request, rawChatId: string): Promise<Response> {
  const trace = createTraceContext();
  const requestId = trace.requestId;
  let headers = responseHeaders(requestId);
  try {
    const origins = getFrontendOrigins();
    const clerkConfig = getClerkConfig();
    if (!origins || !clerkConfig) return errorResponse("CONFIGURATION_ERROR", 503, requestId, headers);
    const origin = request.headers.get("origin");
    if (origin !== null && !origins.has(origin)) return errorResponse("ORIGIN_NOT_ALLOWED", 403, requestId, headers);
    headers = responseHeaders(requestId, origin ?? undefined);
    if (request.method === "OPTIONS") {
      headers.set("Allow", allowedMethods.join(", "));
      headers.set("Access-Control-Allow-Methods", allowedMethods.join(", "));
      headers.set("Access-Control-Allow-Headers", "Authorization");
      headers.set("Access-Control-Max-Age", "600");
      return new Response(null, { status: 204, headers });
    }
    if (!allowedMethods.includes(request.method)) {
      headers.set("Allow", allowedMethods.join(", "));
      return errorResponse("METHOD_NOT_ALLOWED", 405, requestId, headers);
    }
    const identity = await authenticateRequest(request, clerkConfig, origins);
    if (!identity) return errorResponse("AUTHENTICATION_REQUIRED", 401, requestId, headers);
    const chatId = chatIdSchema.parse(rawChatId);
    const query = cursorPaginationQuerySchema.parse(queryObject(request));
    const page = await listOwnedChatMessages(identity.userId, chatId, query);
    const response = Response.json(apiSuccessSchema(messageListResponseSchema).parse({
      data: { items: page.items.map(toMessage), pageInfo: page.pageInfo },
    }), { headers });
    return request.method === "HEAD" ? new Response(null, { status: response.status, headers: response.headers }) : response;
  } catch (error) {
    if (error instanceof ZodError || error instanceof InvalidCursorError) return errorResponse("INVALID_REQUEST", 400, requestId, headers);
    if (error instanceof ChatNotFoundError) return errorResponse("NOT_FOUND", 404, requestId, headers);
    return mapErrorToResponse(error, trace, headers);
  }
}

function queryObject(request: Request): Record<string, string> {
  const allowed = new Set(["cursor", "limit"]);
  const query: Record<string, string> = {};
  for (const [key, value] of new URL(request.url).searchParams) {
    if (!allowed.has(key) || key in query) throw new InvalidCursorError();
    query[key] = value;
  }
  return query;
}

function toMessage(message: {
  id: string;
  chatId: string;
  runId: string | null;
  role: MessageRecord["role"];
  status: MessageRecord["status"];
  content: unknown;
  createdAt: Date;
  updatedAt: Date;
}): MessageRecord {
  return {
    id: message.id,
    chatId: message.chatId,
    runId: message.runId,
    role: message.role,
    status: message.status,
    content: contentBlocksSchema.parse(message.content),
    createdAt: message.createdAt.toISOString(),
    updatedAt: message.updatedAt.toISOString(),
  };
}
