import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it } from "vitest";

import {
  getEffectiveRuntimeConfig,
  getPublicRuntimeConfig,
  loadRuntimeConfig,
  saveRuntimeConfig,
  sourceCredentialHeaders,
} from "./runtime-config";

const configPath = join(tmpdir(), `creator-mind-${crypto.randomUUID()}.json`);

describe("runtime config", () => {
  afterEach(() => {
    if (existsSync(configPath)) rmSync(configPath);
  });

  it("保存便携配置，但公开视图永不返回 API Key", () => {
    saveRuntimeConfig(
      {
        builderApiKey: "secret-builder-key",
        mindId: "mind-123",
        xBearerToken: "secret-x-key",
        conversationAlias: "creator-main",
        defaultSourceUrl: "https://example.com/feed.xml",
        sourceCredentials: {
          "source-json": { type: "api-key", secret: "secret-source-key" },
        },
        horizon: {
          enabled: true,
          provider: "deepseek",
          model: "legacy-invalid-model",
          apiKey: "secret-horizon-key",
          hours: 24,
          threshold: 7,
          hackerNews: true,
          ossInsight: false,
          enrich: true,
        },
      },
      configPath,
    );

    expect(loadRuntimeConfig(configPath).builderApiKey).toBe(
      "secret-builder-key",
    );
    expect(getPublicRuntimeConfig(configPath, {})).toEqual({
      apiKeyConfigured: true,
      xApiKeyConfigured: true,
      mindId: "mind-123",
      conversationAlias: "creator-main",
      defaultSourceUrl: "https://example.com/feed.xml",
      horizon: {
        enabled: true,
        provider: "deepseek",
        model: "deepseek-v4-flash",
        baseUrl: undefined,
        azureEndpoint: undefined,
        hours: 24,
        threshold: 7,
        hackerNews: true,
        ossInsight: false,
        enrich: true,
        apiKeyConfigured: true,
      },
    });
    expect(JSON.stringify(getPublicRuntimeConfig(configPath, {}))).not.toContain(
      "secret-builder-key",
    );
    expect(JSON.stringify(getPublicRuntimeConfig(configPath, {}))).not.toContain(
      "secret-x-key",
    );
    expect(JSON.stringify(getPublicRuntimeConfig(configPath, {}))).not.toContain(
      "secret-source-key",
    );
    expect(JSON.stringify(getPublicRuntimeConfig(configPath, {}))).not.toContain(
      "secret-horizon-key",
    );
    expect(sourceCredentialHeaders(loadRuntimeConfig(configPath), "source-json")).toEqual({
      "x-api-key": "secret-source-key",
    });
  });

  it("便携版首次启动忽略宿主机环境变量", () => {
    expect(
      getEffectiveRuntimeConfig(configPath, {
        CREATOR_MIND_PORTABLE: "1",
        MINDS_BUILDER_API_KEY: "host-builder-key",
        MINDS_MIND_ID: "host-mind",
        X_BEARER_TOKEN: "host-x-key",
        CREATOR_MIND_RSS_FEEDS: "Host|https://example.com/feed.xml",
      }),
    ).toEqual({
      builderApiKey: undefined,
      mindId: undefined,
      xBearerToken: undefined,
      xQuery: undefined,
      conversationAlias: "creator-main",
      defaultSourceUrl: undefined,
      sourceCredentials: undefined,
      horizon: undefined,
    });
  });

  it("部署环境可以提供 Horizon 配置但公开状态不回显密钥", () => {
    const config = getEffectiveRuntimeConfig(configPath, {
      HORIZON_ENABLED: "true",
      HORIZON_PROVIDER: "deepseek",
      HORIZON_API_KEY: "secret-horizon-key",
      HORIZON_HOURS: "12",
      HORIZON_THRESHOLD: "8",
      HORIZON_OSS_INSIGHT: "true",
    });

    expect(config.horizon).toMatchObject({
      enabled: true,
      provider: "deepseek",
      model: "deepseek-v4-flash",
      apiKey: "secret-horizon-key",
      hours: 12,
      threshold: 8,
      ossInsight: true,
    });
    expect(JSON.stringify(getPublicRuntimeConfig(configPath, {
      HORIZON_PROVIDER: "deepseek",
      HORIZON_API_KEY: "secret-horizon-key",
    }))).not.toContain("secret-horizon-key");
  });
});
