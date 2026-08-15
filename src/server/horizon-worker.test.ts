import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it, vi } from "vitest";

import { collectHorizonSignals, horizonToolTimeout, isUsefulDiagnostic, probeHorizonAi, type HorizonStage, type HorizonToolClient } from "./horizon-worker";

const configPath = join(tmpdir(), `horizon-config-${crypto.randomUUID()}.json`);

afterEach(() => {
  if (existsSync(configPath)) unlinkSync(configPath);
});

describe("Horizon worker pipeline", () => {
  it("过滤 Python 源码片段，但保留可行动的 worker 诊断", () => {
    expect(isUsefulDiagnostic("[本机路径] warnings.warn(")).toBe(false);
    expect(isUsefulDiagnostic("HTTP 429 rate limit")).toBe(true);
    expect(isUsefulDiagnostic("")).toBe(false);
  });

  it("为 AI 阶段提供足够等待时间", () => {
    expect(horizonToolTimeout("hz_score_items")).toBe(300_000);
    expect(horizonToolTimeout("hz_enrich_items")).toBe(300_000);
    expect(horizonToolTimeout("hz_validate_config")).toBe(120_000);
  });

  it("使用默认模型发送最小真实验证请求", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: "OK" } }] }), { status: 200 }));
    await probeHorizonAi({
      enabled: true,
      provider: "deepseek",
      model: "deepseek-v4-flash",
      apiKey: "secret-key",
      hours: 24,
      threshold: 7,
      hackerNews: true,
      ossInsight: false,
      enrich: false,
    }, fetcher);

    expect(fetcher).toHaveBeenCalledWith("https://api.deepseek.com/chat/completions", expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({ authorization: "Bearer secret-key" }),
    }));
    expect(String(fetcher.mock.calls[0][1].body)).toContain('"model":"deepseek-v4-flash"');
  });

  it("runs staged MCP tools, reports progress and never writes the secret to config", async () => {
    const calls: string[] = [];
    const client: HorizonToolClient = {
      async call(name) {
        calls.push(name);
        if (name === "hz_validate_config") return { missing_env: [], warnings: [] };
        if (name === "hz_fetch_items") return { run_id: "run-1" };
        if (name === "hz_get_run_stage") return { items: [{
          id: "rss:item:1",
          source_type: "rss",
          title: "Real item",
          url: "https://example.com/item",
          content: "Evidence",
          published_at: "2026-08-10T05:00:00Z",
          metadata: { feed_name: "Example" },
          ai_score: 8,
        }] };
        return {};
      },
      diagnostics: () => [],
      close: vi.fn().mockResolvedValue(undefined),
    };
    const stages: HorizonStage[] = [];

    const result = await collectHorizonSignals({
      settings: {
        enabled: true,
        provider: "deepseek",
        model: "deepseek-chat",
        apiKey: "secret-key",
        hours: 24,
        threshold: 7,
        hackerNews: true,
        ossInsight: false,
        enrich: false,
      },
      sources: [],
      client,
      configPath,
      progress: (stage) => { stages.push(stage); },
    });

    expect(calls).toEqual(["hz_validate_config", "hz_fetch_items", "hz_score_items", "hz_filter_items", "hz_get_run_stage"]);
    expect(stages).toEqual(["validating", "fetching", "scoring", "filtering", "reading"]);
    expect(result.signals[0]).toMatchObject({ sourceName: "Example", synthetic: false });
    expect(readFileSync(configPath, "utf8")).not.toContain("secret-key");
    expect(client.close).toHaveBeenCalledOnce();
  });
});
