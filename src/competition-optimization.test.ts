import { describe, expect, it } from "vitest";

import { createRecordedMindAuthority } from "@/adapters/recorded-mind-authority";
import { createSqliteWorkspaceStore } from "@/adapters/sqlite-health";
import { createCreatorDesk, type MetricSnapshot } from "@/core/creator-desk";

describe("比赛优化闭环", () => {
  it("把确认记忆显式用于下一轮平台文案", async () => {
    const store = createSqliteWorkspaceStore(":memory:");
    const recorded = createRecordedMindAuthority({ decisionIdFactory: () => crypto.randomUUID() });
    let tick = 0;
    const desk = createCreatorDesk({
      database: { check: async () => ({ ready: true }) },
      mind: { inspect: async () => ({ state: "connected", mind: { id: "demo", name: "Demo" } }), ...recorded },
      demoMind: recorded,
      workspaceStore: store, profileStore: store, proposalStore: store, publicationStore: store,
      learningStore: store, memoryStore: store, platformDraftStore: store, schedulerStore: store,
      signalSource: { collect: async ({ asOf }) => [{ id: "signal", title: "AI 工具更新", summary: "一个有来源的产品更新", sourceName: "官方", sourceUrl: "https://example.com/source", canonicalUrl: "https://example.com/source", publishedAt: asOf, relevanceScore: 0.9, synthetic: true }] },
      clock: () => new Date(Date.UTC(2026, 7, 13, 0, tick++)),
    });
    await desk.submit({ commandId: "profile-first", command: { type: "update_profile", expectedVersion: 0, positioning: "AI 与商业", audience: "中文创作者", voice: "专业、简洁、证据优先" } });
    await desk.submit({ commandId: "run-first", command: { type: "run_cycle", trigger: "manual", dataMode: "demo_only", decisionMode: "demo_mind" } });
    await desk.submit({ commandId: "proposal-first", command: { type: "prepare_proposal", signalId: "signal", proposalMode: "evidence" } });
    let dashboard = await desk.inspect({ view: "dashboard" });
    await desk.submit({ commandId: "platform-first", command: { type: "prepare_platform_draft", proposalId: dashboard.latestProposal!.operationId, platform: "x", proposalMode: "demo" } });
    await desk.submit({ commandId: "review-first", command: { type: "review_proposal", proposalId: dashboard.latestProposal!.operationId, expectedVersion: 1, decision: "approve", reason: "演示审核" } });
    dashboard = await desk.inspect({ view: "dashboard" });
    await desk.submit({ commandId: "publish-first", command: { type: "link_publication", proposalId: dashboard.latestProposal!.operationId, expectedProposalVersion: 2, mode: "demo", platform: "x", postUrl: "https://x.com/demo/status/1", actualText: "问题式开场的演示内容", publishedAt: new Date().toISOString(), metrics: { impressions: 100, likes: 10, replies: 2, reposts: 1, bookmarks: 1 } } });
    dashboard = await desk.inspect({ view: "dashboard" });
    await desk.submit({ commandId: "learn-first", command: { type: "prepare_learning", publicationId: dashboard.latestPublication!.operationId, learningMode: "demo" } });
    dashboard = await desk.inspect({ view: "dashboard" });
    const proposedMemory = dashboard.memories.find((memory) => memory.memoryId === dashboard.latestLearning!.operationId)!;
    expect(proposedMemory).toMatchObject({ status: "proposed", applicationCount: 0 });
    await desk.submit({ commandId: "accept-memory", command: { type: "manage_learning", learningId: dashboard.latestLearning!.operationId, expectedVersion: 1, action: "accept" } });
    dashboard = await desk.inspect({ view: "dashboard" });
    expect(dashboard.memories.find((memory) => memory.memoryId === proposedMemory.memoryId)).toMatchObject({ status: "accepted", createdAt: proposedMemory.createdAt, acceptedAt: expect.any(String) });
    const firstProposalId = dashboard.latestProposal!.operationId;
    await desk.submit({ commandId: "run-second", command: { type: "run_cycle", trigger: "manual", dataMode: "demo_only", decisionMode: "demo_mind" } });
    await desk.submit({ commandId: "proposal-second", command: { type: "prepare_proposal", signalId: "signal", proposalMode: "evidence" } });
    dashboard = await desk.inspect({ view: "dashboard" });
    expect(dashboard.latestProposal!.operationId).not.toBe(firstProposalId);
    await desk.submit({ commandId: "platform-second", command: { type: "prepare_platform_draft", proposalId: dashboard.latestProposal!.operationId, platform: "x", proposalMode: "demo" } });
    dashboard = await desk.inspect({ view: "dashboard" });
    expect(dashboard.latestPlatformDraft).toMatchObject({ platform: "x", validation: { valid: true } });
    expect(dashboard.latestPlatformDraft!.usedMemoryIds).toEqual([dashboard.latestLearning!.operationId]);
    expect(dashboard.memories[0]).toMatchObject({ status: "accepted", sourceProposalId: firstProposalId });
    expect(dashboard.memories[0].applicationCount).toBeGreaterThanOrEqual(1);
    await desk.submit({ commandId: "platform-xhs", command: { type: "prepare_platform_draft", proposalId: dashboard.latestProposal!.operationId, platform: "xiaohongshu", proposalMode: "demo" } });
    dashboard = await desk.inspect({ view: "dashboard" });
    expect(dashboard.latestPlatformDraft).toMatchObject({
      platform: "xiaohongshu",
      title: expect.any(String),
      coverText: expect.any(String),
      visualBrief: [expect.any(String), expect.any(String)],
      validation: { valid: true },
    });
  });

  it("拒绝 Mind 声称使用不存在的记忆", async () => {
    const store = createSqliteWorkspaceStore(":memory:");
    const recorded = createRecordedMindAuthority({ decisionIdFactory: () => "recorded" });
    const common = {
      database: { check: async () => ({ ready: true }) },
      demoMind: recorded,
      workspaceStore: store, profileStore: store, proposalStore: store, publicationStore: store,
      learningStore: store, memoryStore: store, platformDraftStore: store, schedulerStore: store,
      signalSource: { collect: async ({ asOf }: { asOf: string }) => [{ id: "signal", title: "更新", summary: "有来源的更新", sourceName: "官方", sourceUrl: "https://example.com", canonicalUrl: "https://example.com", publishedAt: asOf, relevanceScore: 0.9, synthetic: true }] },
    };
    const setup = createCreatorDesk({ ...common, mind: { inspect: async () => ({ state: "connected" as const, mind: { id: "mind", name: "Mind" } }), ...recorded } });
    await setup.submit({ commandId: "run-unknown", command: { type: "run_cycle", trigger: "manual", dataMode: "demo_only", decisionMode: "demo_mind" } });
    await setup.submit({ commandId: "proposal-unknown", command: { type: "prepare_proposal", signalId: "signal", proposalMode: "evidence" } });
    const proposal = (await setup.inspect({ view: "dashboard" })).latestProposal!;
    const desk = createCreatorDesk({ ...common, mind: {
      inspect: async () => ({ state: "connected" as const, mind: { id: "mind", name: "Mind" } }),
      draftPlatform: async (input) => ({ decisionId: "decision", mindId: "mind", mindName: "Mind", conversationAlias: "creator-main", evidenceVersion: input.evidence.version, body: "这是一个完整且有证据引用的 X 文案。", hashtags: [], evidenceRefs: [input.evidence.sources[0].id], usedMemoryIds: ["unknown-memory"], memoryInfluence: "声称使用未知记忆", memoryConflicts: [] }),
    } });
    await expect(desk.submit({ commandId: "platform-unknown", command: { type: "prepare_platform_draft", proposalId: proposal.operationId, platform: "x", proposalMode: "mind" } })).rejects.toThrow("未知或未批准");
  });

  it("雷达排序返回未批准记忆时整次运行失败", async () => {
    const store = createSqliteWorkspaceStore(":memory:");
    const desk = createCreatorDesk({
      database: { check: async () => ({ ready: true }) },
      mind: {
        inspect: async () => ({ state: "connected" as const, mind: { id: "mind", name: "Mind" } }),
        rankRadar: async (input) => ({ decisionId: "rank-unknown", mindId: "mind", mindName: "Mind", conversationAlias: "creator-main", rationale: "错误引用", usedMemoryIds: ["unknown-memory"], memoryInfluence: "错误引用未知记忆", memoryConflicts: [], rankedSignals: input.signals.map((signal) => ({ signalId: signal.id, relevanceScore: 0.9, why: "测试", recommendation: "write" as const })) }),
      },
      workspaceStore: store, profileStore: store, proposalStore: store, publicationStore: store, learningStore: store, memoryStore: store, platformDraftStore: store, schedulerStore: store,
      signalSource: { collect: async ({ asOf }) => [{ id: "signal", title: "真实更新", summary: "有来源的更新", sourceName: "官方", sourceUrl: "https://example.com", canonicalUrl: "https://example.com", publishedAt: asOf, relevanceScore: 0.9, synthetic: false }] },
    });

    await expect(desk.submit({ commandId: "rank-unknown-run", command: { type: "run_cycle", trigger: "manual", dataMode: "live_with_demo_fallback", decisionMode: "mind" } })).rejects.toThrow("未知或未批准");
  });

  it("真实 Mind 的选题和写作都不会收到 synthetic 演示记忆", async () => {
    const store = createSqliteWorkspaceStore(":memory:");
    const metrics: MetricSnapshot = { capturedAt: "2026-08-13T00:00:00.000Z", source: "manual_entry", values: {}, availableFields: [], missingFields: [], engagementRateFormula: "(likes + replies + reposts + bookmarks) / impressions", calculationState: "incomplete" };
    await store.saveMemory({ memoryId: "real-memory", scope: "global", text: "真实记忆", sourcePublicationId: "real-publication", sourceMetrics: metrics, confidence: "medium", status: "accepted", createdAt: "2026-08-13T00:00:00.000Z", applicationCount: 0, synthetic: false });
    await store.saveMemory({ memoryId: "demo-memory", scope: "global", text: "演示记忆", sourcePublicationId: "demo-publication", sourceMetrics: metrics, confidence: "medium", status: "accepted", createdAt: "2026-08-13T00:01:00.000Z", applicationCount: 0, synthetic: true });
    const received: string[][] = [];
    const desk = createCreatorDesk({
      database: { check: async () => ({ ready: true }) },
      mind: {
        inspect: async () => ({ state: "connected" as const, mind: { id: "mind", name: "Mind" } }),
        rankRadar: async (input) => {
          received.push((input.memories ?? []).map((memory) => memory.memoryId));
          return { decisionId: "rank-real", mindId: "mind", mindName: "Mind", conversationAlias: "creator-main", rationale: "真实排序", usedMemoryIds: ["real-memory"], memoryInfluence: "使用真实记忆", memoryConflicts: [], rankedSignals: input.signals.map((signal) => ({ signalId: signal.id, relevanceScore: 0.9, why: "适合", recommendation: "write" as const })) };
        },
        draftPlatform: async (input) => {
          received.push((input.memories ?? []).map((memory) => memory.memoryId));
          return { decisionId: "draft-real", mindId: "mind", mindName: "Mind", conversationAlias: "creator-main", evidenceVersion: input.evidence.version, body: "这是只使用真实记忆生成的完整 X 文案。", hashtags: [], evidenceRefs: [input.evidence.sources[0].id], usedMemoryIds: ["real-memory"], memoryInfluence: "使用真实记忆", memoryConflicts: [] };
        },
      },
      workspaceStore: store, profileStore: store, proposalStore: store, publicationStore: store, learningStore: store, memoryStore: store, platformDraftStore: store, schedulerStore: store,
      signalSource: { collect: async ({ asOf }) => [{ id: "signal", title: "真实更新", summary: "有来源的真实更新", sourceName: "官方", sourceUrl: "https://example.com", canonicalUrl: "https://example.com", publishedAt: asOf, relevanceScore: 0.9, synthetic: false }] },
    });

    await desk.submit({ commandId: "real-memory-run", command: { type: "run_cycle", trigger: "manual", dataMode: "live_with_demo_fallback", decisionMode: "mind" } });
    await desk.submit({ commandId: "real-memory-proposal", command: { type: "prepare_proposal", signalId: "signal", proposalMode: "evidence" } });
    const proposal = (await desk.inspect({ view: "dashboard" })).latestProposal!;
    await desk.submit({ commandId: "real-memory-draft", command: { type: "prepare_platform_draft", proposalId: proposal.operationId, platform: "x", proposalMode: "mind" } });

    expect(received).toEqual([["real-memory"], ["real-memory"]]);
  });

  it("平台记忆优先于全局记忆且每次最多召回五条", async () => {
    const store = createSqliteWorkspaceStore(":memory:");
    const metrics: MetricSnapshot = { capturedAt: "2026-08-13T00:00:00.000Z", source: "manual_entry", values: {}, availableFields: [], missingFields: ["impressions", "likes", "replies", "reposts", "bookmarks", "followersDelta"], engagementRateFormula: "(likes + replies + reposts + bookmarks) / impressions", calculationState: "incomplete" };
    for (let index = 0; index < 7; index += 1) {
      await store.saveMemory({ memoryId: `memory-${index}`, scope: index < 2 ? "x" : "global", text: `记忆 ${index}`, sourcePublicationId: `publication-${index}`, sourceMetrics: metrics, confidence: "medium", status: "accepted", createdAt: `2026-08-13T00:0${index}:00.000Z`, applicationCount: 0, synthetic: false });
    }

    const recalled = await store.listMemories({ scope: "x", status: "accepted" });
    expect(recalled).toHaveLength(5);
    expect(recalled.slice(0, 2).map((memory) => memory.scope)).toEqual(["x", "x"]);
    expect((await store.listMemories({ scope: "global", status: "accepted" })).every((memory) => memory.scope === "global")).toBe(true);
    await store.updateMemory({ memoryId: "memory-1", status: "deleted" });
    expect((await store.listMemories({ scope: "x", status: "accepted" })).map((memory) => memory.memoryId)).not.toContain("memory-1");
    await store.saveMemory({ memoryId: "memory-proposed", scope: "x", text: "待确认记忆", sourcePublicationId: "publication-proposed", sourceMetrics: metrics, confidence: "low", status: "proposed", createdAt: "2026-08-13T00:10:00.000Z", applicationCount: 0, synthetic: false });
    await expect(store.updateMemory({ memoryId: "memory-proposed", status: "accepted" })).resolves.toMatchObject({ status: "accepted", acceptedAt: expect.any(String) });
  });

  it("X 超长时让 Mind 最多修订两次而不是硬截断", async () => {
    const store = createSqliteWorkspaceStore(":memory:");
    const recorded = createRecordedMindAuthority({ decisionIdFactory: () => "rank" });
    let attempts = 0;
    const desk = createCreatorDesk({
      database: { check: async () => ({ ready: true }) },
      mind: {
        inspect: async () => ({ state: "connected" as const, mind: { id: "mind", name: "Mind" } }),
        draftPlatform: async (input) => {
          attempts += 1;
          return { decisionId: `draft-${attempts}`, mindId: "mind", mindName: "Mind", conversationAlias: "creator-main", evidenceVersion: input.evidence.version, body: `${"长".repeat(300)}。`, hashtags: [], evidenceRefs: [input.evidence.sources[0].id], usedMemoryIds: [], memoryInfluence: "本轮没有可用记忆。", memoryConflicts: [] };
        },
      },
      demoMind: recorded,
      workspaceStore: store, profileStore: store, proposalStore: store, publicationStore: store, learningStore: store, memoryStore: store, platformDraftStore: store, schedulerStore: store,
      signalSource: { collect: async ({ asOf }) => [{ id: "signal", title: "更新", summary: "有来源的更新", sourceName: "官方", sourceUrl: "https://example.com", canonicalUrl: "https://example.com", publishedAt: asOf, relevanceScore: 0.9, synthetic: true }] },
    });
    await desk.submit({ commandId: "rewrite-run", command: { type: "run_cycle", trigger: "manual", dataMode: "demo_only", decisionMode: "demo_mind" } });
    await desk.submit({ commandId: "rewrite-proposal", command: { type: "prepare_proposal", signalId: "signal", proposalMode: "evidence" } });
    const proposal = (await desk.inspect({ view: "dashboard" })).latestProposal!;
    await desk.submit({ commandId: "rewrite-platform", command: { type: "prepare_platform_draft", proposalId: proposal.operationId, platform: "x", proposalMode: "mind" } });

    expect(attempts).toBe(3);
    const invalid = (await desk.inspect({ view: "dashboard" })).latestPlatformDraft!;
    expect(invalid).toMatchObject({ revisionCount: 2, validation: { valid: false } });
    expect(invalid.body.length).toBeGreaterThan(280);
    await desk.submit({ commandId: "manual-edit-platform", command: { type: "edit_platform_draft", draftId: invalid.operationId, body: "创作者人工改成完整短句。", hashtags: [] } });
    expect((await desk.inspect({ view: "dashboard" })).latestPlatformDraft).toMatchObject({ body: "创作者人工改成完整短句。", editedByCreator: true, validation: { valid: true } });
  });

  it("用第一轮学习和第二轮自主决策形成可评审的 5/5 真实证据", async () => {
    const store = createSqliteWorkspaceStore(":memory:");
    let seconds = 0;
    const mind = {
      inspect: async () => ({ state: "connected" as const, mind: { id: "real-mind", name: "真实 Mind" } }),
      planAutonomousRun: async (input: Parameters<NonNullable<import("@/core/creator-desk").MindAuthority["planAutonomousRun"]>>[0]) => ({ decisionId: crypto.randomUUID(), mindId: "real-mind", mindName: "真实 Mind", conversationAlias: "creator-main", action: "scan" as const, focus: input.locked.focus ?? input.profile.positioning, reason: "根据创作者定位启动本轮扫描。", requestedDraftCount: 1, usedMemoryIds: input.memories.slice(0, 1).map((memory) => memory.memoryId), memoryInfluence: input.memories.length ? "已用长期记忆调整计划。" : "本轮没有可用记忆。", memoryConflicts: [] }),
      rankRadar: async (input: Parameters<NonNullable<import("@/core/creator-desk").MindAuthority["rankRadar"]>>[0]) => ({ decisionId: crypto.randomUUID(), mindId: "real-mind", mindName: "真实 Mind", conversationAlias: "creator-main", rationale: "按受众和已确认记忆选择。", usedMemoryIds: input.memories?.slice(0, 1).map((memory) => memory.memoryId) ?? [], memoryInfluence: input.memories?.length ? "第二轮提高证据优先角度。" : "第一轮尚无长期记忆。", memoryConflicts: [], rankedSignals: input.signals.map((signal) => ({ signalId: signal.id, relevanceScore: 0.9, why: "适合受众", recommendation: "write" as const })) }),
      draftPlatform: async (input: Parameters<NonNullable<import("@/core/creator-desk").MindAuthority["draftPlatform"]>>[0]) => ({ decisionId: crypto.randomUUID(), mindId: "real-mind", mindName: "真实 Mind", conversationAlias: "creator-main", evidenceVersion: input.evidence.version, body: "这是基于真实来源并等待创作者审核的完整内容。", hashtags: [], evidenceRefs: [input.evidence.sources[0].id], usedMemoryIds: input.memories?.slice(0, 1).map((memory) => memory.memoryId) ?? [], memoryInfluence: input.memories?.length ? "第二轮按已确认记忆强化证据表达。" : "第一轮尚无长期记忆。", memoryConflicts: [] }),
      suggestLearning: async () => ({ decisionId: crypto.randomUUID(), mindId: "real-mind", mindName: "真实 Mind", conversationAlias: "creator-main", summary: "真实指标支持下一轮测试。", suggestedMemory: "下一轮继续采用结论后紧跟来源的结构。", confidence: "high" as const }),
      commitMemory: async () => undefined,
    };
    const desk = createCreatorDesk({
      database: { check: async () => ({ ready: true }) }, mind,
      workspaceStore: store, profileStore: store, proposalStore: store, publicationStore: store, learningStore: store, memoryStore: store, platformDraftStore: store, schedulerStore: store,
      signalSource: { collect: async ({ asOf }) => [{ id: "live-signal", title: "真实产品更新", summary: "官方发布了一项可核验的产品更新。", sourceName: "官方来源", sourceUrl: "https://example.com/live", canonicalUrl: "https://example.com/live", publishedAt: asOf, relevanceScore: 0.9, synthetic: false }] },
      clock: () => new Date(Date.UTC(2026, 7, 13, 1, 0, seconds++)),
    });
    await desk.submit({ commandId: "real-profile", command: { type: "update_profile", expectedVersion: 0, positioning: "AI 商业", audience: "中文创作者", voice: "专业、简洁、证据优先" } });
    await desk.submit({ commandId: "real-run-1", command: { type: "run_cycle", trigger: "manual", dataMode: "live_with_demo_fallback", decisionMode: "mind" } });
    await desk.submit({ commandId: "real-proposal-1", command: { type: "prepare_proposal", signalId: "live-signal", proposalMode: "evidence" } });
    let dashboard = await desk.inspect({ view: "dashboard" });
    await desk.submit({ commandId: "real-draft-1", command: { type: "prepare_platform_draft", proposalId: dashboard.latestProposal!.operationId, platform: "x", proposalMode: "mind" } });
    await desk.submit({ commandId: "real-review-1", command: { type: "review_proposal", proposalId: dashboard.latestProposal!.operationId, expectedVersion: 1, decision: "approve", reason: "来源和表达均已核对" } });
    dashboard = await desk.inspect({ view: "dashboard" });
    await desk.submit({ commandId: "real-publication-1", command: { type: "link_publication", proposalId: dashboard.latestProposal!.operationId, expectedProposalVersion: 2, mode: "real", platform: "x", postUrl: "https://x.com/creator/status/1", actualText: "真实发布文本。", publishedAt: "2026-08-13T01:05:00.000Z", metrics: { impressions: 1000, likes: 60, replies: 8, reposts: 10, bookmarks: 12 } } });
    dashboard = await desk.inspect({ view: "dashboard" });
    await desk.submit({ commandId: "real-learning-1", command: { type: "prepare_learning", publicationId: dashboard.latestPublication!.operationId, learningMode: "mind" } });
    dashboard = await desk.inspect({ view: "dashboard" });
    await desk.submit({ commandId: "real-memory-accept", command: { type: "manage_learning", learningId: dashboard.latestLearning!.operationId, expectedVersion: 1, action: "accept" } });
    await desk.submit({ commandId: "real-autonomy-config", command: { type: "configure_daily_follow_up", enabled: true, mode: "real", platform: "x" } });
    await desk.submit({ commandId: "real-autonomy-run", command: { type: "process_due_follow_up" } });

    dashboard = await desk.inspect({ view: "dashboard" });
    expect(dashboard.causalChain).toMatchObject({ sourcePublication: { postUrl: "https://x.com/creator/status/1" }, memory: { status: "accepted" } });
    expect(dashboard.latestPlatformDraft!.usedMemoryIds).toEqual([dashboard.causalChain!.memory.memoryId]);
    expect(dashboard.competitionProof).toMatchObject({ readyForJudging: true, selection: { status: "verified" }, expression: { status: "verified" }, learning: { status: "verified" }, autonomy: { status: "verified" }, memoryCausality: { status: "verified" } });

    await desk.submit({ commandId: "real-run-after-proof", command: { type: "run_cycle", trigger: "manual", dataMode: "live_with_demo_fallback", decisionMode: "mind" } });
    await desk.submit({ commandId: "real-proposal-after-proof", command: { type: "prepare_proposal", signalId: "live-signal", proposalMode: "evidence" } });
    dashboard = await desk.inspect({ view: "dashboard" });
    expect(dashboard.latestPlatformDraft!.proposalId).not.toBe(dashboard.latestProposal!.operationId);
    expect(dashboard.competitionProof).toMatchObject({ readyForJudging: false, expression: { status: "missing" } });
  });

  it("真实定时配置回退到演示来源时不会把自主阶段标记为已验证", async () => {
    const store = createSqliteWorkspaceStore(":memory:");
    const mind = {
      inspect: async () => ({ state: "connected" as const, mind: { id: "real-mind", name: "真实 Mind" } }),
      planAutonomousRun: async (input: Parameters<NonNullable<import("@/core/creator-desk").MindAuthority["planAutonomousRun"]>>[0]) => ({ decisionId: "fallback-plan", mindId: "real-mind", mindName: "真实 Mind", conversationAlias: "creator-main", action: "scan" as const, focus: input.profile.positioning, reason: "启动真实扫描。", requestedDraftCount: 1, usedMemoryIds: [], memoryInfluence: "无记忆", memoryConflicts: [] }),
      rankRadar: async (input: Parameters<NonNullable<import("@/core/creator-desk").MindAuthority["rankRadar"]>>[0]) => ({ decisionId: "fallback-rank", mindId: "real-mind", mindName: "真实 Mind", conversationAlias: "creator-main", rationale: "演示回退排序", usedMemoryIds: [], memoryInfluence: "无记忆", memoryConflicts: [], rankedSignals: input.signals.map((signal) => ({ signalId: signal.id, relevanceScore: 0.8, why: "等待真实来源", recommendation: "write" as const })) }),
      draftPlatform: async (input: Parameters<NonNullable<import("@/core/creator-desk").MindAuthority["draftPlatform"]>>[0]) => ({ decisionId: "fallback-draft", mindId: "real-mind", mindName: "真实 Mind", conversationAlias: "creator-main", evidenceVersion: input.evidence.version, body: "这是明确标记为演示来源的完整内容。", hashtags: [], evidenceRefs: [input.evidence.sources[0].id], usedMemoryIds: [], memoryInfluence: "无记忆", memoryConflicts: [] }),
    };
    const now = new Date("2026-08-13T02:00:00.000Z");
    const desk = createCreatorDesk({
      database: { check: async () => ({ ready: true }) }, mind,
      workspaceStore: store, profileStore: store, proposalStore: store, publicationStore: store, learningStore: store, memoryStore: store, platformDraftStore: store, schedulerStore: store,
      signalSource: { collect: async ({ asOf }) => ({ mode: "demo" as const, warnings: ["真实来源不可用，已回退演示"], signals: [{ id: "fallback-signal", title: "演示候选", summary: "仅用于验证回退标记", sourceName: "演示来源", sourceUrl: "https://example.com/demo", canonicalUrl: "https://example.com/demo", publishedAt: asOf, relevanceScore: 0.8, synthetic: true }] }) },
      clock: () => now,
    });
    await desk.submit({ commandId: "fallback-autonomy-config", command: { type: "configure_daily_follow_up", enabled: true, mode: "real", platform: "x" } });
    await desk.submit({ commandId: "fallback-autonomy-run", command: { type: "process_due_follow_up" } });

    const dashboard = await desk.inspect({ view: "dashboard" });
    expect(dashboard.competitionProof).toMatchObject({ readyForJudging: false, autonomy: { status: "demo" } });
  });
});
