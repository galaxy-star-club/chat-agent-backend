import type { CurrentSessionResponse } from "@/contracts/auth";
import type { RequestIdentity } from "@/lib/request-auth.server";

export function getCurrentSession(identity: RequestIdentity): CurrentSessionResponse {
  return { userId: identity.userId, sessionId: identity.sessionId };
}
