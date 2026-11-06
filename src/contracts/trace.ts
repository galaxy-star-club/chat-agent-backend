import { z } from "zod";
import { requestIdSchema } from "./api";

export const traceContextSchema = z.strictObject({
  requestId: requestIdSchema,
  traceId: z.string().regex(/^[0-9a-f]{32}$/),
  spanId: z.string().regex(/^[0-9a-f]{16}$/),
});

export type TraceContext = z.infer<typeof traceContextSchema>;
