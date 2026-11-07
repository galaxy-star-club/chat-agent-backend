import { createHmac, createPublicKey, timingSafeEqual, verify } from "node:crypto";
import { createClerkClient, type ClerkClient } from "@clerk/backend";

export type RequestIdentity = {
  userId: string;
  sessionId: string;
};

type ClerkConfig = {
  publishableKey: string;
  secretKey: string;
};

export type AuthGateResult =
  | { kind: "authenticated"; identity: RequestIdentity; headers: Headers }
  | { kind: "handshake"; headers: Headers }
  | { kind: "anonymous"; reason: string | null };

export const requestIdentityHeader = "x-agent-identity";
const identityLifetimeMs = 60_000;
const identityPattern = /^[A-Za-z0-9_:-]{1,128}$/;

let cachedClerk: { publishableKey: string; secretKey: string; client: ClerkClient } | null = null;

function clerkClient(config: ClerkConfig): ClerkClient {
  if (!cachedClerk || cachedClerk.publishableKey !== config.publishableKey || cachedClerk.secretKey !== config.secretKey) {
    cachedClerk = { ...config, client: createClerkClient(config) };
  }
  return cachedClerk.client;
}

function identityFromState(state: Awaited<ReturnType<ClerkClient["authenticateRequest"]>>): RequestIdentity | null {
  if (!state.isAuthenticated) return null;
  const auth = state.toAuth();
  if (!auth.userId || !auth.sessionId) return null;
  if (!identityPattern.test(auth.userId) || !identityPattern.test(auth.sessionId)) return null;
  return { userId: auth.userId, sessionId: auth.sessionId };
}

async function authenticateOnce(
  request: Request,
  config: ClerkConfig,
  authorizedParties: Set<string>,
): Promise<AuthGateResult> {
  const state = await clerkClient(config).authenticateRequest(request, {
    acceptsToken: "session_token",
    authorizedParties: [...authorizedParties],
  });
  const identity = identityFromState(state);
  if (identity) return { kind: "authenticated", identity, headers: state.headers };
  if (state.status === "handshake" && state.headers.get("location")) return { kind: "handshake", headers: state.headers };
  return { kind: "anonymous", reason: state.reason };
}

/** Accept a Clerk session token or the signed-in browser session. */
export async function authenticateSession(
  request: Request,
  config: ClerkConfig,
  authorizedParties: Set<string>,
): Promise<AuthGateResult> {
  const bearer = bearerToken(request);
  if (bearer) {
    const verified = await verifySessionToken(bearer, config.publishableKey, authorizedParties);
    if (verified.identity) return { kind: "authenticated", identity: verified.identity, headers: new Headers() };
    return { kind: "anonymous", reason: verified.reason };
  }
  return authenticateOnce(request, config, authorizedParties);
}

type SigningKey = import("node:crypto").JsonWebKey;
const jwksCache = new Map<string, { expiresAt: number; keys: Map<string, SigningKey> }>();

function bearerToken(request: Request): string | null {
  const authorization = request.headers.get("authorization");
  if (!authorization) return null;
  const [scheme, token] = authorization.split(" ", 2);
  if (scheme !== "Bearer" || !token || token.includes(" ")) return null;
  return token;
}

function expectedIssuer(publishableKey: string): string | null {
  const match = /^pk_(?:test|live)_([A-Za-z0-9+/=_-]+)$/.exec(publishableKey);
  if (!match?.[1]) return null;
  const host = Buffer.from(match[1], "base64").toString("utf8").replace(/\$$/, "");
  if (!/^[a-z0-9.-]+$/.test(host)) return null;
  if (!host.endsWith(".clerk.accounts.dev") && !host.endsWith(".clerk.com")) return null;
  return `https://${host}`;
}

async function verifySessionToken(
  token: string,
  publishableKey: string,
  authorizedParties: Set<string>,
): Promise<{ identity: RequestIdentity | null; reason: string }> {
  const [encodedHeader, encodedPayload, encodedSignature] = token.split(".");
  if (!encodedHeader || !encodedPayload || !encodedSignature || token.split(".").length !== 3) {
    return { identity: null, reason: "malformed" };
  }
  let header: { alg?: unknown; kid?: unknown };
  let payload: { iss?: unknown; sub?: unknown; sid?: unknown; azp?: unknown; exp?: unknown; nbf?: unknown };
  try {
    header = JSON.parse(Buffer.from(encodedHeader, "base64url").toString("utf8")) as typeof header;
    payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as typeof payload;
  } catch {
    return { identity: null, reason: "malformed" };
  }
  if (header.alg !== "RS256" || typeof header.kid !== "string") return { identity: null, reason: "header" };
  const issuer = expectedIssuer(publishableKey);
  if (typeof payload.iss !== "string" || payload.iss !== issuer) return { identity: null, reason: issuer ? "issuer" : "publishable-key" };
  if (typeof payload.azp !== "string" || !authorizedParties.has(payload.azp)) return { identity: null, reason: "authorized-party" };
  if (typeof payload.sub !== "string" || typeof payload.sid !== "string") return { identity: null, reason: "claims" };
  if (!identityPattern.test(payload.sub) || !identityPattern.test(payload.sid)) return { identity: null, reason: "claims" };
  const now = Date.now() / 1000;
  if (typeof payload.exp !== "number" || payload.exp + 5 < now) return { identity: null, reason: "expired" };
  if (typeof payload.nbf === "number" && payload.nbf - 5 > now) return { identity: null, reason: "not-yet-valid" };
  const jwk = await signingKey(payload.iss, header.kid);
  if (!jwk) return { identity: null, reason: "jwks" };
  const valid = verify(
    "RSA-SHA256",
    Buffer.from(`${encodedHeader}.${encodedPayload}`),
    createPublicKey({ key: jwk, format: "jwk" }),
    Buffer.from(encodedSignature, "base64url"),
  );
  return valid
    ? { identity: { userId: payload.sub, sessionId: payload.sid }, reason: "ok" }
    : { identity: null, reason: "signature" };
}

async function signingKey(issuer: string, kid: string): Promise<SigningKey | null> {
  const cached = jwksCache.get(issuer);
  if (cached && cached.expiresAt > Date.now()) return cached.keys.get(kid) ?? null;
  const response = await fetch(`${issuer}/.well-known/jwks.json`, { signal: AbortSignal.timeout(5_000) });
  if (!response.ok) return cached?.keys.get(kid) ?? null;
  const body: unknown = await response.json();
  if (!body || typeof body !== "object" || !Array.isArray((body as { keys?: unknown }).keys)) return null;
  const keys = new Map<string, SigningKey>();
  for (const key of (body as { keys: unknown[] }).keys) {
    if (!key || typeof key !== "object") continue;
    const record = key as SigningKey & { kid?: string };
    if (record.kid && record.kty === "RSA") keys.set(record.kid, record);
  }
  jwksCache.set(issuer, { expiresAt: Date.now() + 5 * 60_000, keys });
  return keys.get(kid) ?? null;
}

export function sealIdentity(identity: RequestIdentity, secret: string): string {
  const payload = Buffer.from(JSON.stringify({
    userId: identity.userId,
    sessionId: identity.sessionId,
    exp: Date.now() + identityLifetimeMs,
  })).toString("base64url");
  return `v1.${payload}.${sign(payload, secret)}`;
}

export function readRequestIdentity(request: Request, secret: string): RequestIdentity | null {
  const value = request.headers.get(requestIdentityHeader);
  if (!value || value.length > 2048) return null;
  const [version, payload, signature, extra] = value.split(".");
  if (version !== "v1" || !payload || !signature || extra !== undefined) return null;
  const expected = sign(payload, secret);
  if (!signaturesMatch(signature, expected)) return null;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!parsed || typeof parsed !== "object") return null;
    const record = parsed as { userId?: unknown; sessionId?: unknown; exp?: unknown };
    if (typeof record.userId !== "string" || typeof record.sessionId !== "string" || typeof record.exp !== "number") return null;
    if (!identityPattern.test(record.userId) || !identityPattern.test(record.sessionId) || record.exp < Date.now()) return null;
    return { userId: record.userId, sessionId: record.sessionId };
  } catch {
    return null;
  }
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function signaturesMatch(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}
