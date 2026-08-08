import { describe, expect, it } from "vitest";

import { resolveDatabasePath } from "./create-app-desk";

describe("应用数据库路径", () => {
  it("环境变量留空时使用项目默认数据库", () => {
    expect(resolveDatabasePath("", "C:\\project")).toBe(
      "C:\\project\\data\\creator-mind.sqlite",
    );
  });
});
