import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ queryRaw: vi.fn() }));

vi.mock("@/lib/database.server", () => ({
  getPrisma: () => ({ $queryRaw: mocks.queryRaw }),
}));

import { readDatabaseReadiness } from "./database-readiness.repository";

describe("database readiness repository", () => {
  beforeEach(() => mocks.queryRaw.mockReset());

  it("runs only a parameter-free SELECT 1", async () => {
    mocks.queryRaw.mockResolvedValue([{ "?column?": 1 }]);
    await readDatabaseReadiness();
    expect(mocks.queryRaw).toHaveBeenCalledOnce();
    expect(mocks.queryRaw.mock.calls[0]).toEqual([["SELECT 1"]]);
  });
});
