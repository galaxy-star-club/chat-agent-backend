import { describe, expect, it } from "vitest";
import { shortChatTitle, titleFromModelOutput } from "./chat-title";

describe("shortChatTitle", () => {
  it("keeps a few words from the model reply", () => {
    expect(shortChatTitle("  \"Say Hello.\"  ")).toBe("Say Hello");
    expect(shortChatTitle("Title: Say Hello")).toBe("Say Hello");
    expect(shortChatTitle("One two three four five six")).toBe("One two three four five");
    expect(shortChatTitle(" \n ")).toBeNull();
    expect(titleFromModelOutput("", "Buy milk reminder")).toBe("Buy milk reminder");
    expect(titleFromModelOutput("", "The user wants a long reminder about groceries today")).toBeNull();
  });
});
