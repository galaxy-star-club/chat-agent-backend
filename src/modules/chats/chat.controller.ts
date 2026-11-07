import { ZodError } from "zod";
import { apiSuccessSchema } from "@/contracts/api";
import {
  chatIdSchema,
  chatListQuerySchema,
  chatListResponseSchema,
  chatSchema,
  createChatRequestSchema,
  updateFavoriteRequestSchema,
} from "@/contracts/chats";
import { getClerkConfig, getFrontendOrigins } from "@/lib/config";
import { errorResponse, mapErrorToResponse } from "@/lib/error-response";
import { InvalidCursorError } from "@/lib/keyset-cursor";
import { readRequestIdentity } from "@/lib/request-auth.server";
import { responseHeaders } from "@/lib/cors";
import { createTraceContext } from "@/lib/trace-context";
import {
  ChatNotFoundError,
  createOwnedChat,
  deleteOwnedChatForOwner,
  listOwnedChats,
  requireOwnedChat,
  updateOwnedChatFavorite,
} from "./chat.service";

type Resource = "collection" | "chat" | "favorite";

const methods: Record<Resource, string[]> = {
  collection: ["GET", "HEAD", "POST", "OPTIONS"],
  chat: ["GET", "HEAD", "DELETE", "OPTIONS"],
  favorite: ["PATCH", "OPTIONS"],
};

export async function chatController(request: Request, resource: Resource, rawChatId?: string): Promise<Response> {
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

    const allowed = methods[resource];
    if (request.method === "OPTIONS") {
      headers.set("Allow", allowed.join(", "));
      headers.set("Access-Control-Allow-Methods", allowed.join(", "));
      headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
      headers.set("Access-Control-Allow-Credentials", "true");
      headers.set("Access-Control-Max-Age", "600");
      return new Response(null, { status: 204, headers });
    }
    if (!allowed.includes(request.method)) {
      headers.set("Allow", allowed.join(", "));
      return errorResponse("METHOD_NOT_ALLOWED", 405, requestId, headers);
    }

    const identity = readRequestIdentity(request, clerkConfig.secretKey);
    if (!identity) return errorResponse("AUTHENTICATION_REQUIRED", 401, requestId, headers);

    const chatId = resource === "collection" ? undefined : chatIdSchema.parse(rawChatId);
    let response: Response;
    if (resource === "collection" && request.method === "POST") {
      const input = createChatRequestSchema.parse(await request.json());
      const chat = await createOwnedChat(identity.userId, input.title);
      response = Response.json(apiSuccessSchema(chatSchema).parse({ data: toChat(chat) }), { status: 201, headers });
    } else if (resource === "collection") {
      const query = chatListQuerySchema.parse(queryObject(request));
      const page = await listOwnedChats(identity.userId, query);
      response = Response.json(apiSuccessSchema(chatListResponseSchema).parse({
        data: { items: page.items.map(toChat), pageInfo: page.pageInfo },
      }), { headers });
    } else if (resource === "favorite") {
      const input = updateFavoriteRequestSchema.parse(await request.json());
      const chat = await updateOwnedChatFavorite(identity.userId, chatId!, input.isFavorite);
      response = Response.json(apiSuccessSchema(chatSchema).parse({ data: toChat(chat) }), { headers });
    } else if (request.method === "DELETE") {
      await deleteOwnedChatForOwner(identity.userId, chatId!);
      response = new Response(null, { status: 204, headers });
    } else {
      const chat = await requireOwnedChat(identity.userId, chatId!);
      response = Response.json(apiSuccessSchema(chatSchema).parse({ data: toChat(chat) }), { headers });
    }
    return request.method === "HEAD" ? new Response(null, { status: response.status, headers: response.headers }) : response;
  } catch (error) {
    if (error instanceof ZodError || error instanceof InvalidCursorError || error instanceof SyntaxError) {
      return errorResponse("INVALID_REQUEST", 400, requestId, headers);
    }
    if (error instanceof ChatNotFoundError) return errorResponse("NOT_FOUND", 404, requestId, headers);
    return mapErrorToResponse(error, trace, headers);
  }
}

function queryObject(request: Request): Record<string, string> {
  const allowed = new Set(["cursor", "limit", "query", "favorite"]);
  const query: Record<string, string> = {};
  for (const [key, value] of new URL(request.url).searchParams) {
    if (!allowed.has(key) || key in query) throw new InvalidCursorError();
    query[key] = value;
  }
  return query;
}

function toChat(chat: {
  id: string;
  title: string | null;
  isFavorite: boolean;
  activeRunId: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: chat.id,
    title: chat.title,
    isFavorite: chat.isFavorite,
    activeRunId: chat.activeRunId,
    createdAt: chat.createdAt.toISOString(),
    updatedAt: chat.updatedAt.toISOString(),
  };
}
