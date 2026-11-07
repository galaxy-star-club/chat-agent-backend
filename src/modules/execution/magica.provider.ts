import { z } from "zod";
import { jsonValueSchema, type JsonValue } from "@/contracts/json";
import { getMagicaConfig } from "@/lib/config";

const identifier = z.string().trim().min(1).max(100).regex(/^[A-Za-z0-9._-]+$/);
const urlSchema = z.url().refine((value) => value.startsWith("https://"));
const runIdentifier = z.object({ id: z.string().min(1).optional(), runId: z.string().min(1).optional() }).passthrough();

export class MagicaFailure extends Error {
  constructor(readonly code: "tool_not_configured" | "provider_unauthorized" | "provider_rate_limited" | "provider_timeout" | "provider_failed") {
    super(code);
    this.name = "MagicaFailure";
  }
}

export function magicaConfigured(): boolean {
  return getMagicaConfig() !== null;
}

export function magicaVideoConfigured(node: "videoBackgroundRemoverNode" | "videoUpscalerNode"): boolean {
  return getMagicaConfig()?.[node] !== null;
}

export async function listMagicaModels(): Promise<JsonValue> {
  return request("/v1/models");
}

export async function getMagicaModelSchema(modelId: string): Promise<JsonValue> {
  return request(`/v1/models/${encodeURIComponent(identifier.parse(modelId))}/schema`);
}

export async function getMagicaModelPricing(modelId: string): Promise<JsonValue> {
  return request(`/v1/models/${encodeURIComponent(identifier.parse(modelId))}/pricing`);
}

export async function startMagicaModel(input: { nodeType: string; subModelId?: string; input: Record<string, JsonValue> }): Promise<{ runId: string }> {
  const response = await request(`/v1/nodes/${encodeURIComponent(identifier.parse(input.nodeType))}/run`, {
    method: "POST",
    body: JSON.stringify({ ...(input.subModelId ? { subModelId: identifier.parse(input.subModelId) } : {}), input: input.input }),
  });
  const parsed = runIdentifier.safeParse(response);
  const runId = parsed.success ? parsed.data.runId ?? parsed.data.id : undefined;
  if (!runId) throw new MagicaFailure("provider_failed");
  return { runId };
}

export async function getMagicaRun(runId: string): Promise<JsonValue> {
  return request(`/v1/nodes/runs/${encodeURIComponent(identifier.parse(runId))}`);
}

export async function runMagicaVideoTool(input: {
  node: "videoBackgroundRemoverNode" | "videoUpscalerNode";
  payload: Record<string, JsonValue>;
}): Promise<{ runId: string; videoUrl: string }> {
  const config = getMagicaConfig();
  const nodeType = config?.[input.node];
  if (!config || !nodeType) throw new MagicaFailure("tool_not_configured");
  const started = await startMagicaModel({ nodeType, input: input.payload });
  for (let attempt = 0; attempt < 90; attempt += 1) {
    const current = await getMagicaRun(started.runId);
    const videoUrl = findVideoUrl(current);
    if (videoUrl) return { runId: started.runId, videoUrl };
    if (isFailure(current)) throw new MagicaFailure("provider_failed");
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  throw new MagicaFailure("provider_timeout");
}

async function request(path: string, init: RequestInit = {}): Promise<JsonValue> {
  const config = getMagicaConfig();
  if (!config) throw new MagicaFailure("tool_not_configured");
  let response: Response;
  try {
    response = await fetch(`${config.baseUrl}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json", ...init.headers },
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new MagicaFailure("provider_timeout");
  }
  if (response.status === 401) throw new MagicaFailure("provider_unauthorized");
  if (response.status === 429) throw new MagicaFailure("provider_rate_limited");
  if (!response.ok) throw new MagicaFailure("provider_failed");
  const parsed = jsonValueSchema.safeParse(await response.json().catch(() => null));
  if (!parsed.success) throw new MagicaFailure("provider_failed");
  return parsed.data;
}

function findVideoUrl(value: JsonValue): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const direct = value.video_url;
  if (typeof direct === "string" && urlSchema.safeParse(direct).success) return direct;
  const output = value.output;
  if (!output || typeof output !== "object" || Array.isArray(output)) return null;
  const nested = output.video_url;
  return typeof nested === "string" && urlSchema.safeParse(nested).success ? nested : null;
}

function isFailure(value: JsonValue): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return value.status === "failed" || value.status === "cancelled" || value.status === "canceled";
}
