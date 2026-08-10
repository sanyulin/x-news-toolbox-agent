import { beforeEach, describe, expect, it, vi } from "vitest";

const { loadMock, saveMock } = vi.hoisted(() => ({
  loadMock: vi.fn(),
  saveMock: vi.fn(),
}));

vi.mock("@/server/runtime-config", () => ({
  defaultHorizonModel: (provider: string) => provider === "deepseek" ? "deepseek-v4-flash" : "default-model",
  loadRuntimeConfig: loadMock,
  saveRuntimeConfig: saveMock,
  toPublicRuntimeConfig: (config: Record<string, unknown>) => {
    const horizon = config.horizon as Record<string, unknown>;
    const { apiKey, ...publicValues } = horizon;
    return { horizon: { ...publicValues, apiKeyConfigured: Boolean(apiKey) } };
  },
}));

import { PUT } from "./route";

const payload = {
  enabled: true,
  provider: "deepseek",
  apiKey: "",
  baseUrl: "https://api.deepseek.com",
  azureEndpoint: "",
  hours: 24,
  threshold: 7,
  hackerNews: true,
  ossInsight: false,
  enrich: true,
};

describe("PUT /api/settings/horizon", () => {
  beforeEach(() => {
    loadMock.mockReset().mockReturnValue({ horizon: { apiKey: "stored-secret" } });
    saveMock.mockReset();
  });

  it("留空密钥时保留原值，并且响应中不泄露密钥", async () => {
    const response = await PUT(request(payload));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(saveMock).toHaveBeenCalledWith(expect.objectContaining({
      horizon: expect.objectContaining({ apiKey: "stored-secret", provider: "deepseek", model: "deepseek-v4-flash" }),
    }));
    expect(body.config.apiKeyConfigured).toBe(true);
    expect(JSON.stringify(body)).not.toContain("stored-secret");
  });

  it("拒绝远程 HTTP Base URL，但允许 Ollama 本机 HTTP", async () => {
    const rejected = await PUT(request({ ...payload, baseUrl: "http://api.example.com" }));
    expect(rejected.status).toBe(400);

    const accepted = await PUT(request({
      ...payload,
      provider: "ollama",
      baseUrl: "http://localhost:11434/v1",
    }));
    expect(accepted.status).toBe(200);
  });

  it("接受非 Azure 表单提交的空 Endpoint", async () => {
    const response = await PUT(request({ ...payload, azureEndpoint: null }));
    expect(response.status).toBe(200);
  });
});

function request(body: unknown) {
  return new Request("http://localhost/api/settings/horizon", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
