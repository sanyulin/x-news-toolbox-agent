import { describe, expect, it, vi } from "vitest";

import type {
  LearningDraftInput,
  ProposalDraftInput,
  RadarSignal,
} from "../core/creator-desk";
import { createMindsMindAuthority } from "./minds-mind-authority";
import { createRecordedMindAuthority } from "./recorded-mind-authority";

type ContractAuthority = {
  rankRadar(input: {
    asOf: string;
    profile: ProposalDraftInput["profile"];
    signals: RadarSignal[];
  }): Promise<unknown>;
  draftProposal(input: ProposalDraftInput): Promise<unknown>;
  suggestLearning(input: LearningDraftInput): Promise<unknown>;
};

const profile: ProposalDraftInput["profile"] = {
  positioning: "解释 AI 商业化",
  audience: "中文创业者",
  voice: "克制、清楚、证据优先",
  version: 1,
  updatedAt: "2026-08-06T01:00:00.000Z",
};
const signal: RadarSignal = {
  id: "signal-contract-1",
  title: "AI 团队开始按交付结果核算",
  summary: "团队开始用成本和交付周期衡量 Agent。",
  sourceName: "行业观察",
  sourceUrl: "https://example.com/agent-results",
  canonicalUrl: "https://example.com/agent-results",
  publishedAt: "2026-08-06T00:00:00.000Z",
  relevanceScore: 0.86,
  synthetic: true,
};
const proposalInput: ProposalDraftInput = {
  asOf: "2026-08-06T02:00:00.000Z",
  profile,
  signal,
  evidence: {
    id: "packet-contract-1",
    version: "evidence-contract-v1",
    createdAt: "2026-08-06T02:00:00.000Z",
    signalId: signal.id,
    synthetic: true,
    sources: [
      {
        id: "source-contract-1",
        name: signal.sourceName,
        url: signal.sourceUrl,
        publishedAt: signal.publishedAt,
        synthetic: true,
      },
    ],
    claims: [
      {
        id: "claim-contract-1",
        text: signal.summary,
        status: "supported",
        evidenceIds: ["source-contract-1"],
      },
    ],
    risks: ["演示证据不可当作真实事实发布"],
  },
};
const learningInput: LearningDraftInput = {
  asOf: "2026-08-06T04:00:00.000Z",
  profile,
  publication: {
    operationId: "publication-contract-1",
    commandId: "publication-command-contract-1",
    proposalId: "proposal-contract-1",
    proposalVersion: 2,
    mode: "demo",
    platform: "x",
    source: "manual_entry",
    postUrl: "https://x.com/demo/status/contract",
    actualText: "最终发布时，我用一个具体问题开场。",
    publishedAt: "2026-08-06T03:00:00.000Z",
    linkedAt: "2026-08-06T03:30:00.000Z",
    metrics: {
      capturedAt: "2026-08-06T03:30:00.000Z",
      source: "manual_entry",
      values: { impressions: 1000, replies: 8 },
      availableFields: ["impressions", "replies"],
      missingFields: ["likes", "reposts", "bookmarks", "followersDelta"],
      engagementRateFormula:
        "(likes + replies + reposts + bookmarks) / impressions",
      calculationState: "incomplete",
    },
  },
};

mindAuthorityContract("Recorded Mind", () =>
  createRecordedMindAuthority({ decisionIdFactory: () => "recorded-contract" }),
);
mindAuthorityContract("Minds Adapter", createContractMindsAuthority);

function mindAuthorityContract(
  label: string,
  createAuthority: () => ContractAuthority,
) {
  describe(`${label} 决策契约`, () => {
    it("返回覆盖全部候选且可追溯的雷达决策", async () => {
      const decision = await createAuthority().rankRadar({
        asOf: "2026-08-06T02:00:00.000Z",
        profile,
        signals: [signal],
      });
      expect(decision).toMatchObject({
        decisionId: expect.any(String),
        mindId: expect.any(String),
        mindName: expect.any(String),
        conversationAlias: expect.any(String),
        rationale: expect.any(String),
        rankedSignals: [
          {
            signalId: signal.id,
            relevanceScore: expect.any(Number),
            why: expect.any(String),
            recommendation: expect.stringMatching(/^(write|watch|skip)$/),
          },
        ],
      });
    });

    it("返回绑定证据版本的双语表达决策", async () => {
      await expect(createAuthority().draftProposal(proposalInput)).resolves.toMatchObject({
        decisionId: expect.any(String),
        mindId: expect.any(String),
        conversationAlias: expect.any(String),
        goNoGo: "go",
        evidenceVersion: proposalInput.evidence.version,
        chineseDraft: expect.any(String),
        englishDraft: expect.any(String),
      });
    });

    it("返回带置信度的可编辑学习建议", async () => {
      await expect(createAuthority().suggestLearning(learningInput)).resolves.toMatchObject({
        decisionId: expect.any(String),
        mindId: expect.any(String),
        conversationAlias: expect.any(String),
        summary: expect.any(String),
        suggestedMemory: expect.any(String),
        confidence: expect.stringMatching(/^(low|medium|high)$/),
      });
    });
  });
}

function createContractMindsAuthority(): ContractAuthority {
  let latestMessage = "";
  const client = {
    listMinds: vi.fn().mockResolvedValue([
      { mindId: "mind-contract", name: "契约测试 Mind" },
    ]),
    ensureConversation: vi.fn().mockResolvedValue({ conversationId: "conversation" }),
    getLatestHistoryFingerprint: vi.fn().mockResolvedValue("before"),
    sendMessage: vi.fn().mockImplementation(async ({ messageText }) => {
      latestMessage = messageText;
    }),
    waitForReply: vi.fn().mockImplementation(async () => ({
      timedOut: false,
      reply: {
        messageId: "message-contract",
        messageText: latestMessage.includes("候选信号排序")
          ? JSON.stringify({
              rationale: "该主题与创作者定位和受众一致。",
              rankedSignals: [
                {
                  signalId: signal.id,
                  relevanceScore: 0.9,
                  why: "有明确的商业判断空间",
                  recommendation: "write",
                },
              ],
            })
          : latestMessage.includes("严格基于证据包")
            ? JSON.stringify({
                goNoGo: "go",
                reason: "证据足以支持一条明确标记的演示建议。",
                angle: "从结果核算解释 Agent 价值",
                evidenceVersion: proposalInput.evidence.version,
                chineseDraft: "【演示草稿】用结果核算 Agent，比只看采用率更接近业务价值。",
                englishDraft:
                  "[DEMO DRAFT] Measuring delivered outcomes makes agent value easier to test.",
              })
            : JSON.stringify({
                summary: "指标不完整，只能提出下一轮测试假设。",
                suggestedMemory: "下一轮继续测试具体问题式开场。",
                confidence: "medium",
              }),
      },
    })),
  };
  return createMindsMindAuthority({
    builderApiKey: "contract-key",
    conversationAlias: "creator-contract",
    clientFactory: () => client,
  });
}
