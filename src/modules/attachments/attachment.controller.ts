import { ZodError } from "zod";
import { apiSuccessSchema } from "@/contracts/api";
import { completeUploadRequestSchema, completeUploadResponseSchema, createUploadRequestSchema, uploadOptionsResponseSchema } from "@/contracts/attachments";
import { chatIdSchema } from "@/contracts/chats";
import { getClerkConfig, getFrontendOrigins } from "@/lib/config";
import { responseHeaders } from "@/lib/cors";
import { errorResponse, mapErrorToResponse } from "@/lib/error-response";
import { readRequestIdentity } from "@/lib/request-auth.server";
import { createTraceContext } from "@/lib/trace-context";
import { completeUpload, createUploadOptions, UploadConfigurationError, UploadNotFoundError, UploadVerificationError } from "./attachment.service";

export async function attachmentController(request: Request, rawChatId: string, action: "options" | "complete"): Promise<Response> {
  const trace = createTraceContext();
  let headers = responseHeaders(trace.requestId);
  try {
    const origins = getFrontendOrigins();
    const clerk = getClerkConfig();
    if (!origins || !clerk) return errorResponse("CONFIGURATION_ERROR", 503, trace.requestId, headers);
    const origin = request.headers.get("origin");
    if (origin !== null && !origins.has(origin)) return errorResponse("ORIGIN_NOT_ALLOWED", 403, trace.requestId, headers);
    headers = responseHeaders(trace.requestId, origin ?? undefined, true);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (request.method !== "POST") return errorResponse("METHOD_NOT_ALLOWED", 405, trace.requestId, headers);
    const identity = readRequestIdentity(request, clerk.secretKey);
    if (!identity) return errorResponse("AUTHENTICATION_REQUIRED", 401, trace.requestId, headers);
    const chatId = chatIdSchema.parse(rawChatId);
    if (action === "options") {
      const body = createUploadRequestSchema.parse(await request.json());
      const data = await createUploadOptions({ ownerId: identity.userId, chatId, files: body.files });
      return Response.json(apiSuccessSchema(uploadOptionsResponseSchema).parse({ data }), { status: 201, headers });
    }
    const body = completeUploadRequestSchema.parse(await request.json());
    const attachments = await completeUpload({ ownerId: identity.userId, chatId, ...body });
    return Response.json(apiSuccessSchema(completeUploadResponseSchema).parse({ data: { attachments } }), { headers });
  } catch (error) {
    if (error instanceof ZodError || error instanceof UploadVerificationError) return errorResponse("INVALID_REQUEST", 400, trace.requestId, headers);
    if (error instanceof UploadNotFoundError) return errorResponse("NOT_FOUND", 404, trace.requestId, headers);
    if (error instanceof UploadConfigurationError) return errorResponse("CONFIGURATION_ERROR", 503, trace.requestId, headers);
    return mapErrorToResponse(error, trace, headers);
  }
}
