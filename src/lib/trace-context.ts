import { traceContextSchema, type TraceContext } from "@/contracts/trace";

export function createTraceContext(): TraceContext {
  return traceContextSchema.parse({
    requestId: crypto.randomUUID(),
    traceId: crypto.randomUUID().replaceAll("-", ""),
    spanId: crypto.randomUUID().replaceAll("-", "").slice(0, 16),
  });
}
