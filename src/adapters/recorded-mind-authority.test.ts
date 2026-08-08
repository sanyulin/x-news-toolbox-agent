import { describe, expect, it } from "vitest";

import type { ProposalDraftInput } from "@/core/creator-desk";

import { createRecordedMindAuthority } from "./recorded-mind-authority";

const input: ProposalDraftInput = {
  asOf: "2026-08-05T07:00:00.000Z",
  profile: {
    positioning: "解释 AI 商业化",
    audience: "创业者",
    voice: "克制、清楚",
    version: 1,
    updatedAt: "2026-08-05T05:00:00.000Z",
  },
  signal: {
    id: "signal-1",
    title: "AI 产品开始按结果收费",
    summary: "商业模式从席位费转向结果分成",
    sourceName: "演示商业观察",
    sourceUrl: "https://example.com/result-pricing",
    canonicalUrl: "https://example.com/result-pricing",
    publishedAt: "2026-08-05T02:00:00.000Z",
    relevanceScore: 0.93,
    synthetic: true,
  },
  evidence: {
    id: "packet-001",
    version: "evidence-001-v1",
    createdAt: "2026-08-05T07:00:00.000Z",
    signalId: "signal-1",
    synthetic: true,
    sources: [
      {
        id: "source-signal-1",
        name: "演示商业观察",
        url: "https://example.com/result-pricing",
        publishedAt: "2026-08-05T02:00:00.000Z",
        synthetic: true,
      },
    ],
    claims: [
      {
        id: "claim-1",
        text: "商业模式从席位费转向结果分成",
        status: "supported",
        evidenceIds: ["source-signal-1"],
      },
    ],
    risks: ["演示数据不可当作真实事实发布"],
  },
};

describe("Recorded Mind 内容建议 Adapter", () => {
  it("用同一证据版本生成明确标记的中英独立演示草稿", async () => {
    const authority = createRecordedMindAuthority({
      decisionIdFactory: () => "recorded-decision-001",
    });

    await expect(authority.draftProposal(input)).resolves.toMatchObject({
      decisionId: "recorded-decision-001",
      mindId: "recorded-demo-mind",
      conversationAlias: "creator-demo",
      goNoGo: "go",
      evidenceVersion: "evidence-001-v1",
      chineseDraft: expect.stringContaining("演示"),
      englishDraft: expect.stringContaining("DEMO"),
    });
  });

  it("没有支持证据时返回放弃建议而不是强行生成草稿", async () => {
    const authority = createRecordedMindAuthority({
      decisionIdFactory: () => "recorded-decision-002",
    });

    const decision = await authority.draftProposal({
      ...input,
      evidence: {
        ...input.evidence,
        sources: [],
        claims: [
          {
            id: "claim-unknown",
            text: "该趋势是否已经普遍发生",
            status: "unknown",
            evidenceIds: [],
          },
        ],
      },
    });

    expect(decision).toMatchObject({
      goNoGo: "no_go",
      reason: expect.stringContaining("证据不足"),
      evidenceVersion: "evidence-001-v1",
    });
    expect(decision.chineseDraft).toBeUndefined();
    expect(decision.englishDraft).toBeUndefined();
  });

  it("根据实际发布文本和可用指标提出明确标记的演示学习建议", async () => {
    const authority = createRecordedMindAuthority({
      decisionIdFactory: () => "recorded-learning-001",
    });

    await expect(
      authority.suggestLearning?.({
        asOf: "2026-08-05T10:00:00.000Z",
        profile: input.profile,
        publication: {
          operationId: "publication-001",
          commandId: "publication-command-001",
          proposalId: "proposal-001",
          proposalVersion: 2,
          mode: "demo",
          platform: "x",
          source: "manual_entry",
          postUrl: "https://x.com/example/status/123",
          actualText: "最终发布时，我把开场改成了一个具体问题。",
          publishedAt: "2026-08-05T08:30:00.000Z",
          linkedAt: "2026-08-05T09:00:00.000Z",
          metrics: {
            capturedAt: "2026-08-05T09:00:00.000Z",
            source: "manual_entry",
            values: {
              impressions: 1000,
              likes: 40,
              replies: 8,
              reposts: 5,
              bookmarks: 7,
            },
            availableFields: [
              "impressions",
              "likes",
              "replies",
              "reposts",
              "bookmarks",
            ],
            missingFields: ["followersDelta"],
            engagementRate: 0.06,
            engagementRateFormula:
              "(likes + replies + reposts + bookmarks) / impressions",
            calculationState: "complete",
          },
        },
      }),
    ).resolves.toMatchObject({
      decisionId: "recorded-learning-001",
      confidence: "medium",
      summary: expect.stringContaining("6.00%"),
      suggestedMemory: expect.stringContaining("问题式开场"),
    });
  });
});
