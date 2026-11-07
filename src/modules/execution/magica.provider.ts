import { z } from "zod";
import { getMagicaConfig } from "@/lib/config";

const urlSchema = z.url().refine((value) => value.startsWith("https://"));
const resultSchema = z.object({
  runId: z.string().min(1).optional(),
  status: z.string().min(1).optional(),
  video_url: urlSchema.optional(),
  output: z.unknown().optional(),
}).passthrough();

export class MagicaFailure extends Error {
  constructor(readonly code: "tool_not_configured" | "provider_unauthorized" | "provider_rate_limited" | "provider_timeout" | "provider_failed") {
    super(code);
    this.name = "MagicaFailure";
  }
}

export function magicaConfigured(): boolean {
  return getMagicaConfig() !== null;
}

export async function runMagicaVideoTool(input: {
  node: "videoBackgroundRemoverNode" | "videoUpscalerNode";
  payload: Record<string, unknown>;
}): Promise<{ runId: string; videoUrl: string }> {
  const config = getMagicaConfig();
  if (!config) throw new MagicaFailure("tool_not_configured");
  const started = await request(`${config.baseUrl}/v1/nodes/${encodeURIComponent(config[input.node])}/run`, config.apiKey, {
    method: "POST",
    body: JSON.stringify(input.payload),
  });
  if (!started.runId) throw new MagicaFailure("provider_failed");
  for (let attempt = 0; attempt < 90; attempt += 1) {
    const current = await request(`${config.baseUrl}/v1/nodes/runs/${encodeURIComponent(started.runId)}`, config.apiKey);
    const videoUrl = findVideoUrl(current);
    if (videoUrl) return { runId: started.runId, videoUrl };
    if (isFailure(current.status)) throw new MagicaFailure("provider_failed");
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  throw new MagicaFailure("provider_timeout");
}

async function request(url: string, apiKey: string, init: RequestInit = {}): Promise<z.infer<typeof resultSchema>> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", ...init.headers },
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new MagicaFailure("provider_timeout");
  }
  if (response.status === 401) throw new MagicaFailure("provider_unauthorized");
  if (response.status === 429) throw new MagicaFailure("provider_rate_limited");
  if (!response.ok) throw new MagicaFailure("provider_failed");
  const parsed = resultSchema.safeParse(await response.json().catch(() => null));
  if (!parsed.success) throw new MagicaFailure("provider_failed");
  return parsed.data;
}

function findVideoUrl(value: z.infer<typeof resultSchema>): string | null {
  if (value.video_url) return value.video_url;
  if (!value.output || typeof value.output !== "object") return null;
  const videoUrl = (value.output as Record<string, unknown>).video_url;
  return typeof videoUrl === "string" && urlSchema.safeParse(videoUrl).success ? videoUrl : null;
}

function isFailure(status: string | undefined): boolean {
  return status === "failed" || status === "cancelled" || status === "canceled";
}
