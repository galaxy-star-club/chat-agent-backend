/** Reject noncanonical origins instead of silently broadening the allowlist. */
export function getFrontendOrigins(env = process.env): Set<string> | null {
  const configured = env.FRONTEND_ORIGINS;
  if (configured === undefined && env.NODE_ENV !== "production") {
    return new Set(["http://localhost:3000"]);
  }
  if (!configured?.trim()) return null;

  const origins = configured.split(",").map((origin) => origin.trim());
  for (const origin of origins) {
    try {
      const url = new URL(origin);
      if (
        !["http:", "https:"].includes(url.protocol) ||
        url.origin !== origin ||
        url.username || url.password || origin.includes("*")
      ) return null;
    } catch {
      return null;
    }
  }
  return new Set(origins);
}

export function getClerkConfig(env = process.env): {
  publishableKey: string;
  secretKey: string;
} | null {
  const publishableKey = env.CLERK_PUBLISHABLE_KEY?.trim();
  const secretKey = env.CLERK_SECRET_KEY?.trim();
  if (!publishableKey || !secretKey) return null;
  return { publishableKey, secretKey };
}

export function getDatabaseUrl(env = process.env): string | null {
  const value = env.DATABASE_URL?.trim();
  if (!value) return null;

  try {
    const url = new URL(value);
    if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname || url.pathname === "/") {
      return null;
    }
    return value;
  } catch {
    return null;
  }
}
