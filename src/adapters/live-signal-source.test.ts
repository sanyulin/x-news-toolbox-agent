import { describe, expect, it, vi } from "vitest";

import {
  createConfiguredSignalSource,
  createRssSignalSource,
  createXRecentSearchSignalSource,
} from "./live-signal-source";

const rssFixture = `<?xml version="1.0"?>
<rss><channel><item>
  <title>AI 团队开始衡量交付结果</title>
  <link>https://example.com/posts/ai-results?utm_source=rss</link>
  <description><![CDATA[团队不再只统计工具采用率。]]></description>
  <pubDate>Wed, 05 Aug 2026 03:00:00 GMT</pubDate>
</item></channel></rss>`;

describe("真实信号 Adapter", () => {
  it("单个 RSS 失败时保留其他结果并产生中文警告", async () => {
    const source = createRssSignalSource({
      feeds: [
        { name: "可用源", url: "https://example.com/feed.xml" },
        { name: "故障源", url: "https://bad.example.com/feed.xml" },
      ],
      fetcher: vi.fn(async (url: string | URL | Request) => {
        if (String(url).includes("bad.example.com")) {
          throw new Error("network down");
        }
        return new Response(rssFixture, { status: 200 });
      }) as typeof fetch,
    });

    await expect(
      source.collect({
        asOf: "2026-08-05T04:00:00.000Z",
        focus: "AI 交付",
        dataMode: "live_with_demo_fallback",
      }),
    ).resolves.toMatchObject({
      mode: "live",
      warnings: ["RSS 来源「故障源」暂时不可用，已跳过"],
      signals: [
        {
          title: "AI 团队开始衡量交付结果",
          summary: "团队不再只统计工具采用率。",
          sourceName: "可用源",
          canonicalUrl: "https://example.com/posts/ai-results",
          synthetic: false,
        },
      ],
    });
  });

  it("读取常见 JSON API 的内容列表", async () => {
    const source = createRssSignalSource({
      feeds: [{ name: "内容 API", url: "https://example.com/api/posts" }],
      fetcher: vi.fn(async () =>
        new Response(
          JSON.stringify({
            items: [
              {
                title: "Agent 产品开始进入真实工作流",
                url: "https://example.com/posts/agent-workflow",
                summary: "团队开始记录 Agent 的来源、判断和执行结果。",
                publishedAt: "2026-08-05T03:00:00.000Z",
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      ) as typeof fetch,
    });

    await expect(
      source.collect({
        asOf: "2026-08-05T04:00:00.000Z",
        focus: "Agent 工作流",
        dataMode: "live_with_demo_fallback",
      }),
    ).resolves.toMatchObject({
      mode: "live",
      signals: [
        {
          title: "Agent 产品开始进入真实工作流",
          sourceName: "内容 API",
          sourceUrl: "https://example.com/posts/agent-workflow",
          synthetic: false,
        },
      ],
    });
  });

  it("只通过 X 官方 recent search API 读取公开帖子", async () => {
    const fetcher = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      new Response(
        JSON.stringify({
          data: [
            {
              id: "123",
              text: "AI 创作者需要展示证据边界",
              created_at: "2026-08-05T03:00:00.000Z",
              author_id: "u1",
            },
          ],
          includes: { users: [{ id: "u1", username: "creator" }] },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const source = createXRecentSearchSignalSource({
      bearerToken: "test-token",
      query: "AI creator",
      fetcher: fetcher as typeof fetch,
    });

    const result = await source.collect({ asOf: "2026-08-05T04:00:00.000Z" });

    expect(fetcher).toHaveBeenCalledOnce();
    expect(String(fetcher.mock.calls[0]?.[0])).toContain(
      "https://api.x.com/2/tweets/search/recent",
    );
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({
      headers: { authorization: "Bearer test-token" },
    });
    expect(result.signals[0]).toMatchObject({
      sourceName: "@creator",
      sourceUrl: "https://x.com/creator/status/123",
      synthetic: false,
    });
  });

  it("X 无凭证且没有可用 RSS 时回退到明确标记的演示数据", async () => {
    const source = createConfiguredSignalSource({
      demoSource: {
        collect: async () => [
          {
            id: "demo-1",
            title: "演示信号",
            summary: "演示摘要",
            sourceName: "演示来源",
            sourceUrl: "https://example.com/demo",
            canonicalUrl: "https://example.com/demo",
            publishedAt: "2026-08-05T03:00:00.000Z",
            relevanceScore: 0.8,
            synthetic: true,
          },
        ],
      },
      rssFeeds: [],
    });

    await expect(
      source.collect({
        asOf: "2026-08-05T04:00:00.000Z",
        dataMode: "live_with_demo_fallback",
      }),
    ).resolves.toMatchObject({
      mode: "demo",
      warnings: expect.arrayContaining([
        "X 未配置官方 API Bearer Token，已跳过 X 读取",
        "没有可用的真实信号，已回退到明确标记的演示数据",
      ]),
      signals: [{ synthetic: true }],
    });
  });

  it("显式来源不可用时拒绝用演示数据冒充真实结果", async () => {
    const source = createConfiguredSignalSource({
      demoSource: {
        collect: vi.fn(async () => []),
      },
      rssFeeds: [{ name: "用户来源", url: "https://bad.example.com/feed.xml" }],
      fetcher: vi.fn(async () => {
        throw new Error("network down");
      }) as typeof fetch,
      fallbackToDemo: false,
    });

    await expect(
      source.collect({
        asOf: "2026-08-05T04:00:00.000Z",
        dataMode: "live_with_demo_fallback",
      }),
    ).rejects.toThrow("没有读取到真实内容");
  });
});
