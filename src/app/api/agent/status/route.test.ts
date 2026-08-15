import { beforeEach, describe, expect, it, vi } from "vitest";

const { inspectMock, getLatestRadarJobMock } = vi.hoisted(() => ({
  inspectMock: vi.fn(),
  getLatestRadarJobMock: vi.fn(),
}));

vi.mock("@/server/agent-tool-auth", () => ({ authorizeAgentTool: () => true }));
vi.mock("@/server/create-app-desk", () => ({
  createAppDesk: () => ({ inspect: inspectMock }),
}));
vi.mock("@/server/runtime-config", () => ({
  getPublicRuntimeConfig: () => ({
    apiKeyConfigured: true,
    horizon: { enabled: true, provider: "deepseek", apiKeyConfigured: true },
    xApiKeyConfigured: false,
  }),
}));
vi.mock("@/server/workspace-data", () => ({
  createWorkspaceDataStore: () => ({ getLatestRadarJob: getLatestRadarJobMock }),
}));

import { GET } from "./route";

describe("GET /api/agent/status", () => {
  beforeEach(() => {
    inspectMock.mockReset().mockResolvedValue({
      creatorProfile: { version: 1 },
      systemStatus: {
        database: { state: "ready" },
        mind: { state: "connected", mindName: "Creator Mind" },
        scheduler: { state: "enabled" },
      },
    });
    getLatestRadarJobMock.mockReset().mockReturnValue({
      id: "run-1",
      status: "completed",
      stage: "completed",
      runStage: "waiting_review",
      message: "等待审核",
      contractVersion: "1.0.0",
      gateResults: [
        { gate: "platform", status: "passed", detail: "平台格式与必填字段校验通过" },
      ],
    });
  });

  it("returns the public contract and latest gate evidence without secrets", async () => {
    const response = await GET(new Request("http://localhost/api/agent/status"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.agentContract).toMatchObject({
      version: "1.0.0",
      role: "创作者内容情报 Agent",
      semanticAuthority: "MindAuthority",
    });
    expect(body.run).toMatchObject({
      contractVersion: "1.0.0",
      gateResults: [{ gate: "platform", status: "passed" }],
    });
    expect(JSON.stringify(body)).not.toMatch(/apiKey|secret/i);
  });
});
