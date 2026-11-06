import { chatController } from "@/modules/chats/chat.controller";

type Context = { params: Promise<{ chatId: string }> };
async function handle(request: Request, context: Context): Promise<Response> {
  return chatController(request, "favorite", (await context.params).chatId);
}
export const PATCH = handle;
export const OPTIONS = handle;
export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const DELETE = handle;
export const HEAD = handle;
