import { describe, expect, it } from "vitest";
import { createPlatformVariants } from "./platform-copy";

describe("跨平台文案版本", () => {
  it("保留旧平台版本但禁止硬截断", () => {
    const variants = createPlatformVariants({ chinese: `${"一".repeat(300)} https://example.com` });
    expect(variants.map((item) => item.platform)).toEqual(["x", "linkedin", "threads"]);
    expect(variants[0].characterCount).toBeGreaterThan(280);
    expect(variants[2].characterCount).toBeLessThanOrEqual(500);
    expect(variants[0].warnings).toContain("超过 280 字符，必须重新生成，禁止硬截断。");
    expect(variants[0].text).toContain("https://example.com");
  });
});
