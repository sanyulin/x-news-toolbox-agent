import { describe, expect, it } from "vitest";

import type { LearningUpdate, PublicationLink } from "@/core/creator-desk";

import { createSqliteHealth, createSqliteWorkspaceStore } from "./sqlite-health";

describe("SQLite 健康检查", () => {
  it("通过公开检查接口确认数据库可以执行查询", async () => {
    const database = createSqliteHealth(":memory:");

    await expect(database.check()).resolves.toEqual({ ready: true });
  });
});

describe("SQLite 今日雷达存储", () => {
  it("保存后可按幂等键和最新运行读取同一条雷达", async () => {
    const store = createSqliteWorkspaceStore(":memory:");
    const run = {
      operationId: "operation-001",
      commandId: "command-001",
      generatedAt: "2026-08-05T04:00:00.000Z",
      mode: "demo" as const,
      focus: "AI Agent",
      signals: [],
    };

    await store.saveRadarRun(run);

    await expect(store.findRadarRunByCommandId("command-001")).resolves.toEqual(
      run,
    );
    await expect(store.getLatestRadarRun()).resolves.toEqual(run);
  });
});

describe("SQLite 创作者档案存储", () => {
  it("保存单一档案、校验版本，并识别重复命令", async () => {
    const store = createSqliteWorkspaceStore(":memory:");
    const input = {
      operationId: "profile-operation-001",
      commandId: "profile-command-001",
      expectedVersion: 0,
      updatedAt: "2026-08-05T05:00:00.000Z",
      profile: {
        positioning: "解释 AI 商业化",
        audience: "创业者",
        voice: "克制、清楚",
        boundaries: "不编造数据，不自动发布",
      },
    };

    await expect(store.saveCreatorProfile(input)).resolves.toMatchObject({
      disposition: "accepted",
      profile: { version: 1, positioning: "解释 AI 商业化" },
    });
    await expect(store.saveCreatorProfile(input)).resolves.toMatchObject({
      disposition: "duplicate",
      profile: { version: 1 },
    });
    await expect(store.getCreatorProfile()).resolves.toMatchObject({
      version: 1,
      audience: "创业者",
      boundaries: "不编造数据，不自动发布",
    });

    await expect(
      store.saveCreatorProfile({
        ...input,
        commandId: "profile-command-002",
        expectedVersion: 0,
      }),
    ).rejects.toThrow("创作者档案已被更新");
  });
});

describe("SQLite 内容建议存储", () => {
  it("保存后可按幂等键和最新建议读取完整证据与 Mind 指针", async () => {
    const store = createSqliteWorkspaceStore(":memory:");
    const proposal = {
      operationId: "proposal-operation-001",
      commandId: "proposal-command-001",
      generatedAt: "2026-08-05T07:00:00.000Z",
      version: 1,
      status: "awaiting_review" as const,
      synthetic: true,
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
        version: "evidence-proposal-operation-001-v1",
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
            status: "supported" as const,
            evidenceIds: ["source-signal-1"],
          },
        ],
        risks: ["演示数据不可当作真实事实发布"],
      },
      mindDecision: {
        decisionId: "demo-decision-001",
        mindId: "recorded-demo-mind",
        mindName: "演示 Mind",
        conversationAlias: "creator-demo",
        goNoGo: "go" as const,
        reason: "证据足以提出克制观察",
        angle: "结果计费",
        evidenceVersion: "evidence-proposal-operation-001-v1",
        chineseDraft: "中文草稿",
        englishDraft: "English draft",
      },
      chineseDraft: "中文草稿",
      englishDraft: "English draft",
    };

    await store.saveProposal(proposal);

    await expect(
      store.findProposalByCommandId("proposal-command-001"),
    ).resolves.toEqual(proposal);
    await expect(store.getLatestProposal()).resolves.toEqual(proposal);

    const reviewInput = {
      operationId: "review-operation-001",
      commandId: "review-command-001",
      proposalId: proposal.operationId,
      expectedVersion: 1,
      decision: "approve" as const,
      reason: "证据边界和表达都可以接受",
      decidedAt: "2026-08-05T08:00:00.000Z",
    };
    await expect(store.reviewProposal(reviewInput)).resolves.toMatchObject({
      operationId: "review-operation-001",
      disposition: "accepted",
      proposal: {
        version: 2,
        status: "approved_unpublished",
        review: { decision: "approve", reviewedVersion: 1 },
      },
    });
    await expect(store.reviewProposal(reviewInput)).resolves.toMatchObject({
      operationId: "review-operation-001",
      disposition: "duplicate",
    });
    await expect(
      store.reviewProposal({
        ...reviewInput,
        commandId: "review-command-stale",
        decision: "reject",
      }),
    ).rejects.toThrow("内容建议已更新");

    const publication: PublicationLink = {
      operationId: "publication-operation-001",
      commandId: "publication-command-001",
      proposalId: proposal.operationId,
      proposalVersion: 2,
      mode: "demo" as const,
      platform: "x" as const,
      source: "manual_entry" as const,
      postUrl: "https://x.com/example/status/123",
      actualText: "创作者最终手工发布的文本",
      publishedAt: "2026-08-05T08:30:00.000Z",
      linkedAt: "2026-08-05T09:00:00.000Z",
      metrics: {
        capturedAt: "2026-08-05T09:00:00.000Z",
        source: "manual_entry" as const,
        values: { impressions: 1000, likes: 40 },
        availableFields: ["impressions", "likes"],
        missingFields: [
          "replies",
          "reposts",
          "bookmarks",
          "followersDelta",
        ],
        engagementRateFormula:
          "(likes + replies + reposts + bookmarks) / impressions" as const,
        calculationState: "incomplete" as const,
      },
    };
    await expect(
      store.linkPublication({
        publication,
        expectedProposalVersion: 2,
      }),
    ).resolves.toMatchObject({
      disposition: "accepted",
      publication: { actualText: "创作者最终手工发布的文本" },
    });
    await expect(
      store.linkPublication({ publication, expectedProposalVersion: 2 }),
    ).resolves.toMatchObject({
      disposition: "duplicate",
      operationId: "publication-operation-001",
    });
    await expect(store.getLatestPublication()).resolves.toEqual(publication);

    for (const [index, decision, status] of [
      [2, "request_changes", "needs_changes"],
      [3, "reject", "rejected"],
    ] as const) {
      const nextProposal = {
        ...proposal,
        operationId: `proposal-operation-00${index}`,
        commandId: `proposal-command-00${index}`,
      };
      await store.saveProposal(nextProposal);
      await expect(
        store.linkPublication({
          publication: {
            ...publication,
            operationId: `publication-operation-00${index}`,
            commandId: `publication-command-00${index}`,
            proposalId: nextProposal.operationId,
            proposalVersion: 1,
          },
          expectedProposalVersion: 1,
        }),
      ).rejects.toThrow("只有已批准未发布的内容建议才能关联发布结果");
      await expect(
        store.reviewProposal({
          operationId: `review-operation-00${index}`,
          commandId: `review-command-00${index}`,
          proposalId: nextProposal.operationId,
          expectedVersion: 1,
          decision,
          reason: "记录不同审核分支",
          decidedAt: "2026-08-05T08:00:00.000Z",
        }),
      ).resolves.toMatchObject({
        proposal: { status },
      });
    }
  });
});

describe("SQLite 学习更新存储", () => {
  it("保存后可按幂等键和最新记录读取 Mind 建议及来源", async () => {
    const store = createSqliteWorkspaceStore(":memory:");
    const update: LearningUpdate = {
      operationId: "learning-operation-001",
      commandId: "learning-command-001",
      createdAt: "2026-08-05T10:00:00.000Z",
      version: 1,
      status: "proposed",
      synthetic: true,
      publicationId: "publication-operation-001",
      proposalId: "proposal-operation-001",
      source: {
        postUrl: "https://x.com/example/status/123",
        actualText: "最终发布文本",
        metricsSource: "manual_entry",
        metricsCapturedAt: "2026-08-05T09:00:00.000Z",
      },
      mindDecision: {
        decisionId: "learning-decision-001",
        mindId: "recorded-demo-mind",
        mindName: "演示 Mind",
        conversationAlias: "creator-demo",
        summary: "问题式开场获得可观察互动",
        suggestedMemory: "继续测试问题式开场",
        confidence: "medium",
      },
      memoryText: "继续测试问题式开场",
    };

    await store.saveLearning(update);

    await expect(
      store.findLearningByCommandId("learning-command-001"),
    ).resolves.toEqual(update);
    await expect(store.getLatestLearning()).resolves.toEqual(update);

    const edited = await store.updateLearning({
      operationId: "learning-edit-operation-001",
      commandId: "learning-edit-command-001",
      learningId: update.operationId,
      expectedVersion: 1,
      action: "edit",
      memoryText: "后续测试问题式开场，但不要把互动归因于单一写法",
      updatedAt: "2026-08-05T10:05:00.000Z",
    });
    expect(edited).toMatchObject({
      disposition: "accepted",
      update: {
        version: 2,
        status: "accepted",
        memoryText: "后续测试问题式开场，但不要把互动归因于单一写法",
      },
    });

    await expect(
      store.updateLearning({
        operationId: "ignored-operation",
        commandId: "learning-edit-command-001",
        learningId: update.operationId,
        expectedVersion: 1,
        action: "edit",
        memoryText: "重复提交不应覆盖",
        updatedAt: "2026-08-05T10:06:00.000Z",
      }),
    ).resolves.toMatchObject({
      operationId: "learning-edit-operation-001",
      disposition: "duplicate",
      update: { version: 2 },
    });

    await expect(
      store.updateLearning({
        operationId: "stale-operation",
        commandId: "stale-command",
        learningId: update.operationId,
        expectedVersion: 1,
        action: "accept",
        updatedAt: "2026-08-05T10:07:00.000Z",
      }),
    ).rejects.toThrow("学习更新已变化，请刷新后重试");

    await expect(
      store.updateLearning({
        operationId: "learning-delete-operation-001",
        commandId: "learning-delete-command-001",
        learningId: update.operationId,
        expectedVersion: 2,
        action: "delete",
        updatedAt: "2026-08-05T10:08:00.000Z",
      }),
    ).resolves.toMatchObject({
      update: { version: 3, status: "deleted" },
    });
  });
});

describe("SQLite 每日任务领取", () => {
  it("阻止活跃任务重复领取，并在租约过期后允许恢复", async () => {
    const store = createSqliteWorkspaceStore(":memory:");
    await store.configureDailyFollowUp({
      operationId: "schedule-1",
      commandId: "schedule-command-1",
      enabled: true,
      mode: "real",
      platform: "xiaohongshu",
      dailyTime: "10:00",
      now: "2026-08-18T02:00:00.000Z",
    });

    await expect(
      store.claimDueDailyFollowUp({ now: "2026-08-18T02:00:00.000Z" }),
    ).resolves.toMatchObject({ scheduledFor: "2026-08-18T02:00:00.000Z" });
    await expect(
      store.claimDueDailyFollowUp({ now: "2026-08-18T02:10:00.000Z" }),
    ).resolves.toBeUndefined();
    await expect(
      store.claimDueDailyFollowUp({ now: "2026-08-18T02:31:00.000Z" }),
    ).resolves.toMatchObject({
      scheduledFor: "2026-08-18T02:00:00.000Z",
      job: { runState: "running", leaseUntil: "2026-08-18T03:01:00.000Z" },
    });
  });
});
