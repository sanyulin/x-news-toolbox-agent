import { beforeEach, describe, expect, it, vi } from "vitest";

const { inspectMock, loadMock, saveMock } = vi.hoisted(() => ({
  inspectMock: vi.fn(),
  loadMock: vi.fn(),
  saveMock: vi.fn(),
}));

vi.mock("@/adapters/minds-mind-authority", () => ({
  createMindsMindAuthority: vi.fn(() => ({ inspect: inspectMock })),
}));

vi.mock("@/server/network-address", () => ({
  isPublicHttpsUrl: (value: string) => value.startsWith("https://"),
  resolvesToPublicAddress: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/server/runtime-config", () => ({
  getEffectiveRuntimeConfig: loadMock,
  saveRuntimeConfig: saveMock,
  toPublicRuntimeConfig: (config: Record<string, string>) => ({
    apiKeyConfigured: Boolean(config.builderApiKey),
    xApiKeyConfigured: Boolean(config.xBearerToken),
    mindId: config.mindId || null,
    conversationAlias: config.conversationAlias || "creator-main",
    defaultSourceUrl: config.defaultSourceUrl || null,
  }),
}));

import { GET, POST } from "./route";

describe("/api/config", () => {
  beforeEach(() => {
    loadMock.mockReset().mockReturnValue({
      builderApiKey: "stored-secret",
      xBearerToken: "stored-x-secret",
      mindId: "stored-mind",
      conversationAlias: "creator-main",
    });
    saveMock.mockReset();
    inspectMock.mockReset().mockResolvedValue({
      state: "connected",
      mind: { id: "resolved-mind", name: "贾维斯" },
    });
  });

  it("GET 只返回脱敏配置", async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.config.apiKeyConfigured).toBe(true);
    expect(JSON.stringify(body)).not.toContain("stored-secret");
  });

  it("POST 验证 Mind 后保存配置，留空 Key 时保留原值", async () => {
    const response = await POST(
      new Request("http://localhost/api/config", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          builderApiKey: "",
          mindId: "",
          xBearerToken: "new-x-secret",
          defaultSourceUrl: "https://example.com/feed.xml",
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(saveMock).toHaveBeenCalledWith({
      builderApiKey: "stored-secret",
      xBearerToken: "new-x-secret",
      mindId: "resolved-mind",
      conversationAlias: "creator-main",
      defaultSourceUrl: "https://example.com/feed.xml",
    });
    expect(body.mind).toEqual({ id: "resolved-mind", name: "贾维斯" });
    expect(JSON.stringify(body)).not.toContain("stored-secret");
  });
});
