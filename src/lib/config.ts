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
