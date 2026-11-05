import { CONTRACT_VERSION, type HealthResponse } from "@/contracts/health";

export function getHealth(): HealthResponse {
  return { status: "ok", service: "agentic-chat-api", contractVersion: CONTRACT_VERSION };
}
