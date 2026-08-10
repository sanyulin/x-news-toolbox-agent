import { describe, expect, it, vi } from "vitest";

import { safeFetch, type SafeFetchOptions } from "./safe-fetch";

type Requester = NonNullable<SafeFetchOptions["requester"]>;

describe("SafeFetch", () => {
  it("每一跳重新解析并在跨站重定向时移除敏感头", async () => {
    const resolver = vi.fn(async (hostname: string) =>
      hostname === "feed.example.com" ? ["93.184.216.34"] : ["140.82.121.3"],
    );
    const requests: Array<{ url: string; authorization: string | null; apiKey: string | null; hasDispatcher: boolean }> = [];
    const requester = vi.fn(async (input, init) => {
      requests.push({
        url: String(input),
        authorization: new Headers(init.headers).get("authorization"),
        apiKey: new Headers(init.headers).get("x-api-key"),
        hasDispatcher: Boolean(init.dispatcher),
      });
      return requests.length === 1
        ? new Response(null, { status: 302, headers: { location: "https://cdn.example.net/feed.xml" } })
        : new Response("<rss />", { status: 200 });
    }) as Requester;

    const response = await safeFetch(
      "https://feed.example.com/start",
      { headers: { authorization: "Bearer secret", "x-api-key": "source-secret" } },
      { resolver, requester },
    );

    expect(await response.text()).toBe("<rss />");
    expect(resolver).toHaveBeenCalledTimes(2);
    expect(requests).toEqual([
      { url: "https://feed.example.com/start", authorization: "Bearer secret", apiKey: "source-secret", hasDispatcher: true },
      { url: "https://cdn.example.net/feed.xml", authorization: null, apiKey: null, hasDispatcher: true },
    ]);
  });

  it("在请求发生前拒绝非公网解析结果", async () => {
    const requester = vi.fn() as unknown as Requester;

    await expect(
      safeFetch("https://feed.example.com/rss", {}, {
        resolver: async () => ["127.0.0.1"],
        requester,
      }),
    ).rejects.toThrow("未解析到安全的公网地址");
    expect(requester).not.toHaveBeenCalled();
  });

  it("拒绝超过大小上限的响应", async () => {
    await expect(
      safeFetch("https://feed.example.com/rss", {}, {
        maxBytes: 4,
        resolver: async () => ["93.184.216.34"],
        requester: (async () => new Response("12345")) as Requester,
      }),
    ).rejects.toThrow("来源响应内容过大");
  });
});
