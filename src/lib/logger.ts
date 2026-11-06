import type { TraceContext } from "@/contracts/trace";

const sensitiveKey = /authorization|cookie|password|secret|token|api[-_]?key/i;

export function redact(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === null || typeof value !== "object") return value;
  if (value instanceof Error) return { name: value.name };
  if (seen.has(value)) return "[Circular]";
  seen.add(value);
  if (Array.isArray(value)) return value.map((item) => redact(item, seen));

  return Object.fromEntries(Object.entries(value).map(([key, item]) => [
    key,
    sensitiveKey.test(key) ? "[REDACTED]" : redact(item, seen),
  ]));
}

export function logError(event: string, trace: TraceContext, details: Record<string, unknown> = {}): void {
  console.error(JSON.stringify({ ...redact(details) as object, level: "error", event, ...trace }));
}

export function logRun(level: "info" | "error", event: string, traceId: string, details: Record<string, unknown> = {}): void {
  const line = JSON.stringify({ ...redact(details) as object, level, event, traceId });
  if (level === "error") console.error(line);
  else console.info(line);
}
