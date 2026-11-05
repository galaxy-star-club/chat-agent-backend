import { createClerkClient } from "@clerk/backend";

export type RequestIdentity = {
  userId: string;
  sessionId: string;
};

type ClerkConfig = {
  publishableKey: string;
  secretKey: string;
};

export async function authenticateRequest(
  request: Request,
  config: ClerkConfig,
  authorizedParties: Set<string>,
): Promise<RequestIdentity | null> {
  const authorization = request.headers.get("authorization");
  if (!authorization || !/^Bearer [^\s]+$/i.test(authorization)) return null;

  const clerk = createClerkClient(config);
  const requestState = await clerk.authenticateRequest(request, {
    acceptsToken: "session_token",
    authorizedParties: [...authorizedParties],
  });
  if (!requestState.isAuthenticated) return null;

  const auth = requestState.toAuth();
  if (!auth.userId || !auth.sessionId) return null;
  return { userId: auth.userId, sessionId: auth.sessionId };
}
