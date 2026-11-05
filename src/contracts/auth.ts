import { z } from "zod";

export const currentSessionResponseSchema = z.strictObject({
  userId: z.string().min(1),
  sessionId: z.string().min(1),
});

export type CurrentSessionResponse = z.infer<typeof currentSessionResponseSchema>;
