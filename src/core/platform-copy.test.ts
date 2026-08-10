import { describe, expect, it } from "vitest";
import { createPlatformVariants } from "./platform-copy";

describe("跨平台文案版本", () => {
  it("生成三个平台并执行长度校验", () => {
    const variants = createPlatformVariants({ chinese: `${"一".repeat(300)} https://example.com` });
    expect(variants.map((item) => item.platform)).toEqual(["x", "linkedin", "threads"]);
    expect(variants[0].characterCount).toBeLessThanOrEqual(280);
    expect(variants[2].characterCount).toBeLessThanOrEqual(500);
    expect(variants[0].warnings).toContain("已按 280 字符限制截断，请人工润色。");
  });
});
