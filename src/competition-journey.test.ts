import { describe, expect, it } from "vitest";

import { createRecordedMindAuthority } from "./adapters/recorded-mind-authority";
import { createSqliteWorkspaceStore } from "./adapters/sqlite-health";
import { createCreatorDesk } from "./core/creator-desk";

describe("比赛关键旅程", () => {
  it("自动走完选题、表达、人工审核、发布复盘和可控学习", async () => {
    const store = createSqliteWorkspaceStore(":memory:");
    const operationIds = [
      "profile-operation",
      "radar-operation",
      "proposal-operation",
      "review-operation",
      "publication-operation",
      "learning-operation",
      "memory-operation",
    ];
    const desk = createCreatorDesk({
      database: { check: async () => ({ ready: true }) },
      mind: {
        inspect: async () => ({
          state: "not_configured",
          guidance: "设置 MINDS_BUILDER_API_KEY 后连接核心 Mind",
        }),
      },
      demoMind: createRecordedMindAuthority(),
      workspaceStore: store,
      profileStore: store,
      proposalStore: store,
      publicationStore: store,
      learningStore: store,
      signalSource: {
        collect: async () => [
          {
            id: "demo-signal",
            title: "AI 团队开始衡量交付结果",
            summary: "团队从工具采用率转向收入、成本和交付周期。",
            sourceName: "演示行业观察",
            sourceUrl: "https://example.com/demo-signal",
            canonicalUrl: "https://example.com/demo-signal",
            publishedAt: "2026-08-05T03:00:00.000Z",
            relevanceScore: 0.9,
            synthetic: true,
          },
        ],
      },
      idFactory: () => operationIds.shift()!,
      clock: () => new Date("2026-08-05T04:00:00.000Z"),
    });

    await desk.submit({
      commandId: "profile-command",
      command: {
        type: "update_profile",
        expectedVersion: 0,
        positioning: "解释 AI 商业化",
        audience: "中文创业者",
        voice: "克制、清楚、证据优先",
      },
    });
    await desk.submit({
      commandId: "radar-command",
      command: {
        type: "run_cycle",
        trigger: "manual",
        dataMode: "demo_only",
        decisionMode: "demo_mind",
      },
    });
    await desk.submit({
      commandId: "proposal-command",
      command: {
        type: "prepare_proposal",
        signalId: "demo-signal",
        proposalMode: "demo",
      },
    });

    let dashboard = await desk.inspect({ view: "dashboard" });
    expect(dashboard.latestProposal).toMatchObject({
      status: "awaiting_review",
      mindDecision: { mindName: "演示 Mind（录制适配器）" },
      radarProof: {
        operationId: "radar-operation",
        mode: "demo",
        decisionMode: "demo_mind",
        mindDecision: { decisionId: expect.any(String) },
      },
    });
    await desk.submit({
      commandId: "review-command",
      command: {
        type: "review_proposal",
        proposalId: dashboard.latestProposal!.operationId,
        expectedVersion: dashboard.latestProposal!.version,
        decision: "approve",
        reason: "证据边界和演示标记清楚",
      },
    });

    dashboard = await desk.inspect({ view: "dashboard" });
    await desk.submit({
      commandId: "publication-command",
      command: {
        type: "link_publication",
        proposalId: dashboard.latestProposal!.operationId,
        expectedProposalVersion: dashboard.latestProposal!.version,
        mode: "demo",
        postUrl: "https://x.com/demo/status/123",
        actualText: dashboard.latestProposal!.chineseDraft!,
        publishedAt: "2026-08-05T05:00:00.000Z",
        metrics: { impressions: 1000, likes: 30, replies: 5, reposts: 4 },
      },
    });
    await desk.submit({
      commandId: "learning-command",
      command: {
        type: "prepare_learning",
        publicationId: "publication-operation",
        learningMode: "demo",
      },
    });
    await desk.submit({
      commandId: "memory-command",
      command: {
        type: "manage_learning",
        learningId: "learning-operation",
        expectedVersion: 1,
        action: "edit",
        memoryText: "继续验证证据优先的表达，但不作单因素归因。",
      },
    });

    dashboard = await desk.inspect({ view: "dashboard" });
    expect(dashboard).toMatchObject({
      latestProposal: { status: "approved_unpublished" },
      latestPublication: {
        source: "manual_entry",
        metrics: {
          calculationState: "incomplete",
          missingFields: ["bookmarks", "followersDelta"],
        },
      },
      latestLearning: {
        status: "accepted",
        version: 2,
        memoryText: "继续验证证据优先的表达，但不作单因素归因。",
        source: { actualText: expect.stringContaining("【演示草稿】") },
      },
      competitionProof: {
        readyForJudging: false,
        selection: { status: "demo" },
        expression: { status: "demo" },
        learning: { status: "demo" },
      },
    });
  });

  it("启用后由到期任务自主运行每日雷达并留下可核验证据", async () => {
    const store = createSqliteWorkspaceStore(":memory:");
    const now = new Date("2026-08-06T01:00:00.000Z");
    const operationIds = [
      "profile-operation",
      "schedule-operation",
      "scheduled-radar-operation",
    ];
    const desk = createCreatorDesk({
      database: { check: async () => ({ ready: true }) },
      mind: {
        inspect: async () => ({
          state: "not_configured",
          guidance: "设置 MINDS_BUILDER_API_KEY 后连接核心 Mind",
        }),
      },
      demoMind: createRecordedMindAuthority(),
      workspaceStore: store,
      profileStore: store,
      proposalStore: store,
      publicationStore: store,
      learningStore: store,
      schedulerStore: store,
      signalSource: {
        collect: async ({ asOf }) => [
          {
            id: "scheduled-signal",
            title: "创作者开始使用持久代理",
            summary: "代理在创作者离线时继续筛选机会。",
            sourceName: "演示自主跟进来源",
            sourceUrl: "https://example.com/scheduled",
            canonicalUrl: "https://example.com/scheduled",
            publishedAt: asOf,
            relevanceScore: 0.91,
            synthetic: true,
          },
        ],
      },
      idFactory: () => operationIds.shift()!,
      clock: () => now,
    });

    await desk.submit({
      commandId: "profile-command",
      command: {
        type: "update_profile",
        expectedVersion: 0,
        positioning: "解释 AI 商业化",
        audience: "中文创业者",
        voice: "克制、清楚、证据优先",
      },
    });
    await desk.submit({
      commandId: "schedule-command",
      command: {
        type: "configure_daily_follow_up",
        enabled: true,
        mode: "demo",
      },
    });

    let dashboard = await desk.inspect({ view: "dashboard" });
    expect(dashboard.systemStatus.scheduler).toMatchObject({
      state: "enabled",
      mode: "demo",
      nextRunAt: "2026-08-06T01:00:00.000Z",
    });

    await desk.submit({
      commandId: "worker-poll-2026-08-06T01:00:00.000Z",
      command: { type: "process_due_follow_up" },
    });

    dashboard = await desk.inspect({ view: "dashboard" });
    expect(dashboard.latestRadar).toMatchObject({
      operationId: "scheduled-radar-operation",
      trigger: "daily",
      decisionMode: "demo_mind",
    });
    expect(dashboard.systemStatus.scheduler).toMatchObject({
      state: "enabled",
      mode: "demo",
      runState: "idle",
      lastRunAt: "2026-08-06T01:00:00.000Z",
      lastRadarOperationId: "scheduled-radar-operation",
      nextRunAt: "2026-08-07T01:00:00.000Z",
    });
    expect(dashboard.competitionProof.autonomy).toMatchObject({
      status: "demo",
      label: "仅有演示自主跟进证据",
    });

  });

  it("核心 Mind 未连接时不能把真实每日跟进标成已启用", async () => {
    const store = createSqliteWorkspaceStore(":memory:");
    const desk = createCreatorDesk({
      database: { check: async () => ({ ready: true }) },
      mind: {
        inspect: async () => ({
          state: "not_configured",
          guidance: "设置 MINDS_BUILDER_API_KEY 后连接核心 Mind",
        }),
      },
      schedulerStore: store,
    });

    await expect(
      desk.submit({
        commandId: "schedule-real-command",
        command: {
          type: "configure_daily_follow_up",
          enabled: true,
          mode: "real",
        },
      }),
    ).rejects.toThrow("请先连接核心 Mind");
    await expect(desk.inspect({ view: "dashboard" })).resolves.toMatchObject({
      systemStatus: { scheduler: { state: "not_enabled" } },
    });
  });
});
