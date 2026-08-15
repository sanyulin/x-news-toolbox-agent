import { describe, expect, it } from "vitest";

import { createHorizonConfig, HORIZON_COMMIT, mapHorizonItems, resolveHorizonProfile } from "./horizon-contract";

describe("Horizon contract", () => {
  it("projects enabled RSS and built-in sources without writing the API key", () => {
    const config = createHorizonConfig({
      enabled: true,
      provider: "deepseek",
      model: "deepseek-chat",
      apiKey: "must-not-leak",
      hours: 24,
      threshold: 7,
      hackerNews: true,
      ossInsight: true,
      enrich: false,
    }, [{
      id: "source-rss",
      type: "rss",
      name: "OpenAI",
      locator: "https://openai.com/news/rss.xml",
      enabled: true,
      lastStatus: "ready",
      createdAt: "2026-08-10T00:00:00.000Z",
      updatedAt: "2026-08-10T00:00:00.000Z",
    }]);

    expect(config.sources.rss).toEqual([{
      name: "OpenAI",
      url: "https://openai.com/news/rss.xml",
      enabled: true,
      profile: "tech-news",
    }]);
    expect(config.sources.hackernews.enabled).toBe(true);
    expect(config.sources.ossinsight.enabled).toBe(true);
    expect(config.sources.ossinsight.period).toBe("past_month");
    expect(config.sources.reddit.enabled).toBe(false);
    expect(config.sources.telegram.enabled).toBe(false);
    expect(config.sources.twitter).toBeNull();
    expect(config.digest.profile_order).toEqual(["tech-news", "tech-blog", "finance-news", "ai-creator"]);
    expect(JSON.stringify(config)).not.toContain("must-not-leak");
  });

  it("maps only valid structured items into real RadarSignal values", () => {
    expect(mapHorizonItems([{
      id: "hackernews:story:42",
      source_type: "hackernews",
      title: "AI systems move into production",
      url: "https://example.com/story?utm_source=hn",
      content: "raw text",
      published_at: "2026-08-10T05:00:00Z",
      metadata: {},
      ai_score: 8.4,
      ai_reason: "Strong creator relevance",
      ai_summary: "A real summary",
      ai_tags: ["AI"],
    }, { broken: true }])).toEqual([expect.objectContaining({
      id: "horizon-hackernews:story:42",
      sourceName: "Hacker News",
      canonicalUrl: "https://example.com/story",
      relevanceScore: 0.8400000000000001,
      synthetic: false,
      engine: expect.objectContaining({ version: HORIZON_COMMIT, score: 8.4 }),
    })]);
  });

  it("uses the local fitness profile when the scan focus is fitness-related", () => {
    const config = createHorizonConfig({
      enabled: true,
      provider: "deepseek",
      model: "deepseek-chat",
      apiKey: "must-not-leak",
      hours: 72,
      threshold: 7,
      hackerNews: true,
      ossInsight: true,
      enrich: true,
    }, [{
      id: "source-fitness",
      type: "rss",
      name: "The Guardian Fitness",
      locator: "https://www.theguardian.com/lifeandstyle/fitness/rss",
      enabled: true,
      lastStatus: "ready",
      createdAt: "2026-08-10T00:00:00.000Z",
      updatedAt: "2026-08-10T00:00:00.000Z",
    }], "Fitness trends for busy adults: strength, mobility, recovery, and fat loss");

    expect(resolveHorizonProfile("健身与力量训练")).toBe("fitness");
    expect(config.processing.default_profile).toBe("fitness");
    expect(config.processing.profiles_dir).toContain("config\\horizon\\profiles");
    expect(config.sources.rss).toEqual([expect.objectContaining({ profile: "fitness" })]);
    expect(config.sources.hackernews.profile).toBe("auto");
    expect(config.sources.ossinsight.profile).toBe("auto");
    expect(config.digest.profile_order).toEqual(["fitness"]);
    expect(JSON.stringify(config)).not.toContain("must-not-leak");
  });
});
