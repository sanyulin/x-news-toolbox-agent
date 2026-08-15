import { describe, expect, it, vi } from "vitest";

import { createMindsMindAuthority } from "./minds-mind-authority";
import type { CreatorMemory } from "@/core/creator-desk";

describe("Minds 能力 Adapter", () => {
  it("把自动唤醒回复解析为受用户上限约束的 Mind 计划", async () => {
    const client = {
      listMinds: vi.fn().mockResolvedValue([{ mindId: "mind-b", name: "创作者主脑" }]),
      ensureConversation: vi.fn().mockResolvedValue({ conversationId: "conv-1" }),
      getLatestHistoryFingerprint: vi.fn().mockResolvedValue("before-plan"),
      sendMessage: vi.fn().mockResolvedValue({}),
      waitForReply: vi.fn().mockResolvedValue({ timedOut: false, reply: { messageId: "plan-1", messageText: JSON.stringify({ action: "scan", focus: "AI 产品商业化", reason: "符合创作者定位，值得扫描。", requestedDraftCount: 2, usedMemoryIds: ["memory-1"], memoryInfluence: "优先寻找带商业证据的更新。", memoryConflicts: [] }) } }),
    };
    const authority = createMindsMindAuthority({ builderApiKey: "builder-key", preferredMindId: "mind-b", clientFactory: () => client });
    await expect(authority.planAutonomousRun({ asOf: "2026-08-13T09:00:00.000Z", profile: { positioning: "AI 商业", audience: "创作者", voice: "专业", version: 1, updatedAt: "2026-08-13T08:00:00.000Z" }, memories: [{ memoryId: "memory-1", scope: "global", text: "优先证据", sourcePublicationId: "publication-1", sourceMetrics: { capturedAt: "2026-08-13T08:00:00.000Z", source: "manual_entry", values: {}, availableFields: [], missingFields: [], engagementRateFormula: "(likes + replies + reposts + bookmarks) / impressions", calculationState: "incomplete" }, confidence: "medium", status: "accepted", createdAt: "2026-08-13T08:00:00.000Z", applicationCount: 0, synthetic: false }], locked: { platform: "x", maximumDrafts: 2 } })).resolves.toMatchObject({ decisionId: "plan-1", action: "scan", requestedDraftCount: 2, usedMemoryIds: ["memory-1"] });
    expect(client.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ messageText: expect.stringContaining("用户锁定配置") }));
  });

  it("把接受、替代和删除同步到同一稳定 Mind 会话", async () => {
    const client = { listMinds: vi.fn().mockResolvedValue([{ mindId: "mind-b", name: "创作者主脑" }]), ensureConversation: vi.fn().mockResolvedValue({ conversationId: "conv-1" }), getLatestHistoryFingerprint: vi.fn().mockResolvedValue(undefined), sendMessage: vi.fn().mockResolvedValue({}), waitForReply: vi.fn() };
    const authority = createMindsMindAuthority({ builderApiKey: "builder-key", preferredMindId: "mind-b", conversationAlias: "creator-main", clientFactory: () => client });
    const memory: CreatorMemory = { memoryId: "memory-1", scope: "x", text: "测试结论后紧跟来源", sourcePublicationId: "publication-1", sourceMetrics: { capturedAt: "2026-08-13T00:00:00.000Z", source: "manual_entry", values: {}, availableFields: [], missingFields: ["impressions", "likes", "replies", "reposts", "bookmarks", "followersDelta"], engagementRateFormula: "(likes + replies + reposts + bookmarks) / impressions", calculationState: "incomplete" }, confidence: "medium", status: "accepted", createdAt: "2026-08-13T00:00:00.000Z", applicationCount: 0, synthetic: false };

    await authority.commitMemory(memory);
    await authority.commitMemory({ ...memory, status: "superseded" });
    await authority.commitMemory({ ...memory, status: "deleted" });

    expect(client.ensureConversation).toHaveBeenCalledTimes(3);
    expect(client.sendMessage.mock.calls.map(([input]) => input.messageText.split(" ")[0])).toEqual(["MEMORY_COMMIT", "MEMORY_SUPERSEDE", "MEMORY_DELETE"]);
  });

  it("没有 Builder API key 时返回可执行的配置指引", async () => {
    const authority = createMindsMindAuthority({ builderApiKey: undefined });

    await expect(authority.inspect()).resolves.toEqual({
      state: "not_configured",
      guidance: "设置 MINDS_BUILDER_API_KEY 后连接核心 Mind",
    });
  });

  it("选择指定 Mind，并只在显式探针中发送验证消息", async () => {
    const client = {
      listMinds: vi.fn().mockResolvedValue([
        { mindId: "mind-a", name: "备用 Mind" },
        { mindId: "mind-b", name: "创作者主脑" },
      ]),
      ensureConversation: vi.fn().mockResolvedValue({ conversationId: "conv-1" }),
      getHistory: vi.fn().mockResolvedValue([
        { fingerprint: "0003-newest", senderType: 0, messageText: "最新回复" },
        { fingerprint: "0001-oldest", senderType: 0, messageText: "旧回复" },
      ]),
      getLatestHistoryFingerprint: vi.fn().mockResolvedValue("0001-oldest"),
      sendMessage: vi.fn().mockResolvedValue({}),
      waitForReply: vi.fn().mockResolvedValue({
        timedOut: false,
        reply: { messageText: "连接验证通过" },
      }),
    };
    const authority = createMindsMindAuthority({
      builderApiKey: "builder-key",
      preferredMindId: "mind-b",
      conversationAlias: "creator-main",
      clientFactory: () => client,
    });

    await expect(authority.inspect()).resolves.toEqual({
      state: "connected",
      mind: { id: "mind-b", name: "创作者主脑" },
    });
    expect(client.sendMessage).not.toHaveBeenCalled();

    await expect(authority.probe()).resolves.toEqual({
      ok: true,
      mindId: "mind-b",
      mindName: "创作者主脑",
      reply: "连接验证通过",
    });
    expect(client.ensureConversation).toHaveBeenCalledWith("creator-main", "mind-b");
    expect(client.sendMessage).toHaveBeenCalledOnce();
    expect(client.waitForReply).toHaveBeenCalledWith(
      expect.objectContaining({
        alias: "creator-main",
        afterFingerprint: "0003-newest",
      }),
    );
  });

  it("把雷达回复校验为结构化、可追溯的 Mind 决策", async () => {
    const client = {
      listMinds: vi.fn().mockResolvedValue([
        { mindId: "mind-b", name: "创作者主脑" },
      ]),
      ensureConversation: vi.fn().mockResolvedValue({ conversationId: "conv-1" }),
      getLatestHistoryFingerprint: vi.fn().mockResolvedValue("before-1"),
      sendMessage: vi.fn().mockResolvedValue({}),
      waitForReply: vi.fn().mockResolvedValue({
        timedOut: false,
        reply: {
          messageId: "message-001",
          fingerprint: "fingerprint-001",
          messageText: JSON.stringify({
            rationale: "这个主题最贴近创业者当前决策。" + "它还包含足够的证据、受众匹配和限制说明，应该保留完整解释。".repeat(12),
            usedMemoryIds: ["memory-x-1"],
            memoryInfluence: "根据已确认偏好提高证据型选题的优先级。",
            memoryConflicts: ["新信号与旧的短期假设存在冲突。"],
            rankedSignals: [
              {
                signalId: "signal-1",
                relevanceScore: 0.93,
                why: "提供清晰的商业判断，并说明证据强度、受众匹配、局限与下一步核验方向。".repeat(5),
                recommendation: "write",
              },
            ],
          }),
        },
      }),
    };
    const authority = createMindsMindAuthority({
      builderApiKey: "builder-key",
      preferredMindId: "mind-b",
      conversationAlias: "creator-main",
      clientFactory: () => client,
    });

    await expect(
      authority.rankRadar({
        asOf: "2026-08-05T06:00:00.000Z",
        profile: {
          positioning: "解释 AI 商业化",
          audience: "创业者",
          voice: "克制、清楚",
          version: 1,
          updatedAt: "2026-08-05T05:00:00.000Z",
        },
        signals: [
          {
            id: "signal-1",
            title: "AI 产品开始按结果收费",
            summary: "商业模式从席位费转向结果分成",
            sourceName: "演示来源",
            sourceUrl: "https://example.com/1",
            canonicalUrl: "https://example.com/1",
            publishedAt: "2026-08-05T02:00:00.000Z",
            relevanceScore: 0.7,
            synthetic: true,
          },
        ],
      }),
    ).resolves.toMatchObject({
      decisionId: "message-001",
      mindId: "mind-b",
      conversationAlias: "creator-main",
      usedMemoryIds: ["memory-x-1"],
      memoryInfluence: "根据已确认偏好提高证据型选题的优先级。",
      memoryConflicts: ["新信号与旧的短期假设存在冲突。"],
      rankedSignals: [{ signalId: "signal-1", recommendation: "write" }],
    });
    expect(client.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        alias: "creator-main",
        messageText: expect.stringContaining("解释 AI 商业化"),
      }),
    );
    expect(client.sendMessage.mock.calls[0][0].messageText).toContain("不自动发布");
  });

  it("把内容建议回复校验为绑定证据版本的中英独立草稿", async () => {
    const client = {
      listMinds: vi.fn().mockResolvedValue([
        { mindId: "mind-b", name: "创作者主脑" },
      ]),
      ensureConversation: vi.fn().mockResolvedValue({ conversationId: "conv-1" }),
      getLatestHistoryFingerprint: vi.fn().mockResolvedValue("before-2"),
      sendMessage: vi.fn().mockResolvedValue({}),
      waitForReply: vi.fn().mockResolvedValue({
        timedOut: false,
        reply: {
          messageId: "message-proposal-001",
          fingerprint: "fingerprint-proposal-001",
          messageText: JSON.stringify({
            goNoGo: "go",
            reason: "证据足以支持一个克制的观察。",
            angle: "结果计费如何改变 AI 产品价值衡量",
            evidenceVersion: "evidence-001-v1",
            chineseDraft: "结果计费正在把 AI 产品的价值承诺变成可验证结果。",
            englishDraft:
              "Outcome pricing gives AI buyers a clearer way to test delivered value.",
          }),
        },
      }),
    };
    const authority = createMindsMindAuthority({
      builderApiKey: "builder-key",
      preferredMindId: "mind-b",
      conversationAlias: "creator-main",
      clientFactory: () => client,
    });

    await expect(
      authority.draftProposal({
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
          sourceName: "商业观察",
          sourceUrl: "https://example.com/result-pricing",
          canonicalUrl: "https://example.com/result-pricing",
          publishedAt: "2026-08-05T02:00:00.000Z",
          relevanceScore: 0.93,
          synthetic: false,
        },
        evidence: {
          id: "packet-001",
          version: "evidence-001-v1",
          createdAt: "2026-08-05T07:00:00.000Z",
          signalId: "signal-1",
          synthetic: false,
          sources: [
            {
              id: "source-signal-1",
              name: "商业观察",
              url: "https://example.com/result-pricing",
              publishedAt: "2026-08-05T02:00:00.000Z",
              synthetic: false,
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
          risks: ["目前仅有单一来源"],
        },
      }),
    ).resolves.toMatchObject({
      decisionId: "message-proposal-001",
      mindId: "mind-b",
      conversationAlias: "creator-main",
      goNoGo: "go",
      evidenceVersion: "evidence-001-v1",
      chineseDraft: expect.stringContaining("可验证结果"),
      englishDraft: expect.stringContaining("delivered value"),
    });
    expect(client.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        messageText: expect.stringContaining("可以生成明确归因的一手事实更新"),
      }),
    );
  });

  it("把实际发布文本和原始指标交给 Mind 生成结构化学习更新", async () => {
    const client = {
      listMinds: vi.fn().mockResolvedValue([
        { mindId: "mind-b", name: "创作者主脑" },
      ]),
      ensureConversation: vi.fn().mockResolvedValue({ conversationId: "conv-1" }),
      getLatestHistoryFingerprint: vi.fn().mockResolvedValue("before-learning"),
      sendMessage: vi.fn().mockResolvedValue({}),
      waitForReply: vi.fn().mockResolvedValue({
        timedOut: false,
        reply: {
          messageId: "message-learning-001",
          fingerprint: "fingerprint-learning-001",
          messageText: JSON.stringify({
            summary: "问题式开场带来了可观察的回复。",
            suggestedMemory: "继续测试具体问题式开场。",
            confidence: "medium",
          }),
        },
      }),
    };
    const authority = createMindsMindAuthority({
      builderApiKey: "builder-key",
      preferredMindId: "mind-b",
      conversationAlias: "creator-main",
      clientFactory: () => client,
    });

    await expect(
      authority.suggestLearning({
        asOf: "2026-08-05T10:00:00.000Z",
        profile: {
          positioning: "解释 AI 商业化",
          audience: "创业者",
          voice: "克制、清楚",
          version: 1,
          updatedAt: "2026-08-05T05:00:00.000Z",
        },
        publication: {
          operationId: "publication-001",
          commandId: "publication-command-001",
          proposalId: "proposal-001",
          proposalVersion: 2,
          mode: "real",
          platform: "x",
          source: "manual_entry",
          postUrl: "https://x.com/example/status/123",
          actualText: "最终发布时，我把开场改成了一个具体问题。",
          publishedAt: "2026-08-05T08:30:00.000Z",
          linkedAt: "2026-08-05T09:00:00.000Z",
          metrics: {
            capturedAt: "2026-08-05T09:00:00.000Z",
            source: "manual_entry",
            values: { impressions: 1000, replies: 8 },
            availableFields: ["impressions", "replies"],
            missingFields: [
              "likes",
              "reposts",
              "bookmarks",
              "followersDelta",
            ],
            engagementRateFormula:
              "(likes + replies + reposts + bookmarks) / impressions",
            calculationState: "incomplete",
          },
        },
      }),
    ).resolves.toMatchObject({
      decisionId: "message-learning-001",
      mindId: "mind-b",
      conversationAlias: "creator-main",
      confidence: "medium",
      suggestedMemory: "继续测试具体问题式开场。",
    });
    expect(client.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        messageText: expect.stringContaining("最终发布时，我把开场改成了一个具体问题"),
      }),
    );
  });
});
