import { afterEach, describe, expect, it, vi } from "vitest";
import { startMagicaModel } from "./magica.provider";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("startMagicaModel", () => {
  it("uses Magica's documented input envelope", async () => {
    vi.stubEnv("MAGICA_API_KEY", "test-key");
    vi.stubEnv("MAGICA_BASE_URL", "https://inference.magica.com");
    const fetchMock = vi.fn(async () => Response.json({ id: "run-1" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(startMagicaModel({ nodeType: "image-generation", subModelId: "example", input: { prompt: "Hello" } })).resolves.toEqual({ runId: "run-1" });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://inference.magica.com/v1/nodes/image-generation/run",
      expect.objectContaining({ body: JSON.stringify({ subModelId: "example", input: { prompt: "Hello" } }) }),
    );
  });
});
