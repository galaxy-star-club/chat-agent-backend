import type { RunStatus } from "@/contracts/run";

const allowed: Record<RunStatus, readonly RunStatus[]> = {
  pending: ["running", "failed", "cancelled"],
  running: ["waiting", "completed", "failed", "cancelled"],
  waiting: ["running", "completed", "failed", "cancelled"],
  completed: [],
  failed: [],
  cancelled: [],
};

export class InvalidRunTransitionError extends Error {
  constructor(from: RunStatus, to: RunStatus) {
    super(`Run cannot move from ${from} to ${to}.`);
    this.name = "InvalidRunTransitionError";
  }
}

export function isTerminalRunStatus(status: RunStatus): status is "completed" | "failed" | "cancelled" {
  return status === "completed" || status === "failed" || status === "cancelled";
}

export function assertRunTransition(from: RunStatus, to: RunStatus): void {
  if (!allowed[from].includes(to)) throw new InvalidRunTransitionError(from, to);
}
