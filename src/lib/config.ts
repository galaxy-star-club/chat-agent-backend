import { z } from "zod";

const clerkConfigSchema = z.strictObject({
  publishableKey: z.string().trim().min(1),
  secretKey: z.string().trim().min(1),
});

const databaseUrlSchema = z.string().trim().refine((value) => {
  try {
    const url = new URL(value);
    return ["postgres:", "postgresql:"].includes(url.protocol) && Boolean(url.hostname) && url.pathname !== "/";
  } catch {
    return false;
  }
});

const frontendOriginSchema = z.url().refine((origin) => {
  if (!URL.canParse(origin)) return false;
  const url = new URL(origin);
  return ["http:", "https:"].includes(url.protocol) &&
    url.origin === origin && !url.username && !url.password && !origin.includes("*");
});

/** Reject noncanonical origins instead of silently broadening the allowlist. */
export function getFrontendOrigins(env = process.env): Set<string> | null {
  const configured = env.FRONTEND_ORIGINS;
  if (configured === undefined && env.NODE_ENV !== "production") {
    return new Set(["http://localhost:3000"]);
  }
  if (!configured?.trim()) return null;

  const origins = configured.split(",").map((origin) => origin.trim());
  for (const origin of origins) {
    if (!frontendOriginSchema.safeParse(origin).success) return null;
  }
  return new Set(origins);
}

export function getClerkConfig(env = process.env): {
  publishableKey: string;
  secretKey: string;
} | null {
  const result = clerkConfigSchema.safeParse({
    publishableKey: env.CLERK_PUBLISHABLE_KEY,
    secretKey: env.CLERK_SECRET_KEY,
  });
  return result.success ? result.data : null;
}

export function getDatabaseUrl(env = process.env): string | null {
  const result = databaseUrlSchema.safeParse(env.DATABASE_URL);
  return result.success ? result.data : null;
}

/**
 * Interactive transactions need a session connection. Neon's pooled URL
 * cannot hold one, so the client prefers the direct URL when it is set.
 */
export function getRuntimeDatabaseUrl(env = process.env): string | null {
  const direct = databaseUrlSchema.safeParse(env.DATABASE_URL_UNPOOLED ?? env.DIRECT_URL);
  if (direct.success) return direct.data;
  return getDatabaseUrl(env);
}

/** The only model this service is allowed to request. */
export const freeModelId = "openrouter/free";

const freeModelSchema = z.literal(freeModelId);
const maxModelTurnsSchema = z.coerce.number().int().min(1).max(8);
const providerUrlSchema = z.url().refine((value) => {
  const url = new URL(value);
  return url.protocol === "https:" && !url.username && !url.password;
});

/**
 * Conservative loop bound used when AGENT_MAX_TURNS is unset.
 * Values outside 1–8 are rejected rather than clamped.
 */
export const defaultMaxModelTurns = 4;

export function getMaxModelTurns(env = process.env): number | null {
  const configured = env.AGENT_MAX_TURNS;
  if (configured === undefined || configured.trim() === "") return defaultMaxModelTurns;
  const result = maxModelTurnsSchema.safeParse(configured);
  return result.success ? result.data : null;
}

export function getOpenRouterConfig(env = process.env): { apiKey: string; model: typeof freeModelId } | null {
  const apiKey = env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) return null;
  const configured = env.OPENROUTER_MODEL?.trim() || freeModelId;
  const model = freeModelSchema.safeParse(configured);
  if (!model.success) return null;
  return { apiKey, model: model.data };
}

export function getMagicaConfig(env = process.env): {
  apiKey: string;
  baseUrl: string;
  videoBackgroundRemoverNode: string | null;
  videoUpscalerNode: string | null;
} | null {
  const core = z.strictObject({
    apiKey: z.string().trim().min(1),
    baseUrl: providerUrlSchema,
  }).safeParse({
    apiKey: env.MAGICA_API_KEY,
    baseUrl: env.MAGICA_BASE_URL,
  });
  if (!core.success) return null;
  const node = z.string().trim().min(1).max(100);
  return {
    ...core.data,
    videoBackgroundRemoverNode: node.safeParse(env.MAGICA_VIDEO_BACKGROUND_REMOVER_NODE).data ?? null,
    videoUpscalerNode: node.safeParse(env.MAGICA_VIDEO_UPSCALER_NODE).data ?? null,
  };
}

export function getTransloaditConfig(env = process.env): { key: string; secret: string; templateId: string; signatureAlgorithm: "sha256" | "sha384" } | null {
  const result = z.strictObject({
    key: z.string().trim().min(1),
    secret: z.string().trim().min(1),
    templateId: z.string().trim().min(1).max(100),
    signatureAlgorithm: z.enum(["sha256", "sha384"]),
  }).safeParse({
    key: env.TRANSLOADIT_KEY,
    secret: env.TRANSLOADIT_SECRET,
    templateId: env.TRANSLOADIT_TEMPLATE_ID,
    signatureAlgorithm: env.TRANSLOADIT_SIGNATURE_ALGORITHM?.trim() || "sha384",
  });
  return result.success ? result.data : null;
}
