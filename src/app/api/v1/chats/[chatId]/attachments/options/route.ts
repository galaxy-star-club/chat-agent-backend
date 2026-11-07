import { attachmentController } from "@/modules/attachments/attachment.controller";
type Context = { params: Promise<{ chatId: string }> };
export async function POST(request: Request, context: Context) { return attachmentController(request, (await context.params).chatId, "options"); }
export async function OPTIONS(request: Request, context: Context) { return attachmentController(request, (await context.params).chatId, "options"); }
