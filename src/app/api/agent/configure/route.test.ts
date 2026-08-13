import { beforeEach, describe, expect, it, vi } from "vitest";

const { inspectMock, submitMock } = vi.hoisted(() => ({
  inspectMock: vi.fn(),
  submitMock: vi.fn(),
}));

vi.mock("@/server/create-app-desk", () => ({
  createAppDesk: vi.fn(() => ({ inspect: inspectMock, submit: submitMock })),
}));

import { POST } from "./route";

const input = {
  requestId: "setup-test-001",
  profile: {
    positioning: "聚焦 AI 与科技",
    audience: "专业创作者与行业读者",
    voice: "专业、简洁、证据优先",
    boundaries: "不伪造事实，不自动发布",
  },
  automation: {
    enabled: true,
    platform: "x",
    outputCount: 1,
    focus: "AI Agent",
    dailyTime: "09:00",
  },
};

describe("POST /api/agent/configure", () => {
  beforeEach(() => {
    inspectMock.mockReset()
      .mockResolvedValueOnce({
        creatorProfile: { version: 2 },
        systemStatus: { mind: { state: "connected" } },
      })
      .mockResolvedValueOnce({
        systemStatus: { scheduler: { state: "enabled", platform: "x" } },
      });
    submitMock.mockReset()
      .mockResolvedValueOnce({
        disposition: "accepted",
        profile: { ...input.profile, version: 3 },
      })
      .mockResolvedValueOnce({ disposition: "accepted" });
  });

  it("只把非敏感档案和运行计划提交给现有领域入口", async () => {
    const response = await POST(new Request("http://localhost/api/agent/configure", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(submitMock).toHaveBeenNthCalledWith(1, {
      commandId: "setup-test-001:profile",
      command: { type: "update_profile", expectedVersion: 2, ...input.profile },
    });
    expect(submitMock).toHaveBeenNthCalledWith(2, {
      commandId: "setup-test-001:automation",
      command: {
        type: "configure_daily_follow_up",
        enabled: true,
        mode: "real",
        platform: "x",
        outputCount: 1,
        focus: "AI Agent",
        dailyTime: "09:00",
      },
    });
    expect(body.receipts).toEqual({ profile: "accepted", automation: "accepted" });
  });

  it("拒绝夹带密钥字段", async () => {
    const response = await POST(new Request("http://localhost/api/agent/configure", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...input, builderApiKey: "must-not-enter-this-api" }),
    }));

    expect(response.status).toBe(400);
    expect(submitMock).not.toHaveBeenCalled();
  });

  it("Mind 未连接时不启用自动运行", async () => {
    inspectMock.mockReset().mockResolvedValue({
      creatorProfile: undefined,
      systemStatus: { mind: { state: "not_configured" } },
    });

    const response = await POST(new Request("http://localhost/api/agent/configure", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }));

    expect(response.status).toBe(409);
    expect(submitMock).not.toHaveBeenCalled();
  });
});
