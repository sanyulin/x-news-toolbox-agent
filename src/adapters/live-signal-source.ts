import { createHash } from "node:crypto";

import type {
  RadarSignal,
  SignalCollection,
  SignalSource,
} from "@/core/creator-desk";
import { readXPosts } from "@/server/x-reader";

type CollectInput = Parameters<SignalSource["collect"]>[0];
type RssFeed = { name: string; url: string; mapping?: Record<string, string> };

export function createRssSignalSource({
  feeds,
  fetcher = fetch,
  timeoutMs = 8_000,
}: {
  feeds: RssFeed[];
  fetcher?: typeof fetch;
  timeoutMs?: number;
}) {
  return {
    async collect(input: CollectInput): Promise<SignalCollection> {
      const warnings: string[] = [];
      const batches = await Promise.all(
        feeds.map(async (feed) => {
          try {
            const response = await fetcher(feed.url, {
              headers: { accept: "application/json, application/atom+xml, application/rss+xml, application/xml, text/xml" },
              redirect: "error",
              signal: AbortSignal.timeout(timeoutMs),
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const body = await response.text();
            return response.headers.get("content-type")?.includes("json") ||
              /^[\s\r\n]*[\[{]/.test(body)
              ? parseJsonFeed(body, feed, input)
              : parseFeed(body, feed, input);
          } catch {
            warnings.push(`RSS 来源「${feed.name}」暂时不可用，已跳过`);
            return [];
          }
        }),
      );
      return {
        signals: batches.flat(),
        mode: "live",
        warnings,
      };
    },
  };
}

export function createXRecentSearchSignalSource({
  bearerToken,
  query,
  fetcher = fetch,
}: {
  bearerToken: string;
  query: string;
  fetcher?: typeof fetch;
}) {
  return {
    async collect(input: CollectInput): Promise<SignalCollection> {
      if (!bearerToken.trim()) {
        throw new Error("X 未配置官方 API Bearer Token");
      }
      const url = new URL("https://api.x.com/2/tweets/search/recent");
      url.searchParams.set("query", input.focus?.trim() || query);
      url.searchParams.set("max_results", "10");
      url.searchParams.set("tweet.fields", "created_at,author_id,public_metrics");
      url.searchParams.set("expansions", "author_id");
      url.searchParams.set("user.fields", "username,name");
      const response = await fetcher(url, {
        headers: { authorization: `Bearer ${bearerToken}` },
        signal: AbortSignal.timeout(8_000),
      });
      if (!response.ok) {
        throw new Error(`X 官方 API 返回 HTTP ${response.status}`);
      }
      const payload = (await response.json()) as XRecentSearchResponse;
      const users = new Map(
        (payload.includes?.users ?? []).map((user) => [user.id, user]),
      );
      const signals = (payload.data ?? []).map((post): RadarSignal => {
        const author = post.author_id ? users.get(post.author_id) : undefined;
        const sourceUrl = author?.username
          ? `https://x.com/${author.username}/status/${post.id}`
          : `https://x.com/i/web/status/${post.id}`;
        return {
          id: `x-${post.id}`,
          title: compact(post.text).slice(0, 120),
          summary: compact(post.text),
          sourceName: author?.username ? `@${author.username}` : "X",
          sourceUrl,
          canonicalUrl: sourceUrl,
          publishedAt: validDate(post.created_at, input.asOf),
          relevanceScore: relevance(post.text, input.focus),
          synthetic: false,
        };
      });
      return { signals, mode: "live", warnings: [] };
    },
  };
}

export function createXAccountSignalSource({
  bearerToken,
  handle,
}: {
  bearerToken: string;
  handle: string;
}) {
  return {
    async collect(input: CollectInput): Promise<SignalCollection> {
      const posts = await readXPosts(bearerToken, handle, { limit: 10 });
      return {
        mode: "live" as const,
        warnings: [],
        signals: posts.slice(0, 5).map((post): RadarSignal => {
          const sourceUrl = `https://x.com/${post.handle}/status/${post.id}`;
          return {
            id: `x-${post.id}`,
            title: compact(post.text).slice(0, 120),
            summary: compact(post.text),
            sourceName: `@${post.handle}`,
            sourceUrl,
            canonicalUrl: sourceUrl,
            publishedAt: validDate(post.createdAt, input.asOf),
            relevanceScore: relevance(post.text, input.focus),
            synthetic: false,
          };
        }),
      };
    },
  };
}

export function createConfiguredSignalSource({
  demoSource,
  rssFeeds,
  xBearerToken,
  xQuery = "AI -is:retweet",
  xAccounts = [],
  fetcher = fetch,
  fallbackToDemo = true,
}: {
  demoSource: SignalSource;
  rssFeeds: RssFeed[];
  xBearerToken?: string;
  xQuery?: string;
  xAccounts?: string[];
  fetcher?: typeof fetch;
  fallbackToDemo?: boolean;
}): SignalSource {
  return {
    async collect(input) {
      if (input.dataMode !== "live_with_demo_fallback") {
        return demoSource.collect(input);
      }

      const warnings: string[] = [];
      const liveSignals: RadarSignal[] = [];
      if (rssFeeds.length) {
        const rss = await createRssSignalSource({ feeds: rssFeeds, fetcher }).collect(input);
        liveSignals.push(...rss.signals);
        warnings.push(...rss.warnings);
      } else {
        warnings.push("未配置 RSS 来源，已跳过 RSS 读取");
      }

      if (xAccounts.length) {
        if (!xBearerToken?.trim()) {
          warnings.push("X 来源已启用，但尚未配置 X Bearer Token");
        } else {
          const batches = await Promise.all(
            xAccounts.map(async (handle) => {
              try {
                return await createXAccountSignalSource({ bearerToken: xBearerToken, handle }).collect(input);
              } catch (error) {
                warnings.push(`X 来源「@${handle.replace(/^@/, "")}」读取失败：${error instanceof Error ? error.message : "未知错误"}`);
                return undefined;
              }
            }),
          );
          for (const batch of batches) if (batch) liveSignals.push(...batch.signals);
        }
      }

      if (!fallbackToDemo) {
        if (liveSignals.length) {
          return { signals: uniqueSignals(liveSignals).slice(0, 20), mode: "live", warnings };
        }
        throw new Error(`没有读取到真实内容：${warnings.join("；")}`);
      }

      if (xBearerToken?.trim()) {
        try {
          const x = await createXRecentSearchSignalSource({
            bearerToken: xBearerToken,
            query: xQuery,
            fetcher,
          }).collect(input);
          liveSignals.push(...x.signals);
        } catch {
          warnings.push("X 官方 API 暂时不可用，已跳过 X 读取");
        }
      } else {
        warnings.push("X 未配置官方 API Bearer Token，已跳过 X 读取");
      }

      if (liveSignals.length) {
        return { signals: uniqueSignals(liveSignals).slice(0, 20), mode: "live", warnings };
      }
      const demo = await demoSource.collect({ ...input, dataMode: "demo_only" });
      const signals = Array.isArray(demo) ? demo : demo.signals;
      return {
        signals,
        mode: "demo",
        warnings: [
          ...warnings,
          "没有可用的真实信号，已回退到明确标记的演示数据",
        ],
      };
    },
  };
}

function parseFeed(xml: string, feed: RssFeed, input: CollectInput) {
  const blocks = [
    ...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi),
    ...xml.matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/gi),
  ].slice(0, 5);
  return blocks.flatMap((match): RadarSignal[] => {
    const block = match[1] ?? "";
    const title = clean(readTag(block, ["title"]));
    const summary = clean(
      readTag(block, ["description", "summary", "content"]),
    );
    const sourceUrl = clean(readTag(block, ["link"])) || atomLink(block);
    if (!title || !sourceUrl) return [];
    const canonicalUrl = canonicalize(sourceUrl);
    const publishedAt = validDate(
      clean(readTag(block, ["pubDate", "published", "updated"])),
      input.asOf,
    );
    return [
      {
        id: `rss-${hash(canonicalUrl)}`,
        title,
        summary: summary || title,
        sourceName: feed.name,
        sourceUrl,
        canonicalUrl,
        publishedAt,
        relevanceScore: relevance(`${title} ${summary}`, input.focus),
        synthetic: false,
      },
    ];
  });
}

function parseJsonFeed(body: string, feed: RssFeed, input: CollectInput) {
  const payload = JSON.parse(body) as unknown;
  const record = isRecord(payload) ? payload : undefined;
  const items = Array.isArray(payload)
    ? payload
    : [record?.items, record?.data, record?.results, record?.articles, record?.posts]
        .find(Array.isArray) ?? [];
  return items.slice(0, 5).flatMap((item): RadarSignal[] => {
    if (!isRecord(item)) return [];
    const title = readString(item, mappedKeys(feed.mapping?.title, ["title", "headline", "name"]));
    const sourceUrl = readString(item, mappedKeys(feed.mapping?.url, ["url", "link", "sourceUrl"]));
    if (!title || !sourceUrl) return [];
    const summary = readString(item, mappedKeys(feed.mapping?.summary, ["summary", "description", "content", "text"]));
    const publishedAt = readString(item, mappedKeys(feed.mapping?.publishedAt, [
      "publishedAt",
      "published_at",
      "published",
      "createdAt",
      "created_at",
      "date",
    ]));
    const canonicalUrl = canonicalize(sourceUrl);
    return [{
      id: `api-${hash(canonicalUrl)}`,
      title: compact(title),
      summary: compact(summary || title),
      sourceName: feed.name,
      sourceUrl,
      canonicalUrl,
      publishedAt: validDate(publishedAt, input.asOf),
      relevanceScore: relevance(`${title} ${summary}`, input.focus),
      synthetic: false,
    }];
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    if (typeof record[key] === "string") return record[key];
  }
  return "";
}

function mappedKeys(mapped: string | undefined, fallback: string[]) {
  return mapped?.trim() ? [mapped.trim(), ...fallback] : fallback;
}

function readTag(block: string, names: string[]) {
  for (const name of names) {
    const match = block.match(
      new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)<\\/${name}>`, "i"),
    );
    if (match?.[1]) return match[1];
  }
  return "";
}

function atomLink(block: string) {
  return block.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*\/?\s*>/i)?.[1] ?? "";
}

function clean(value: string) {
  return decodeEntities(
    value.replace(/^<!\[CDATA\[|\]\]>$/g, "").replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

function decodeEntities(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'");
}

function canonicalize(value: string) {
  try {
    const url = new URL(value);
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (key.startsWith("utm_")) url.searchParams.delete(key);
    }
    return url.toString();
  } catch {
    return value;
  }
}

function validDate(value: string | undefined, fallback: string) {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
}

function relevance(text: string, focus?: string) {
  const terms = (focus ?? "")
    .toLocaleLowerCase()
    .split(/\s+/)
    .filter((term) => term.length > 1);
  const haystack = text.toLocaleLowerCase();
  const matches = terms.filter((term) => haystack.includes(term)).length;
  return Math.min(0.95, 0.65 + matches * 0.08);
}

function compact(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function uniqueSignals(signals: RadarSignal[]) {
  return [...new Map(signals.map((signal) => [signal.canonicalUrl, signal])).values()];
}

type XRecentSearchResponse = {
  data?: Array<{
    id: string;
    text: string;
    created_at?: string;
    author_id?: string;
  }>;
  includes?: {
    users?: Array<{ id: string; username?: string; name?: string }>;
  };
};
