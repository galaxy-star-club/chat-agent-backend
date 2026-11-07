import { describe, expect, it } from "vitest";
import { getDatabaseUrl, getRuntimeDatabaseUrl } from "./config";

describe("database configuration", () => {
  it("accepts PostgreSQL connection URLs without changing them", () => {
    const value = "postgresql://user:secret@pooler.example/database?sslmode=require";
    expect(getDatabaseUrl({ NODE_ENV: "test", DATABASE_URL: `  ${value}  ` })).toBe(value);
  });

  it("uses the direct connection for interactive transactions when one is configured", () => {
    const pooled = "postgresql://user:secret@pooler.example/database?sslmode=require";
    const direct = "postgresql://user:secret@direct.example/database?sslmode=require";
    expect(getRuntimeDatabaseUrl({
      NODE_ENV: "test",
      DATABASE_URL: pooled,
      DATABASE_URL_UNPOOLED: direct,
    })).toBe(direct);
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
