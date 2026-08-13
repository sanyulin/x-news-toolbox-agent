import type {
  CreatorProfile,
  LearningDraftInput,
  LearningMindDecision,
  MindRadarDecision,
  ProposalDraftInput,
  ProposalMindDecision,
  PlatformDraftInput,
  PlatformMindDecision,
  CreatorMemory,
  RadarSignal,
  AutonomousRunPlan,
} from "@/core/creator-desk";

export type RecordedMindAuthority = {
  planAutonomousRun(input: {
    asOf: string;
    profile: CreatorProfile;
    memories: CreatorMemory[];
    locked: { platform: "x" | "xiaohongshu"; maximumDrafts: number; focus?: string };
  }): Promise<AutonomousRunPlan>;
  rankRadar(input: {
    asOf: string;
    profile: CreatorProfile;
    signals: RadarSignal[];
    memories?: CreatorMemory[];
  }): Promise<MindRadarDecision>;
  draftProposal(input: ProposalDraftInput): Promise<ProposalMindDecision>;
  draftPlatform(input: PlatformDraftInput): Promise<PlatformMindDecision>;
  suggestLearning(input: LearningDraftInput): Promise<LearningMindDecision>;
};

export function createRecordedMindAuthority(options?: {
  decisionIdFactory?: () => string;
}): RecordedMindAuthority {
  return {
    async planAutonomousRun(input) {
      const usedMemoryIds = input.memories.slice(0, 1).map((memory) => memory.memoryId);
      return {
        decisionId: options?.decisionIdFactory?.() ?? `recorded-${crypto.randomUUID()}`,
        mindId: "recorded-demo-mind",
        mindName: "演示 Mind（录制适配器）",
        conversationAlias: "creator-demo",
        action: "scan",
        focus: input.locked.focus?.trim() || input.profile.positioning,
        reason: "演示 Mind 决定扫描用户锁定范围内的信息并准备待审核内容。",
        requestedDraftCount: input.locked.maximumDrafts,
        usedMemoryIds,
        memoryInfluence: usedMemoryIds.length ? "演示计划参考了最近一条已批准记忆。" : "本轮没有可用记忆。",
        memoryConflicts: [],
      };
    },

    async rankRadar(input) {
      const decisionId =
        options?.decisionIdFactory?.() ?? `recorded-${crypto.randomUUID()}`;
      return {
        decisionId,
        mindId: "recorded-demo-mind",
        mindName: "演示 Mind（录制适配器）",
        conversationAlias: "creator-demo",
        rationale: `按“${input.profile.positioning}”与目标受众做演示排序；结果不代表真实 Mind 调用。`,
        usedMemoryIds: input.memories?.slice(0, 1).map((memory) => memory.memoryId) ?? [],
        memoryInfluence: input.memories?.length ? "演示排序参考了最近一条已批准记忆。" : "本轮没有可用记忆。",
        memoryConflicts: [],
        rankedSignals: [...input.signals]
          .sort((left, right) => right.relevanceScore - left.relevanceScore)
          .map((signal) => ({
            signalId: signal.id,
            relevanceScore: signal.relevanceScore,
            why: `该信号与${input.profile.audience}的关注方向进行演示匹配。`,
            recommendation:
              signal.relevanceScore >= 0.8
                ? ("write" as const)
                : signal.relevanceScore >= 0.6
                  ? ("watch" as const)
                  : ("skip" as const),
          })),
      };
    },

    async draftProposal(input) {
      const decisionId =
        options?.decisionIdFactory?.() ?? `recorded-${crypto.randomUUID()}`;
      const hasSupportedClaim = input.evidence.claims.some(
        (claim) => claim.status === "supported" && claim.evidenceIds.length > 0,
      );
      if (!hasSupportedClaim) {
        return {
          decisionId,
          mindId: "recorded-demo-mind",
          mindName: "演示 Mind（录制适配器）",
          conversationAlias: "creator-demo",
          goNoGo: "no_go",
          reason: "证据不足：没有任何可验证主张关联支持来源。",
          evidenceVersion: input.evidence.version,
        };
      }

      const summary = input.signal.summary.replace(/[。！？!?]+$/u, "");
      return {
        decisionId,
        mindId: "recorded-demo-mind",
        mindName: "演示 Mind（录制适配器）",
        conversationAlias: "creator-demo",
        goNoGo: "go",
        reason: "演示证据包含可追溯来源，可生成一份明确标记的练习草稿。",
        angle: `从“${input.signal.title}”讨论对${input.profile.audience}的实际意义`,
        evidenceVersion: input.evidence.version,
        chineseDraft: `【演示草稿】${summary}。对${input.profile.audience}而言，值得关注的不是口号，而是这种变化能否带来可验证的结果。当前只有演示来源，发布前必须补充真实证据。`,
        englishDraft:
          "[DEMO DRAFT] This signal matters only if it changes measurable outcomes for the intended audience. The current example uses synthetic evidence and must not be published as fact.",
        usedMemoryIds: input.memories?.slice(0, 1).map((memory) => memory.memoryId) ?? [],
        memoryInfluence: input.memories?.length ? "演示中参考了最近一条已批准记忆。" : "本轮没有可用记忆。",
        memoryConflicts: [],
      };
    },

    async draftPlatform(input) {
      const decisionId = options?.decisionIdFactory?.() ?? `recorded-${crypto.randomUUID()}`;
      const usedMemoryIds = input.memories?.slice(0, 1).map((memory) => memory.memoryId) ?? [];
      const sourceId = input.evidence.sources[0]?.id ?? "missing-source";
      if (input.platform === "x") {
        return {
          decisionId, mindId: "recorded-demo-mind", mindName: "演示 Mind（录制适配器）", conversationAlias: "creator-demo",
          evidenceVersion: input.evidence.version,
          body: `【演示】${input.signal.summary.slice(0, 180)}。发布前请核对原始来源。`,
          hashtags: [], evidenceRefs: [sourceId], usedMemoryIds,
          memoryInfluence: usedMemoryIds.length ? "演示中参考了最近一条已批准记忆。" : "本轮没有可用记忆。",
          memoryConflicts: [],
        };
      }
      return {
        decisionId, mindId: "recorded-demo-mind", mindName: "演示 Mind（录制适配器）", conversationAlias: "creator-demo",
        evidenceVersion: input.evidence.version,
        title: "这条AI信息值得看吗",
        body: `【演示内容】\n${input.signal.summary}\n\n先看事实，再决定是否跟进。当前内容仅用于演示，发布前必须核验来源。`,
        hashtags: ["AI观察", "创作者工具"], coverText: "先核验，再表达",
        visualBrief: ["信息来源与发布时间卡片", "关键事实和未知项对照卡片"],
        evidenceRefs: [sourceId], usedMemoryIds,
        memoryInfluence: usedMemoryIds.length ? "演示中参考了最近一条已批准记忆。" : "本轮没有可用记忆。",
        memoryConflicts: [],
      };
    },

    async suggestLearning(input) {
      const decisionId =
        options?.decisionIdFactory?.() ?? `recorded-${crypto.randomUUID()}`;
      const rate = input.publication.metrics.engagementRate;
      const rateSummary =
        rate === undefined
          ? "指标字段不完整，因此没有计算互动率。"
          : `按已记录公式计算，观察互动率为 ${(rate * 100).toFixed(2)}%。`;
      const usedQuestionOpening = input.publication.actualText.includes("问题");
      return {
        decisionId,
        mindId: "recorded-demo-mind",
        mindName: "演示 Mind（录制适配器）",
        conversationAlias: "creator-demo",
        summary: `这是基于演示发布记录的学习建议。${rateSummary}`,
        suggestedMemory: usedQuestionOpening
          ? "下一轮继续测试具体问题式开场，并用完整指标验证效果。"
          : "保留最终发布文本的改写痕迹，下一轮用完整指标验证表达变化。",
        confidence: "medium",
      };
    },
  };
}
