import { z } from "zod";

const keysetCursorSchema = z.strictObject({
  createdAt: z.iso.datetime(),
  id: z.uuid(),
});

export type KeysetCursor = { createdAt: Date; id: string };

/** Encodes the full sort key so records sharing a timestamp paginate deterministically. */
export function encodeKeysetCursor(cursor: KeysetCursor): string {
  return Buffer.from(JSON.stringify({ createdAt: cursor.createdAt.toISOString(), id: cursor.id })).toString("base64url");
}

export function decodeKeysetCursor(value: string | undefined): KeysetCursor | undefined {
  if (!value) return undefined;
  try {
    const parsed = keysetCursorSchema.parse(JSON.parse(Buffer.from(value, "base64url").toString("utf8")));
    return { createdAt: new Date(parsed.createdAt), id: parsed.id };
  } catch {
    throw new InvalidCursorError();
  }
}

export class InvalidCursorError extends Error {
  constructor() {
    super("Invalid cursor.");
    this.name = "InvalidCursorError";
  }
}
