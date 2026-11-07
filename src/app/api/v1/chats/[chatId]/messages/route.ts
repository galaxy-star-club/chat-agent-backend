import { messageController } from "@/modules/messages/message.controller";

export const maxDuration = 60;

type Context = { params: Promise<{ chatId: string }> };
async function handle(request: Request, context: Context): Promise<Response> {
  return messageController(request, (await context.params).chatId);
}
export const GET = handle;
export const HEAD = handle;
export const OPTIONS = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
