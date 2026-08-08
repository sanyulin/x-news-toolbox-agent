import type {
  CreatorProfile,
  LearningDraftInput,
  LearningMindDecision,
  MindRadarDecision,
  ProposalDraftInput,
  ProposalMindDecision,
  RadarSignal,
} from "@/core/creator-desk";

export type RecordedMindAuthority = {
  rankRadar(input: {
    asOf: string;
    profile: CreatorProfile;
    signals: RadarSignal[];
  }): Promise<MindRadarDecision>;
  draftProposal(input: ProposalDraftInput): Promise<ProposalMindDecision>;
  suggestLearning(input: LearningDraftInput): Promise<LearningMindDecision>;
};

export function createRecordedMindAuthority(options?: {
  decisionIdFactory?: () => string;
}): RecordedMindAuthority {
  return {
    async rankRadar(input) {
      const decisionId =
        options?.decisionIdFactory?.() ?? `recorded-${crypto.randomUUID()}`;
      return {
        decisionId,
        mindId: "recorded-demo-mind",
        mindName: "演示 Mind（录制适配器）",
        conversationAlias: "creator-demo",
        rationale: `按“${input.profile.positioning}”与目标受众做演示排序；结果不代表真实 Mind 调用。`,
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
