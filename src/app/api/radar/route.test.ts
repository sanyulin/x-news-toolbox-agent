import { beforeEach, describe, expect, it, vi } from "vitest";

const { createAppDeskMock, lookupMock, submitMock } = vi.hoisted(() => ({
  createAppDeskMock: vi.fn(),
  lookupMock: vi.fn(),
  submitMock: vi.fn(),
}));

vi.mock("node:dns/promises", () => ({ lookup: lookupMock }));

vi.mock("@/server/create-app-desk", () => ({
  createAppDesk: createAppDeskMock,
}));

import { POST } from "./route";

describe("POST /api/radar", () => {
  beforeEach(() => {
    lookupMock.mockReset().mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
    ]);
    submitMock.mockReset().mockResolvedValue({
      operationId: "radar-1",
      commandId: "command-123",
      disposition: "accepted",
      status: "completed",
    });
    createAppDeskMock.mockReset().mockReturnValue({ submit: submitMock });
  });

  it("使用用户输入的公开 HTTPS 来源运行真实 Mind", async () => {
    const response = await POST(
      new Request("http://localhost/api/radar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          commandId: "command-123",
          sourceUrl: "https://example.com/feed.xml",
          focus: "AI 创作者",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(createAppDeskMock).toHaveBeenCalledWith({
      sourceUrl: "https://example.com/feed.xml",
    });
    expect(submitMock).toHaveBeenCalledWith({
      commandId: "command-123",
      command: {
        type: "run_cycle",
        trigger: "manual",
        dataMode: "live_with_demo_fallback",
        decisionMode: "mind",
        focus: "AI 创作者",
      },
    });
  });

  it("拒绝本机或内网来源链接", async () => {
    const response = await POST(
      new Request("http://localhost/api/radar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          commandId: "command-123",
          sourceUrl: "http://127.0.0.1:3000/api/health",
        }),
      }),
    );

    expect(response.status).toBe(400);
    expect(createAppDeskMock).not.toHaveBeenCalled();
  });

  it("拒绝解析到内网地址的域名", async () => {
    lookupMock.mockResolvedValue([{ address: "192.168.1.8", family: 4 }]);

    const response = await POST(
      new Request("http://localhost/api/radar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          commandId: "command-123",
          sourceUrl: "https://internal.example/feed.xml",
        }),
      }),
    );

    expect(response.status).toBe(400);
    expect(createAppDeskMock).not.toHaveBeenCalled();
  });
});
