export type AgentGateId =
  | "input"
  | "evidence"
  | "memory"
  | "platform"
  | "risk"
  | "human_review"
  | "publication";

export interface AgentGateResult {
  gate: AgentGateId;
  status: "passed" | "rejected" | "pending";
  detail: string;
}

export const AGENT_GATE_LABELS: Record<AgentGateId, string> = {
  input: "输入",
  evidence: "证据",
  memory: "记忆",
  platform: "平台",
  risk: "风险",
  human_review: "人工审核",
  publication: "发布边界",
};

export const CREATOR_AGENT_CONTRACT = {
  version: "1.0.0",
  role: "创作者内容情报 Agent",
  mission: "持续发现可信内容机会，并为创作者准备可审核的单平台草稿",
  semanticAuthority: "MindAuthority",
  businessInterface: ["CreatorDesk.submit", "CreatorDesk.inspect"],
  priorities: ["事实与安全", "创作者目标", "内容质量", "运行效率"],
  capabilities: ["自主决定扫描或跳过", "真实信息排序", "证据约束写作", "提出可确认的学习记忆"],
  prohibitedActions: ["自动发布", "自动回复、点赞、转发或关注", "读取或回显 API Key", "使用未批准记忆", "把演示或回放标记为实时运行"],
  stages: ["queued", "collecting", "ranking", "researching", "drafting", "waiting_review", "completed", "failed_retryable", "failed_terminal"],
  gates: ["input", "evidence", "memory", "platform", "risk", "human_review", "publication"],
} as const;

export const CREATOR_AGENT_CONTRACT_VERSION = CREATOR_AGENT_CONTRACT.version;

export function buildInputGateResult(ready: boolean, detail: string): AgentGateResult {
  return { gate: "input", status: ready ? "passed" : "rejected", detail };
}

export function buildEvidenceGateResult(evidenceCount: number): AgentGateResult {
  return evidenceCount > 0
    ? { gate: "evidence", status: "passed", detail: `已保留 ${evidenceCount} 条可追溯候选` }
    : { gate: "evidence", status: "rejected", detail: "没有可追溯候选，不能进入写作" };
}

export function buildMemoryGateResult(usedMemoryIds: string[]): AgentGateResult {
  return {
    gate: "memory",
    status: "passed",
    detail: usedMemoryIds.length ? `已校验 ${usedMemoryIds.length} 条已批准记忆` : "本轮未使用长期记忆",
  };
}

export function buildPlatformGateResults(valid: boolean): AgentGateResult[] {
  return valid
    ? [
        { gate: "platform", status: "passed", detail: "平台格式与必填字段校验通过" },
        { gate: "risk", status: "pending", detail: "来源、冲突与表达风险等待创作者复核" },
        { gate: "human_review", status: "pending", detail: "草稿等待创作者批准、修改或拒绝" },
      ]
    : [
        { gate: "platform", status: "rejected", detail: "自动修订后仍未通过平台校验，需要人工编辑" },
        { gate: "human_review", status: "pending", detail: "不合格草稿只能由创作者继续编辑" },
      ];
}

export function buildPublicationGateResult(autoPublishRequested: boolean): AgentGateResult {
  return autoPublishRequested
    ? { gate: "publication", status: "rejected", detail: "Agent Contract 禁止自动发布或平台互动" }
    : { gate: "publication", status: "passed", detail: "Agent 已停止在审核边界，发布仍由创作者手工完成" };
}

export function buildReviewGateResults(decision: "approve" | "request_changes" | "reject"): AgentGateResult[] {
  const review: AgentGateResult = decision === "request_changes"
    ? { gate: "human_review", status: "pending", detail: "创作者要求修改，修改后需要重新审核" }
    : {
        gate: "human_review",
        status: "passed",
        detail: decision === "approve" ? "创作者已批准当前版本" : "创作者已拒绝当前版本",
      };
  return [review, buildPublicationGateResult(false)];
}
