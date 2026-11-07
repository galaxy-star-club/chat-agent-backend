import { describe, expect, it } from "vitest";
import { triggerDispatchConfigured } from "./trigger-dispatch";

describe("triggerDispatchConfigured", () => {
  it("keeps production on the fallback until dispatch is explicitly enabled", () => {
    expect(triggerDispatchConfigured({ NODE_ENV: "production", TRIGGER_SECRET_KEY: "key" })).toBe(false);
    expect(triggerDispatchConfigured({ NODE_ENV: "production", TRIGGER_SECRET_KEY: "key", TRIGGER_DISPATCH_ENABLED: "true" })).toBe(true);
    expect(triggerDispatchConfigured({ NODE_ENV: "development", TRIGGER_SECRET_KEY: "key" })).toBe(true);
  });
});
