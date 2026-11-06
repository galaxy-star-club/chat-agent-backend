import { z } from "zod";

export const cursorSchema = z.string().min(1).max(512);

export const cursorPaginationQuerySchema = z.strictObject({
  cursor: cursorSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const cursorPageInfoSchema = z.strictObject({
  nextCursor: cursorSchema.nullable(),
  hasMore: z.boolean(),
});

export function cursorPageSchema<T extends z.ZodType>(item: T) {
  return z.strictObject({
    items: z.array(item),
    pageInfo: cursorPageInfoSchema,
  });
}

export type CursorPageInfo = z.infer<typeof cursorPageInfoSchema>;
