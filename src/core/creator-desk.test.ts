import { describe, expect, it } from "vitest";

import type { PublicationLink } from "./creator-desk";
import { createCreatorDesk } from "./creator-desk";

describe("CreatorDesk 仪表盘", () => {
  it("未配置 Minds 时说明原因，同时保持演示模式可用", async () => {
    const desk = createCreatorDesk({
      database: { check: async () => ({ ready: true }) },
      mind: {
        inspect: async () => ({
          state: "not_configured",
          guidance: "设置 MINDS_BUILDER_API_KEY 后连接核心 Mind",
        }),
      },
    });

    const dashboard = await desk.inspect({ view: "dashboard" });

    expect(dashboard.systemStatus).toEqual({
      database: { state: "ready", label: "数据库已就绪" },
      mind: {
        state: "not_configured",
        label: "Minds 未连接",
        guidance: "设置 MINDS_BUILDER_API_KEY 后连接核心 Mind",
      },
      x: { state: "not_configured", label: "X 未连接" },
      demo: { state: "ready", label: "演示模式可用" },
      scheduler: { state: "not_enabled", label: "每日调度未启用" },
    });
  });

  it("配置有效 Builder API key 后显示所连接的核心 Mind", async () => {
    const desk = createCreatorDesk({
      database: { check: async () => ({ ready: true }) },
      mind: {
        inspect: async () => ({
          state: "connected",
          mind: { id: "mind-001", name: "创作者主脑" },
        }),
      },
    });

    const dashboard = await desk.inspect({ view: "dashboard" });

    expect(dashboard.systemStatus.mind).toEqual({
      state: "connected",
      label: "Minds 已连接",
      mindId: "mind-001",
      mindName: "创作者主脑",
    });
  });
});

describe("CreatorDesk 今日雷达", () => {
  it("保留真实来源模式和单个来源失败的中文警告", async () => {
    const runs: Array<any> = [];
    const desk = createCreatorDesk({
      database: { check: async () => ({ ready: true }) },
      mind: {
        inspect: async () => ({
          state: "not_configured",
          guidance: "设置 MINDS_BUILDER_API_KEY 后连接核心 Mind",
        }),
      },
      workspaceStore: {
        findRadarRunByCommandId: async () => undefined,
        saveRadarRun: async (run: any) => void runs.push(run),
        getLatestRadarRun: async () => runs.at(-1),
      },
      signalSource: {
        collect: async () => ({
          mode: "live" as const,
          warnings: ["RSS 来源「示例源」暂时不可用，已跳过"],
          signals: [
            {
              id: "live-001",
              title: "真实行业信号",
              summary: "来自 RSS 的真实内容",
              sourceName: "真实来源",
              sourceUrl: "https://example.com/live",
              canonicalUrl: "https://example.com/live",
              publishedAt: "2026-08-05T03:00:00.000Z",
              relevanceScore: 0.8,
              synthetic: false,
            },
          ],
        }),
      },
      idFactory: () => "live-operation-001",
      clock: () => new Date("2026-08-05T04:00:00.000Z"),
    });

    await desk.submit({
      commandId: "live-command-001",
      command: {
        type: "run_cycle",
        trigger: "manual",
        dataMode: "live_with_demo_fallback",
      },
    });

    await expect(desk.inspect({ view: "dashboard" })).resolves.toMatchObject({
      latestRadar: {
        mode: "live",
        warnings: ["RSS 来源「示例源」暂时不可用，已跳过"],
        signals: [{ synthetic: false }],
      },
    });
  });

  it("用演示信号生成可追溯雷达，并让重复命令保持幂等", async () => {
    const runs: Array<any> = [];
    const desk = createCreatorDesk({
      database: { check: async () => ({ ready: true }) },
      mind: {
        inspect: async () => ({
          state: "not_configured",
          guidance: "设置 MINDS_BUILDER_API_KEY 后连接核心 Mind",
        }),
      },
      workspaceStore: {
        findRadarRunByCommandId: async (commandId: string) =>
          runs.find((run) => run.commandId === commandId),
        saveRadarRun: async (run: any) => {
          runs.push(run);
        },
        getLatestRadarRun: async () => runs.at(-1),
      },
      signalSource: {
        collect: async () => [
          {
            id: "signal-low",
            title: "AI Agent 商业化出现新案例",
            summary: "重复来源中的较低相关性版本",
            sourceName: "演示科技通讯",
            sourceUrl: "https://example.com/ai-agent-business",
            canonicalUrl: "https://example.com/ai-agent-business",
            publishedAt: "2026-08-05T01:00:00.000Z",
            relevanceScore: 0.72,
            synthetic: true,
          },
          {
            id: "signal-high",
            title: "AI Agent 商业化出现新案例",
            summary: "更贴近专业创作者受众的版本",
            sourceName: "演示行业观察",
            sourceUrl: "https://example.com/ai-agent-business?ref=digest",
            canonicalUrl: "https://example.com/ai-agent-business",
            publishedAt: "2026-08-05T02:00:00.000Z",
            relevanceScore: 0.94,
            synthetic: true,
          },
          {
            id: "signal-second",
            title: "企业开始衡量 AI 投资回报",
            summary: "从采用率转向业务结果",
            sourceName: "演示商业周报",
            sourceUrl: "https://example.com/ai-roi",
            canonicalUrl: "https://example.com/ai-roi",
            publishedAt: "2026-08-05T03:00:00.000Z",
            relevanceScore: 0.86,
            synthetic: true,
          },
        ],
      },
      idFactory: () => "operation-001",
      clock: () => new Date("2026-08-05T04:00:00.000Z"),
    });

    const command = {
      commandId: "manual-demo-001",
      command: {
        type: "run_cycle" as const,
        trigger: "manual" as const,
        dataMode: "demo_only" as const,
        focus: "AI Agent 商业化",
      },
    };

    await expect(desk.submit(command)).resolves.toEqual({
      operationId: "operation-001",
      commandId: "manual-demo-001",
      disposition: "accepted",
      status: "completed",
    });

    const dashboard = await desk.inspect({ view: "dashboard" });
    expect(dashboard.latestRadar).toEqual({
      operationId: "operation-001",
      generatedAt: "2026-08-05T04:00:00.000Z",
      trigger: "manual",
      mode: "demo",
      focus: "AI Agent 商业化",
      signals: [
        expect.objectContaining({
          id: "signal-high",
          relevanceScore: 0.94,
          synthetic: true,
        }),
        expect.objectContaining({
          id: "signal-second",
          relevanceScore: 0.86,
          synthetic: true,
        }),
      ],
    });

    await expect(desk.submit(command)).resolves.toEqual({
      operationId: "operation-001",
      commandId: "manual-demo-001",
      disposition: "duplicate",
      status: "completed",
    });
    expect(runs).toHaveLength(1);
  });
});

describe("CreatorDesk 创作者档案", () => {
  it("通过同一公开入口保存并读取定位与受众，重复命令保持幂等", async () => {
    let profile: any;
    const processed = new Map<string, any>();
    const desk = createCreatorDesk({
      database: { check: async () => ({ ready: true }) },
      mind: {
        inspect: async () => ({
          state: "not_configured",
          guidance: "设置 MINDS_BUILDER_API_KEY 后连接核心 Mind",
        }),
      },
      profileStore: {
        getCreatorProfile: async () => profile,
        saveCreatorProfile: async (input: any) => {
          const duplicate = processed.get(input.commandId);
          if (duplicate) {
            return {
              operationId: duplicate.operationId,
              profile: duplicate.profile,
              disposition: "duplicate",
            };
          }
          profile = {
            ...input.profile,
            version: input.expectedVersion + 1,
            updatedAt: input.updatedAt,
          };
          processed.set(input.commandId, {
            operationId: input.operationId,
            profile,
          });
          return {
            operationId: input.operationId,
            profile,
            disposition: "accepted",
          };
        },
      },
      idFactory: () => "profile-operation-001",
      clock: () => new Date("2026-08-05T05:00:00.000Z"),
    });

    const command = {
      commandId: "profile-command-001",
      command: {
        type: "update_profile" as const,
        expectedVersion: 0,
        positioning: "面向中文创业者解释 AI 商业化",
        audience: "正在寻找 AI 落地方法的创业者与产品负责人",
        voice: "克制、清楚、证据优先",
      },
    };

    await expect(desk.submit(command)).resolves.toMatchObject({
      operationId: "profile-operation-001",
      disposition: "accepted",
      profile: { version: 1, positioning: command.command.positioning },
    });
    await expect(desk.submit(command)).resolves.toMatchObject({
      disposition: "duplicate",
      profile: { version: 1 },
    });

    const dashboard = await desk.inspect({ view: "dashboard" });
    expect(dashboard.creatorProfile).toEqual(profile);
  });
});

describe("CreatorDesk Mind 排序", () => {
  it("把创作者档案和候选信号交给核心 Mind，并保存可追溯排序", async () => {
    const runs: Array<any> = [];
    const desk = createCreatorDesk({
      database: { check: async () => ({ ready: true }) },
      mind: {
        inspect: async () => ({
          state: "connected",
          mind: { id: "mind-001", name: "创作者主脑" },
        }),
        rankRadar: async ({ profile, signals }) => {
          expect(profile.positioning).toBe("解释 AI 商业化");
          expect(signals).toHaveLength(2);
          return {
            decisionId: "message-001",
            mindId: "mind-001",
            mindName: "创作者主脑",
            conversationAlias: "creator-main",
            rationale: "优先选择能给创业者提供可执行判断的主题。",
            rankedSignals: [
              {
                signalId: "signal-b",
                relevanceScore: 0.96,
                why: "直接回应受众的落地焦虑",
                recommendation: "write",
              },
              {
                signalId: "signal-a",
                relevanceScore: 0.61,
                why: "相关但缺少新信息",
                recommendation: "watch",
              },
            ],
          };
        },
      },
      workspaceStore: {
        findRadarRunByCommandId: async (commandId: string) =>
          runs.find((run) => run.commandId === commandId),
        saveRadarRun: async (run: any) => {
          runs.push(run);
        },
        getLatestRadarRun: async () => runs.at(-1),
      },
      profileStore: {
        getCreatorProfile: async () => ({
          positioning: "解释 AI 商业化",
          audience: "创业者",
          voice: "克制、清楚",
          version: 1,
          updatedAt: "2026-08-05T05:00:00.000Z",
        }),
        saveCreatorProfile: async () => {
          throw new Error("本测试不会保存档案");
        },
      },
      signalSource: {
        collect: async () => [
          {
            id: "signal-a",
            title: "通用模型更新",
            summary: "模型发布新版本",
            sourceName: "演示来源 A",
            sourceUrl: "https://example.com/a",
            canonicalUrl: "https://example.com/a",
            publishedAt: "2026-08-05T01:00:00.000Z",
            relevanceScore: 0.9,
            synthetic: true,
          },
          {
            id: "signal-b",
            title: "AI 产品开始按结果收费",
            summary: "商业模式从席位费转向结果分成",
            sourceName: "演示来源 B",
            sourceUrl: "https://example.com/b",
            canonicalUrl: "https://example.com/b",
            publishedAt: "2026-08-05T02:00:00.000Z",
            relevanceScore: 0.7,
            synthetic: true,
          },
        ],
      },
      idFactory: () => "operation-mind-001",
      clock: () => new Date("2026-08-05T06:00:00.000Z"),
    });

    await desk.submit({
      commandId: "mind-radar-command-001",
      command: {
        type: "run_cycle",
        trigger: "manual",
        dataMode: "demo_only",
        decisionMode: "mind",
      },
    });

    const dashboard = await desk.inspect({ view: "dashboard" });
    expect(dashboard.latestRadar).toMatchObject({
      decisionMode: "mind",
      mindDecision: {
        decisionId: "message-001",
        mindId: "mind-001",
      },
      signals: [
        {
          id: "signal-b",
          relevanceScore: 0.96,
          mindReason: "直接回应受众的落地焦虑",
          recommendation: "write",
        },
        expect.objectContaining({ id: "signal-a", recommendation: "watch" }),
      ],
    });
  });
});

describe("CreatorDesk 内容建议", () => {
  it("从雷达信号生成带证据版本、Mind 指针和中英独立草稿的建议", async () => {
    const proposals: Array<any> = [];
    const radar = {
      operationId: "radar-operation-001",
      commandId: "radar-command-001",
      generatedAt: "2026-08-05T06:00:00.000Z",
      mode: "demo" as const,
      signals: [
        {
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
      ],
    };
    const desk = createCreatorDesk({
      database: { check: async () => ({ ready: true }) },
      mind: {
        inspect: async () => ({
          state: "not_configured",
          guidance: "设置 MINDS_BUILDER_API_KEY 后连接核心 Mind",
        }),
      },
      demoMind: {
        draftProposal: async ({ evidence }) => ({
          decisionId: "demo-decision-001",
          mindId: "recorded-demo-mind",
          mindName: "演示 Mind",
          conversationAlias: "creator-demo",
          goNoGo: "go",
          reason: "现有证据足以提出一个克制的观察。",
          angle: "从计费方式变化看 AI 产品价值交付",
          evidenceVersion: evidence.version,
          chineseDraft:
            "AI 产品的竞争，可能正在从卖席位转向卖结果。这个信号仍需更多真实案例验证。",
          englishDraft:
            "Outcome-based pricing may become a sharper test of whether AI products deliver real value. More cases are still needed.",
        }),
      },
      workspaceStore: {
        findRadarRunByCommandId: async () => undefined,
        saveRadarRun: async () => undefined,
        getLatestRadarRun: async () => radar,
      },
      profileStore: {
        getCreatorProfile: async () => ({
          positioning: "解释 AI 商业化",
          audience: "创业者",
          voice: "克制、清楚",
          version: 1,
          updatedAt: "2026-08-05T05:00:00.000Z",
        }),
        saveCreatorProfile: async () => {
          throw new Error("本测试不会保存档案");
        },
      },
      proposalStore: {
        findProposalByCommandId: async (commandId: string) =>
          proposals.find((proposal) => proposal.commandId === commandId),
        saveProposal: async (proposal: any) => {
          proposals.push(proposal);
        },
        getLatestProposal: async () => proposals.at(-1),
        reviewProposal: async () => {
          throw new Error("本测试不会审核建议");
        },
      },
      idFactory: () => "proposal-operation-001",
      clock: () => new Date("2026-08-05T07:00:00.000Z"),
    });

    await expect(
      desk.submit({
        commandId: "proposal-command-001",
        command: {
          type: "prepare_proposal",
          signalId: "signal-1",
          proposalMode: "demo",
        },
      }),
    ).resolves.toMatchObject({
      operationId: "proposal-operation-001",
      disposition: "accepted",
    });

    const dashboard = await desk.inspect({ view: "dashboard" });
    expect(dashboard.latestProposal).toMatchObject({
      status: "awaiting_review",
      version: 1,
      synthetic: true,
      evidence: {
        version: "evidence-proposal-operation-001-v1",
        claims: [
          expect.objectContaining({ status: "supported", evidenceIds: ["source-signal-1"] }),
          expect.objectContaining({ status: "unknown", evidenceIds: [] }),
        ],
      },
      mindDecision: {
        decisionId: "demo-decision-001",
        conversationAlias: "creator-demo",
        evidenceVersion: "evidence-proposal-operation-001-v1",
        goNoGo: "go",
      },
      chineseDraft: expect.stringContaining("卖结果"),
      englishDraft: expect.stringContaining("Outcome-based pricing"),
    });
  });

  it("待核实信号没有支持证据时保存放弃建议且不生成草稿", async () => {
    const proposals: Array<any> = [];
    const radar = {
      operationId: "radar-operation-unknown",
      commandId: "radar-command-unknown",
      generatedAt: "2026-08-05T06:00:00.000Z",
      mode: "demo" as const,
      signals: [
        {
          id: "signal-unknown",
          title: "未经交叉核验的增长传闻",
          summary: "单一演示来源声称某产品增长迅速",
          sourceName: "演示传闻来源",
          sourceUrl: "https://example.com/unverified-growth",
          canonicalUrl: "https://example.com/unverified-growth",
          publishedAt: "2026-08-05T02:00:00.000Z",
          relevanceScore: 0.8,
          synthetic: true,
          evidenceStatus: "unknown" as const,
        },
      ],
    };
    const desk = createCreatorDesk({
      database: { check: async () => ({ ready: true }) },
      mind: {
        inspect: async () => ({
          state: "not_configured",
          guidance: "设置 MINDS_BUILDER_API_KEY 后连接核心 Mind",
        }),
      },
      demoMind: {
        draftProposal: async ({ evidence }) => {
          expect(evidence.claims.every((claim) => claim.status === "unknown")).toBe(true);
          return {
            decisionId: "demo-no-go-001",
            mindId: "recorded-demo-mind",
            mindName: "演示 Mind",
            conversationAlias: "creator-demo",
            goNoGo: "no_go",
            reason: "证据不足：没有可验证主张关联支持来源。",
            evidenceVersion: evidence.version,
          };
        },
      },
      workspaceStore: {
        findRadarRunByCommandId: async () => undefined,
        saveRadarRun: async () => undefined,
        getLatestRadarRun: async () => radar,
      },
      profileStore: {
        getCreatorProfile: async () => ({
          positioning: "解释 AI 商业化",
          audience: "创业者",
          voice: "克制、清楚",
          version: 1,
          updatedAt: "2026-08-05T05:00:00.000Z",
        }),
        saveCreatorProfile: async () => {
          throw new Error("本测试不会保存档案");
        },
      },
      proposalStore: {
        findProposalByCommandId: async () => undefined,
        saveProposal: async (proposal: any) => {
          proposals.push(proposal);
        },
        getLatestProposal: async () => proposals.at(-1),
        reviewProposal: async () => {
          throw new Error("本测试不会审核建议");
        },
      },
      idFactory: () => "proposal-operation-no-go",
      clock: () => new Date("2026-08-05T07:00:00.000Z"),
    });

    await desk.submit({
      commandId: "proposal-command-no-go",
      command: {
        type: "prepare_proposal",
        signalId: "signal-unknown",
        proposalMode: "demo",
      },
    });

    const dashboard = await desk.inspect({ view: "dashboard" });
    expect(dashboard.latestProposal).toMatchObject({
      status: "abandoned",
      mindDecision: { goNoGo: "no_go" },
    });
    expect(dashboard.latestProposal?.chineseDraft).toBeUndefined();
    expect(dashboard.latestProposal?.englishDraft).toBeUndefined();
  });
});

describe("CreatorDesk 人工审核", () => {
  it("批准建议时校验版本、保持幂等，并停在已批准未发布", async () => {
    let proposal: any = {
      operationId: "proposal-operation-001",
      commandId: "proposal-command-001",
      generatedAt: "2026-08-05T07:00:00.000Z",
      version: 1,
      status: "awaiting_review",
      synthetic: true,
      signal: { id: "signal-1", title: "主题" },
      evidence: { version: "evidence-001-v1" },
      mindDecision: { decisionId: "mind-001" },
      chineseDraft: "中文草稿",
      englishDraft: "English draft",
    };
    const processed = new Map<string, { operationId: string; proposal: any }>();
    const desk = createCreatorDesk({
      database: { check: async () => ({ ready: true }) },
      mind: {
        inspect: async () => ({
          state: "not_configured",
          guidance: "设置 MINDS_BUILDER_API_KEY 后连接核心 Mind",
        }),
      },
      proposalStore: {
        findProposalByCommandId: async () => undefined,
        saveProposal: async () => undefined,
        getLatestProposal: async () => proposal,
        reviewProposal: async (input: any) => {
          const duplicate = processed.get(input.commandId);
          if (duplicate) {
            return { ...duplicate, disposition: "duplicate" };
          }
          if (proposal.version !== input.expectedVersion) {
            throw new Error("内容建议已更新，请刷新后重试");
          }
          proposal = {
            ...proposal,
            version: proposal.version + 1,
            status: "approved_unpublished",
            review: {
              decision: input.decision,
              reason: input.reason,
              decidedAt: input.decidedAt,
              reviewedVersion: input.expectedVersion,
            },
          };
          processed.set(input.commandId, {
            operationId: input.operationId,
            proposal,
          });
          return {
            operationId: input.operationId,
            proposal,
            disposition: "accepted",
          };
        },
      },
      idFactory: () => "review-operation-001",
      clock: () => new Date("2026-08-05T08:00:00.000Z"),
    });
    const command = {
      commandId: "review-command-001",
      command: {
        type: "review_proposal" as const,
        proposalId: "proposal-operation-001",
        expectedVersion: 1,
        decision: "approve" as const,
        reason: "证据边界和表达都可以接受",
      },
    };

    await expect(desk.submit(command)).resolves.toMatchObject({
      operationId: "review-operation-001",
      disposition: "accepted",
    });
    await expect(desk.submit(command)).resolves.toMatchObject({
      operationId: "review-operation-001",
      disposition: "duplicate",
    });

    const dashboard = await desk.inspect({ view: "dashboard" });
    expect(dashboard.latestProposal).toMatchObject({
      version: 2,
      status: "approved_unpublished",
      review: {
        decision: "approve",
        reason: "证据边界和表达都可以接受",
        reviewedVersion: 1,
      },
    });

    await expect(
      desk.submit({
        commandId: "review-command-stale",
        command: {
          ...command.command,
          decision: "reject",
        },
      }),
    ).rejects.toThrow("内容建议已更新");
  });
});

describe("CreatorDesk 发布关联", () => {
  it("记录手工发布文本和明确指标口径，不把缺失字段当作零", async () => {
    let publication: any;
    const processed = new Map<string, any>();
    const desk = createCreatorDesk({
      database: { check: async () => ({ ready: true }) },
      mind: {
        inspect: async () => ({
          state: "not_configured",
          guidance: "设置 MINDS_BUILDER_API_KEY 后连接核心 Mind",
        }),
      },
      publicationStore: {
        linkPublication: async (input: any) => {
          const duplicate = processed.get(input.publication.commandId);
          if (duplicate) return { ...duplicate, disposition: "duplicate" };
          publication = input.publication;
          const saved = {
            operationId: publication.operationId,
            publication,
          };
          processed.set(publication.commandId, saved);
          return { ...saved, disposition: "accepted" };
        },
        getLatestPublication: async () => publication,
      },
      idFactory: () => "publication-operation-001",
      clock: () => new Date("2026-08-05T09:00:00.000Z"),
    });
    const command = {
      commandId: "publication-command-001",
      command: {
        type: "link_publication" as const,
        proposalId: "proposal-operation-001",
        expectedProposalVersion: 2,
        mode: "demo" as const,
        postUrl: "https://x.com/example/status/123",
        actualText: "这是创作者最终手工发布的文本。",
        publishedAt: "2026-08-05T08:30:00.000Z",
        metrics: {
          impressions: 1000,
          likes: 40,
          replies: 8,
          reposts: 5,
        },
      },
    };

    await expect(desk.submit(command)).resolves.toMatchObject({
      operationId: "publication-operation-001",
      disposition: "accepted",
    });
    await expect(desk.submit(command)).resolves.toMatchObject({
      operationId: "publication-operation-001",
      disposition: "duplicate",
    });

    const dashboard = await desk.inspect({ view: "dashboard" });
    expect(dashboard.latestPublication).toMatchObject({
      source: "manual_entry",
      actualText: "这是创作者最终手工发布的文本。",
      metrics: {
        source: "manual_entry",
        availableFields: ["impressions", "likes", "replies", "reposts"],
        missingFields: ["bookmarks", "followersDelta"],
        engagementRateFormula:
          "(likes + replies + reposts + bookmarks) / impressions",
      },
    });
    expect(dashboard.latestPublication?.metrics.engagementRate).toBeUndefined();
  });
});

describe("CreatorDesk 学习更新", () => {
  it("让 Mind 基于实际发布文本和原始指标提出带来源的记忆更新", async () => {
    let learning: any;
    const publication: PublicationLink = {
      operationId: "publication-operation-001",
      commandId: "publication-command-001",
      proposalId: "proposal-operation-001",
      proposalVersion: 2,
      mode: "demo" as const,
      platform: "x" as const,
      source: "manual_entry" as const,
      postUrl: "https://x.com/example/status/123",
      actualText: "最终发布时，我把开场改成了一个具体问题。",
      publishedAt: "2026-08-05T08:30:00.000Z",
      linkedAt: "2026-08-05T09:00:00.000Z",
      metrics: {
        capturedAt: "2026-08-05T09:00:00.000Z",
        source: "manual_entry" as const,
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
          "(likes + replies + reposts + bookmarks) / impressions" as const,
        calculationState: "complete" as const,
      },
    };
    const desk = createCreatorDesk({
      database: { check: async () => ({ ready: true }) },
      mind: {
        inspect: async () => ({
          state: "not_configured",
          guidance: "设置 MINDS_BUILDER_API_KEY 后连接核心 Mind",
        }),
      },
      demoMind: {
        draftProposal: async () => {
          throw new Error("本测试不会生成建议");
        },
        suggestLearning: async ({ publication: inputPublication }) => {
          expect(inputPublication.actualText).toContain("具体问题");
          expect(inputPublication.metrics.values.replies).toBe(8);
          return {
            decisionId: "learning-decision-001",
            mindId: "recorded-demo-mind",
            mindName: "演示 Mind",
            conversationAlias: "creator-demo",
            summary: "问题式开场获得了可观察互动。",
            suggestedMemory: "优先测试具体问题式开场。",
            confidence: "medium",
          };
        },
      },
      profileStore: {
        getCreatorProfile: async () => ({
          positioning: "解释 AI 商业化",
          audience: "创业者",
          voice: "克制、清楚",
          version: 1,
          updatedAt: "2026-08-05T05:00:00.000Z",
        }),
        saveCreatorProfile: async () => {
          throw new Error("本测试不会保存档案");
        },
      },
      publicationStore: {
        linkPublication: async () => {
          throw new Error("本测试不会关联发布");
        },
        getLatestPublication: async () => publication,
      },
      learningStore: {
        findLearningByCommandId: async () => undefined,
        saveLearning: async (update: any) => {
          learning = update;
        },
        getLatestLearning: async () => learning,
        updateLearning: async () => {
          throw new Error("本测试不会管理学习记忆");
        },
      },
      idFactory: () => "learning-operation-001",
      clock: () => new Date("2026-08-05T10:00:00.000Z"),
    });

    await desk.submit({
      commandId: "learning-command-001",
      command: {
        type: "prepare_learning",
        publicationId: "publication-operation-001",
        learningMode: "demo",
      },
    });

    const dashboard = await desk.inspect({ view: "dashboard" });
    expect(dashboard.latestLearning).toMatchObject({
      status: "proposed",
      version: 1,
      synthetic: true,
      publicationId: "publication-operation-001",
      source: {
        postUrl: "https://x.com/example/status/123",
        actualText: "最终发布时，我把开场改成了一个具体问题。",
        metricsSource: "manual_entry",
      },
      mindDecision: {
        decisionId: "learning-decision-001",
        suggestedMemory: "优先测试具体问题式开场。",
        confidence: "medium",
      },
    });
  });

  it("允许用户编辑、接受或删除学习记忆，并拒绝旧版本操作", async () => {
    let learning: any = {
      operationId: "learning-operation-001",
      commandId: "learning-command-001",
      createdAt: "2026-08-05T10:00:00.000Z",
      version: 1,
      status: "proposed",
      synthetic: true,
      publicationId: "publication-operation-001",
      proposalId: "proposal-operation-001",
      source: { postUrl: "https://x.com/example/status/123" },
      mindDecision: { suggestedMemory: "继续测试问题式开场" },
      memoryText: "继续测试问题式开场",
    };
    const processed = new Map<string, any>();
    const desk = createCreatorDesk({
      database: { check: async () => ({ ready: true }) },
      mind: {
        inspect: async () => ({
          state: "not_configured",
          guidance: "设置 MINDS_BUILDER_API_KEY 后连接核心 Mind",
        }),
      },
      learningStore: {
        findLearningByCommandId: async () => undefined,
        saveLearning: async () => undefined,
        getLatestLearning: async () => learning,
        updateLearning: async (input: any) => {
          const duplicate = processed.get(input.commandId);
          if (duplicate) return { ...duplicate, disposition: "duplicate" };
          if (learning.version !== input.expectedVersion) {
            throw new Error("学习更新已变化，请刷新后重试");
          }
          learning = {
            ...learning,
            version: learning.version + 1,
            status: input.action === "delete" ? "deleted" : "accepted",
            memoryText: input.memoryText ?? learning.memoryText,
          };
          const saved = { operationId: input.operationId, update: learning };
          processed.set(input.commandId, saved);
          return { ...saved, disposition: "accepted" };
        },
      },
      idFactory: () => "memory-operation-001",
      clock: () => new Date("2026-08-05T11:00:00.000Z"),
    });
    const editCommand = {
      commandId: "memory-command-edit",
      command: {
        type: "manage_learning" as const,
        learningId: "learning-operation-001",
        expectedVersion: 1,
        action: "edit" as const,
        memoryText: "下一轮只测试一个具体问题式开场。",
      },
    };

    await expect(desk.submit(editCommand)).resolves.toMatchObject({
      disposition: "accepted",
    });
    await expect(desk.submit(editCommand)).resolves.toMatchObject({
      disposition: "duplicate",
    });
    await expect(
      desk.submit({
        commandId: "memory-command-stale",
        command: { ...editCommand.command, action: "accept" },
      }),
    ).rejects.toThrow("学习更新已变化");
    await desk.submit({
      commandId: "memory-command-delete",
      command: {
        type: "manage_learning",
        learningId: "learning-operation-001",
        expectedVersion: 2,
        action: "delete",
      },
    });

    const dashboard = await desk.inspect({ view: "dashboard" });
    expect(dashboard.latestLearning).toMatchObject({
      version: 3,
      status: "deleted",
      memoryText: "下一轮只测试一个具体问题式开场。",
    });
  });
});
