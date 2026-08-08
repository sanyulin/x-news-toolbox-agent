import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it } from "vitest";

import {
  getEffectiveRuntimeConfig,
  getPublicRuntimeConfig,
  loadRuntimeConfig,
  saveRuntimeConfig,
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
    });
    expect(JSON.stringify(getPublicRuntimeConfig(configPath, {}))).not.toContain(
      "secret-builder-key",
    );
    expect(JSON.stringify(getPublicRuntimeConfig(configPath, {}))).not.toContain(
      "secret-x-key",
    );
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
    });
  });
});
