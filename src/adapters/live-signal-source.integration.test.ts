import { describe, expect, it } from "vitest";

import { createRssSignalSource } from "./live-signal-source";

describe("真实 Feed 集成", () => {
  it.skipIf(process.env.LIVE_FEED_TEST !== "1")(
    "通过 SafeFetch 读取 OpenAI 官方 RSS",
    async () => {
      const result = await createRssSignalSource({
        feeds: [{ name: "OpenAI News", url: "https://openai.com/news/rss.xml" }],
        timeoutMs: 20_000,
      }).collect({
        asOf: new Date().toISOString(),
        dataMode: "live_with_demo_fallback",
      });

      expect(result.mode).toBe("live");
      expect(result.warnings).toEqual([]);
      expect(result.signals.length).toBeGreaterThan(0);
      expect(result.signals.every((signal) => !signal.synthetic)).toBe(true);
    },
    30_000,
  );
});
