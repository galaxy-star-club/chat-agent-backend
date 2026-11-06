import { describe, expect, it } from "vitest";
import { getDatabaseUrl } from "./config";

describe("database configuration", () => {
  it("accepts PostgreSQL connection URLs without changing them", () => {
    const value = "postgresql://user:secret@pooler.example/database?sslmode=require";
    expect(getDatabaseUrl({ NODE_ENV: "test", DATABASE_URL: `  ${value}  ` })).toBe(value);
  });

  it.each([
    undefined,
    "",
    "not-a-url",
    "https://example/database",
    "postgresql://pooler.example/",
  ])("rejects missing or invalid runtime configuration %s", (value) => {
    expect(getDatabaseUrl({ NODE_ENV: "test", DATABASE_URL: value })).toBeNull();
  });
});
