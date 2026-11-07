import { agentRunStreamController } from "@/modules/agent-runs/agent-run-stream.controller";

export const maxDuration = 60;

type Context = { params: Promise<{ chatId: string; runId: string }> };

async function handle(request: Request, context: Context): Promise<Response> {
  const params = await context.params;
  return agentRunStreamController(request, params.chatId, params.runId);
}

export const GET = handle;
export const OPTIONS = handle;
