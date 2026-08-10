import { beforeEach, describe, expect, it, vi } from "vitest";

const { startMock, listSourcesMock } = vi.hoisted(() => ({
  startMock: vi.fn(),
  listSourcesMock: vi.fn(),
}));

vi.mock("@/server/radar-job-runner", () => ({ startRadarJob: startMock }));
vi.mock("@/server/workspace-data", () => ({
  createWorkspaceDataStore: () => ({ listSources: listSourcesMock }),
}));

import { POST } from "./route";

describe("POST /api/radar", () => {
  beforeEach(() => {
    listSourcesMock.mockReset().mockReturnValue([{ id: "source-123" }]);
    startMock.mockReset().mockReturnValue({ id: "job-1", status: "running", stage: "queued" });
  });

  it("creates a persistent Horizon radar job", async () => {
    const response = await POST(new Request("http://localhost/api/radar", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ commandId: "command-123", sourceIds: ["source-123"], focus: "AI 创作者" }),
    }));

    expect(response.status).toBe(202);
    expect(startMock).toHaveBeenCalledWith({ commandId: "command-123", sourceIds: ["source-123"], focus: "AI 创作者" });
    expect((await response.json()).job).toMatchObject({ id: "job-1", stage: "queued" });
  });

  it("rejects unknown sources", async () => {
    const response = await POST(new Request("http://localhost/api/radar", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ commandId: "command-123", sourceIds: ["missing-1"] }),
    }));

    expect(response.status).toBe(400);
    expect(startMock).not.toHaveBeenCalled();
  });
});
