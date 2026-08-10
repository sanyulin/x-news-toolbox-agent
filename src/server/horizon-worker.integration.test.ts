import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { createHorizonConfig } from "@/server/horizon-contract";
import { createHorizonMcpClient, type HorizonToolClient } from "@/server/horizon-worker";
import type { HorizonRuntimeConfig } from "@/server/runtime-config";

const run = process.env.RUN_HORIZON_INTEGRATION === "1" ? describe : describe.skip;
const settings: HorizonRuntimeConfig = {
  enabled: true,
  provider: "ollama",
  model: "integration-no-ai",
  hours: 168,
  threshold: 7,
  hackerNews: true,
  ossInsight: true,
  enrich: false,
};
let client: HorizonToolClient | undefined;

run("Horizon 固定版本真实数据验收", () => {
  afterAll(async () => client?.close());

  it("通过 stdio MCP 校验配置并读取 Hacker News 真实条目", async () => {
    const directory = join(process.cwd(), "data", "horizon");
    const configPath = join(directory, "integration-config.json");
    mkdirSync(directory, { recursive: true });
    writeFileSync(configPath, `${JSON.stringify(createHorizonConfig(settings, [{
      id: "integration-rss",
      type: "rss",
      name: "GitHub Changelog",
      locator: "https://github.blog/changelog/feed/",
      enabled: true,
      lastStatus: "ready",
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
    }]), null, 2)}\n`, "utf8");

    client = await createHorizonMcpClient(settings);
    const validation = await client.call("hz_validate_config", { config_path: configPath, check_env: false });
    expect(validation.missing_env).toEqual([]);
    expect(validation.enabled_sources).toContain("hackernews");
    expect(validation.enabled_sources).toContain("rss");
    expect(validation.enabled_sources).toContain("ossinsight");
    expect(validation.enabled_sources).not.toContain("reddit");
    expect(validation.enabled_sources).not.toContain("telegram");

    const fetched = await client.call("hz_fetch_items", { config_path: configPath, hours: 168 });
    expect(typeof fetched.run_id).toBe("string");
    expect(Number(fetched.fetched)).toBeGreaterThan(0);
    expect(fetched.source_counts).toEqual(expect.objectContaining({
      hackernews: expect.any(Number),
      rss: expect.any(Number),
      ossinsight: expect.any(Number),
    }));

    const raw = await client.call("hz_get_run_stage", { run_id: fetched.run_id, stage: "raw", max_items: 3 });
    expect(Array.isArray(raw.items)).toBe(true);
    expect((raw.items as unknown[]).length).toBeGreaterThan(0);
  }, 120_000);
});
