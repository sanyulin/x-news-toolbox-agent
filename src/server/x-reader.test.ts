import { describe, expect, it } from "vitest";

import { normalizeXHandle } from "@/server/x-reader";

describe("normalizeXHandle", () => {
  it.each([
    ["@OpenAI", "OpenAI"],
    ["https://x.com/OpenAI", "OpenAI"],
    ["https://www.x.com/OpenAI/status/1", "OpenAI"],
  ])("normalizes %s", (input, expected) => {
    expect(normalizeXHandle(input)).toBe(expected);
  });
});
