import { z } from "zod";

import type { RadarSignal } from "@/core/creator-desk";
import type { HorizonRuntimeConfig } from "@/server/runtime-config";
import type { SourceRecord } from "@/server/workspace-data";

export const HORIZON_COMMIT = "80bde6db03008678111fb627b471792c7ac05a94";

const itemSchema = z.object({
  id: z.string(),
  source_type: z.string(),
  title: z.string(),
  url: z.string().url(),
  content: z.string().nullish(),
  published_at: z.string(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  ai_score: z.number().min(0).max(10).nullish(),
  ai_reason: z.string().nullish(),
  ai_summary: z.string().nullish(),
  ai_tags: z.array(z.string()).optional(),
});

export function createHorizonConfig(settings: HorizonRuntimeConfig, sources: SourceRecord[]) {
  if (!settings.provider || !settings.model) throw new Error("请先配置 Horizon AI 服务商和模型");
  const rss = sources
    .filter((source) => source.enabled && ["rss", "atom", "rsshub"].includes(source.type))
    .map((source) => ({
      name: source.name,
      url: source.locator,
      enabled: true,
      profile: "tech-news",
    }));

  return {
    ai: {
      provider: settings.provider,
      model: settings.model,
      api_key_env: "HORIZON_AI_API_KEY",
      ...(settings.baseUrl ? { base_url: settings.baseUrl } : {}),
      ...(settings.provider === "azure"
        ? { azure_endpoint_env: "HORIZON_AZURE_ENDPOINT", api_version: "2024-10-21" }
        : {}),
      temperature: 0.3,
      max_tokens: 4096,
      throttle_sec: 0,
      analysis_concurrency: 1,
      enrichment_concurrency: 1,
      languages: ["zh", "en"],
    },
    processing: {
      profiles_dir: "profiles",
      default_profile: "tech-news",
      profile_settings: {
        "tech-news": { threshold: settings.threshold, topic_dedup: true },
      },
    },
    display: { icon_style: "ascii" },
    sources: {
      github: [],
      rss,
      hackernews: {
        enabled: settings.hackerNews,
        fetch_top_stories: 20,
        min_score: 50,
        profile: "tech-news",
      },
      ossinsight: {
        enabled: settings.ossInsight,
        period: "past_month",
        languages: ["All", "Python", "TypeScript"],
        keywords: [],
        min_stars: 10,
        max_items: 30,
        profile: "tech-news",
      },
      reddit: { enabled: false, subreddits: [], users: [], fetch_comments: 0 },
      telegram: { enabled: false, channels: [] },
      twitter: null,
      openbb: null,
      gdelt: null,
      google_news: null,
    },
    collection: { time_window_hours: settings.hours },
    digest: {
      max_items: 20,
      profile_order: ["tech-news", "tech-blog", "finance-news", "ai-creator"],
      category_groups: {},
      default_group: "other",
      default_group_limit: null,
    },
  };
}

export function mapHorizonItems(items: unknown[]): RadarSignal[] {
  return items.flatMap((candidate): RadarSignal[] => {
    const parsed = itemSchema.safeParse(candidate);
    if (!parsed.success) return [];
    const item = parsed.data;
    const url = canonicalize(item.url);
    const score = item.ai_score ?? undefined;
    return [{
      id: `horizon-${item.id}`,
      title: compact(item.title),
      summary: compact(item.ai_summary || item.content || item.title).slice(0, 1_500),
      sourceName: sourceName(item.source_type, item.metadata),
      sourceUrl: item.url,
      canonicalUrl: url,
      publishedAt: validDate(item.published_at),
      relevanceScore: score === undefined ? 0.5 : Math.max(0, Math.min(1, score / 10)),
      synthetic: false,
      engine: {
        name: "horizon",
        version: HORIZON_COMMIT,
        score,
        reason: item.ai_reason ?? undefined,
        tags: item.ai_tags,
      },
    }];
  });
}

function sourceName(type: string, metadata?: Record<string, unknown>) {
  for (const key of ["source_name", "feed_name", "subreddit", "channel", "repository"]) {
    if (typeof metadata?.[key] === "string" && metadata[key]) return String(metadata[key]);
  }
  return ({
    hackernews: "Hacker News",
    rss: "RSS",
    ossinsight: "OSS Insight",
    github: "GitHub",
    reddit: "Reddit",
    telegram: "Telegram",
    gdelt: "GDELT",
    google_news: "Google News",
  } as Record<string, string>)[type] ?? type;
}

function canonicalize(value: string) {
  const url = new URL(value);
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) if (key.startsWith("utm_")) url.searchParams.delete(key);
  return url.toString();
}

function compact(value: string) {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function validDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date(0).toISOString() : date.toISOString();
}
