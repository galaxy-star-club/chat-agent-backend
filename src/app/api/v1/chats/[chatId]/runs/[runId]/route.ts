import { agentRunController } from "@/modules/agent-runs/agent-run.controller";

export const maxDuration = 60;

type Context = { params: Promise<{ chatId: string; runId: string }> };

async function handle(request: Request, context: Context): Promise<Response> {
  const params = await context.params;
  return agentRunController(request, params.chatId, params.runId);
}

export const GET = handle;
export const HEAD = handle;
export const OPTIONS = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
