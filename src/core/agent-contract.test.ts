import { describe, expect, it } from "vitest";

import {
  CREATOR_AGENT_CONTRACT,
  buildInputGateResult,
  buildPlatformGateResults,
  buildPublicationGateResult,
  buildReviewGateResults,
} from "@/core/agent-contract";

describe("creator agent governance contract", () => {
  it("keeps one semantic Mind and a human-only publication boundary", () => {
    expect(CREATOR_AGENT_CONTRACT.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(CREATOR_AGENT_CONTRACT.semanticAuthority).toBe("MindAuthority");
    expect(CREATOR_AGENT_CONTRACT.businessInterface).toEqual([
      "CreatorDesk.submit",
      "CreatorDesk.inspect",
    ]);
    expect(CREATOR_AGENT_CONTRACT.prohibitedActions).toContain("自动发布");
    expect(CREATOR_AGENT_CONTRACT.prohibitedActions).toContain("读取或回显 API Key");
  });

  it("records normal and invalid platform output as deterministic gates", () => {
    expect(buildPlatformGateResults(true)).toEqual([
      { gate: "platform", status: "passed", detail: "平台格式与必填字段校验通过" },
      { gate: "risk", status: "pending", detail: "来源、冲突与表达风险等待创作者复核" },
      { gate: "human_review", status: "pending", detail: "草稿等待创作者批准、修改或拒绝" },
    ]);
    expect(buildPlatformGateResults(false)).toEqual([
      { gate: "platform", status: "rejected", detail: "自动修订后仍未通过平台校验，需要人工编辑" },
      { gate: "human_review", status: "pending", detail: "不合格草稿只能由创作者继续编辑" },
    ]);
  });

  it("rejects missing configuration and any automatic publication request", () => {
    expect(buildInputGateResult(false, "Horizon 未配置")).toEqual({
      gate: "input",
      status: "rejected",
      detail: "Horizon 未配置",
    });
    expect(buildPublicationGateResult(true)).toEqual({
      gate: "publication",
      status: "rejected",
      detail: "Agent Contract 禁止自动发布或平台互动",
    });
  });

  it("records human review without turning approval into publication", () => {
    expect(buildReviewGateResults("approve")).toEqual([
      { gate: "human_review", status: "passed", detail: "创作者已批准当前版本" },
      { gate: "publication", status: "passed", detail: "Agent 已停止在审核边界，发布仍由创作者手工完成" },
    ]);
    expect(buildReviewGateResults("request_changes")[0]).toEqual({
      gate: "human_review",
      status: "pending",
      detail: "创作者要求修改，修改后需要重新审核",
    });
  });
});
