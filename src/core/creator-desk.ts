export type MindInspection =
  | {
      state: "not_configured";
      guidance: string;
    }
  | {
      state: "connected";
      mind: {
        id: string;
        name: string;
      };
    }
  | {
      state: "unavailable";
      guidance: string;
    };

export interface CreatorDeskDependencies {
  database: {
    check(): Promise<{ ready: boolean; detail?: string }>;
  };
  mind: MindAuthority;
  demoMind?: ProposalMindAuthority;
  workspaceStore?: WorkspaceStore;
  profileStore?: CreatorProfileStore;
  proposalStore?: ProposalStore;
  publicationStore?: PublicationStore;
  learningStore?: LearningStore;
  schedulerStore?: SchedulerStore;
  signalSource?: SignalSource;
  xConfigured?: boolean;
  idFactory?: () => string;
  clock?: () => Date;
}

export interface MindRadarDecision {
  decisionId: string;
  mindId: string;
  mindName: string;
  conversationAlias: string;
  rationale: string;
  rankedSignals: Array<{
    signalId: string;
    relevanceScore: number;
    why: string;
    recommendation: "write" | "watch" | "skip";
  }>;
}

export interface MindAuthority {
  inspect(): Promise<MindInspection>;
  rankRadar?(input: {
    asOf: string;
    profile: CreatorProfile;
    signals: RadarSignal[];
  }): Promise<MindRadarDecision>;
  draftProposal?(input: ProposalDraftInput): Promise<ProposalMindDecision>;
  suggestLearning?(input: LearningDraftInput): Promise<LearningMindDecision>;
}

export interface ProposalMindAuthority {
  rankRadar?(input: {
    asOf: string;
    profile: CreatorProfile;
    signals: RadarSignal[];
  }): Promise<MindRadarDecision>;
  draftProposal(input: ProposalDraftInput): Promise<ProposalMindDecision>;
  suggestLearning?(input: LearningDraftInput): Promise<LearningMindDecision>;
}

export interface CreatorProfile {
  positioning: string;
  audience: string;
  voice: string;
  version: number;
  updatedAt: string;
}

export interface CreatorProfileStore {
  getCreatorProfile(): Promise<CreatorProfile | undefined>;
  saveCreatorProfile(input: {
    operationId: string;
    commandId: string;
    expectedVersion: number;
    updatedAt: string;
    profile: Pick<CreatorProfile, "positioning" | "audience" | "voice">;
  }): Promise<{
    operationId: string;
    profile: CreatorProfile;
    disposition: "accepted" | "duplicate";
  }>;
}

export interface RadarSignal {
  id: string;
  title: string;
  summary: string;
  sourceName: string;
  sourceUrl: string;
  canonicalUrl: string;
  publishedAt: string;
  relevanceScore: number;
  synthetic: boolean;
  evidenceStatus?: "supported" | "conflicted" | "unknown";
  mindReason?: string;
  recommendation?: "write" | "watch" | "skip";
  engine?: {
    name: "horizon";
    version: string;
    score?: number;
    reason?: string;
    tags?: string[];
  };
}

export interface RadarRun {
  operationId: string;
  commandId: string;
  generatedAt: string;
  trigger?: "manual" | "daily";
  mode: "demo" | "live";
  decisionMode?: "mind" | "demo_mind";
  mindDecision?: MindRadarDecision;
  focus?: string;
  signals: RadarSignal[];
  warnings?: string[];
}

export interface WorkspaceStore {
  findRadarRunByCommandId(commandId: string): Promise<RadarRun | undefined>;
  saveRadarRun(run: RadarRun): Promise<void>;
  getLatestRadarRun(): Promise<RadarRun | undefined>;
}

export interface DailyFollowUpJob {
  operationId: string;
  enabled: boolean;
  mode: "demo" | "real";
  runState: "idle" | "running" | "failed";
  nextRunAt?: string;
  lastRunAt?: string;
  lastRadarOperationId?: string;
  lastError?: string;
  updatedAt: string;
}

export interface SchedulerStore {
  getDailyFollowUp(): Promise<DailyFollowUpJob | undefined>;
  configureDailyFollowUp(input: {
    operationId: string;
    commandId: string;
    enabled: boolean;
    mode: "demo" | "real";
    now: string;
  }): Promise<{
    operationId: string;
    job: DailyFollowUpJob;
    disposition: "accepted" | "duplicate";
  }>;
  claimDueDailyFollowUp(input: {
    now: string;
  }): Promise<{ job: DailyFollowUpJob; scheduledFor: string } | undefined>;
  completeDailyFollowUp(input: {
    completedAt: string;
    nextRunAt: string;
    radarOperationId: string;
  }): Promise<void>;
  failDailyFollowUp(input: {
    failedAt: string;
    nextRunAt: string;
    error: string;
  }): Promise<void>;
}

export interface SignalSource {
  collect(input: {
    focus?: string;
    asOf: string;
    dataMode?: "demo_only" | "live_with_demo_fallback";
  }): Promise<RadarSignal[] | SignalCollection>;
}

export interface SignalCollection {
  signals: RadarSignal[];
  mode: "demo" | "live";
  warnings: string[];
}

export interface EvidencePacket {
  id: string;
  version: string;
  createdAt: string;
  signalId: string;
  synthetic: boolean;
  sources: Array<{
    id: string;
    name: string;
    url: string;
    publishedAt: string;
    synthetic: boolean;
  }>;
  claims: Array<{
    id: string;
    text: string;
    status: "supported" | "conflicted" | "unknown";
    evidenceIds: string[];
  }>;
  risks: string[];
}

export interface ProposalDraftInput {
  asOf: string;
  profile: CreatorProfile;
  signal: RadarSignal;
  evidence: EvidencePacket;
  radarDecision?: MindRadarDecision;
}

export interface ProposalMindDecision {
  decisionId: string;
  mindId: string;
  mindName: string;
  conversationAlias: string;
  goNoGo: "go" | "no_go";
  reason: string;
  angle?: string;
  evidenceVersion: string;
  chineseDraft?: string;
  englishDraft?: string;
}

export interface ContentProposal {
  operationId: string;
  commandId: string;
  generatedAt: string;
  version: number;
  status:
    | "awaiting_review"
    | "needs_changes"
    | "approved_unpublished"
    | "rejected"
    | "abandoned";
  synthetic: boolean;
  radarProof?: {
    operationId: string;
    mode: RadarRun["mode"];
    decisionMode?: RadarRun["decisionMode"];
    mindDecision?: MindRadarDecision;
  };
  signal: RadarSignal;
  evidence: EvidencePacket;
  mindDecision: ProposalMindDecision;
  chineseDraft?: string;
  englishDraft?: string;
  review?: {
    decision: "approve" | "request_changes" | "reject";
    reason: string;
    decidedAt: string;
    reviewedVersion: number;
  };
}

export interface ProposalStore {
  findProposalByCommandId(commandId: string): Promise<ContentProposal | undefined>;
  saveProposal(proposal: ContentProposal): Promise<void>;
  getLatestProposal(): Promise<ContentProposal | undefined>;
  reviewProposal(input: {
    operationId: string;
    commandId: string;
    proposalId: string;
    expectedVersion: number;
    decision: "approve" | "request_changes" | "reject";
    reason: string;
    decidedAt: string;
  }): Promise<{
    operationId: string;
    proposal: ContentProposal;
    disposition: "accepted" | "duplicate";
  }>;
}

export type MetricField =
  | "impressions"
  | "likes"
  | "replies"
  | "reposts"
  | "bookmarks"
  | "followersDelta";

export interface MetricSnapshot {
  capturedAt: string;
  source: "manual_entry";
  values: Partial<Record<MetricField, number>>;
  availableFields: MetricField[];
  missingFields: MetricField[];
  engagementRate?: number;
  engagementRateFormula:
    "(likes + replies + reposts + bookmarks) / impressions";
  calculationState: "complete" | "incomplete" | "invalid_impressions";
}

export interface PublicationLink {
  operationId: string;
  commandId: string;
  proposalId: string;
  proposalVersion: number;
  mode: "demo" | "real";
  platform: "x";
  source: "manual_entry";
  postUrl: string;
  actualText: string;
  publishedAt: string;
  linkedAt: string;
  metrics: MetricSnapshot;
}

export interface PublicationStore {
  linkPublication(input: {
    publication: PublicationLink;
    expectedProposalVersion: number;
  }): Promise<{
    operationId: string;
    publication: PublicationLink;
    disposition: "accepted" | "duplicate";
  }>;
  getLatestPublication(): Promise<PublicationLink | undefined>;
}

export interface LearningDraftInput {
  asOf: string;
  profile: CreatorProfile;
  publication: PublicationLink;
}

export interface LearningMindDecision {
  decisionId: string;
  mindId: string;
  mindName: string;
  conversationAlias: string;
  summary: string;
  suggestedMemory: string;
  confidence: "low" | "medium" | "high";
}

export interface LearningUpdate {
  operationId: string;
  commandId: string;
  createdAt: string;
  version: number;
  status: "proposed" | "accepted" | "deleted";
  synthetic: boolean;
  publicationId: string;
  proposalId: string;
  source: {
    postUrl: string;
    actualText: string;
    metricsSource: "manual_entry";
    metricsCapturedAt: string;
  };
  mindDecision: LearningMindDecision;
  memoryText: string;
}

export interface LearningStore {
  findLearningByCommandId(commandId: string): Promise<LearningUpdate | undefined>;
  saveLearning(update: LearningUpdate): Promise<void>;
  getLatestLearning(): Promise<LearningUpdate | undefined>;
  updateLearning(input: {
    operationId: string;
    commandId: string;
    learningId: string;
    expectedVersion: number;
    action: "accept" | "edit" | "delete";
    memoryText?: string;
    updatedAt: string;
  }): Promise<{
    operationId: string;
    update: LearningUpdate;
    disposition: "accepted" | "duplicate";
  }>;
}

export interface DashboardView {
  systemStatus: {
    database:
      | { state: "ready"; label: "数据库已就绪" }
      | { state: "unavailable"; label: "数据库不可用"; guidance?: string };
    mind:
      | {
          state: "not_configured" | "unavailable";
          label: "Minds 未连接" | "Minds 暂时不可用";
          guidance: string;
        }
      | {
          state: "connected";
          label: "Minds 已连接";
          mindId: string;
          mindName: string;
        };
    x:
      | { state: "not_configured"; label: "X 未连接" }
      | { state: "connected"; label: "X 官方 API 已配置" };
    demo: { state: "ready"; label: "演示模式可用" };
    scheduler:
      | { state: "not_enabled"; label: "每日调度未启用" }
      | ({ state: "enabled"; label: string } & Omit<
          DailyFollowUpJob,
          "operationId" | "enabled" | "updatedAt"
        >);
  };
  creatorProfile?: CreatorProfile;
  latestRadar?: Omit<RadarRun, "commandId">;
  latestProposal?: Omit<ContentProposal, "commandId">;
  latestPublication?: Omit<PublicationLink, "commandId">;
  latestLearning?: Omit<LearningUpdate, "commandId">;
  competitionProof: CompetitionProof;
}

export interface CompetitionProofStage {
  status: "verified" | "demo" | "missing";
  label: string;
  detail: string;
  decisionId?: string;
  mindName?: string;
  conversationAlias?: string;
}

export interface CompetitionProof {
  readyForJudging: boolean;
  generatedAt: string;
  selection: CompetitionProofStage;
  expression: CompetitionProofStage;
  learning: CompetitionProofStage;
  autonomy: CompetitionProofStage;
}

export interface CreatorDesk {
  submit(input: {
    commandId: string;
    command:
      | {
          type: "run_cycle";
          trigger: "manual" | "daily";
          dataMode: "demo_only" | "live_with_demo_fallback";
          decisionMode?: "rules" | "mind" | "demo_mind";
          focus?: string;
        }
      | {
          type: "update_profile";
          expectedVersion: number;
          positioning: string;
          audience: string;
          voice: string;
        }
      | {
          type: "prepare_proposal";
          signalId: string;
          proposalMode: "demo" | "mind";
        }
      | {
          type: "review_proposal";
          proposalId: string;
          expectedVersion: number;
          decision: "approve" | "request_changes" | "reject";
          reason: string;
        }
      | {
          type: "link_publication";
          proposalId: string;
          expectedProposalVersion: number;
          mode: "demo" | "real";
          postUrl: string;
          actualText: string;
          publishedAt: string;
          metrics: Partial<Record<MetricField, number>>;
        }
      | {
          type: "prepare_learning";
          publicationId: string;
          learningMode: "demo" | "mind";
        }
      | {
          type: "manage_learning";
          learningId: string;
          expectedVersion: number;
          action: "accept" | "edit" | "delete";
          memoryText?: string;
        }
      | {
          type: "configure_daily_follow_up";
          enabled: boolean;
          mode: "demo" | "real";
        }
      | {
          type: "process_due_follow_up";
        };
  }): Promise<{
    operationId: string;
    commandId: string;
    disposition: "accepted" | "duplicate";
    status: "completed";
    profile?: CreatorProfile;
  }>;
  inspect(query: { view: "dashboard" }): Promise<DashboardView>;
}

export function createCreatorDesk(
  dependencies: CreatorDeskDependencies,
): CreatorDesk {
  const newId = dependencies.idFactory ?? (() => crypto.randomUUID());
  const desk: CreatorDesk = {
    async submit(input) {
      if (input.command.type === "update_profile") {
        if (!dependencies.profileStore) {
          throw new Error("创作者档案尚未配置");
        }

        const result = await dependencies.profileStore.saveCreatorProfile({
          operationId: newId(),
          commandId: input.commandId,
          expectedVersion: input.command.expectedVersion,
          updatedAt: (dependencies.clock ?? (() => new Date()))().toISOString(),
          profile: {
            positioning: input.command.positioning,
            audience: input.command.audience,
            voice: input.command.voice,
          },
        });
        return {
          operationId: result.operationId,
          commandId: input.commandId,
          disposition: result.disposition,
          status: "completed",
          profile: result.profile,
        };
      }

      if (input.command.type === "configure_daily_follow_up") {
        if (!dependencies.schedulerStore) {
          throw new Error("每日自主跟进尚未配置");
        }
        if (input.command.enabled && input.command.mode === "real") {
          const inspection = await dependencies.mind.inspect();
          if (inspection.state !== "connected") {
            throw new Error("请先连接核心 Mind，再启用真实每日跟进");
          }
        }
        const now = (dependencies.clock ?? (() => new Date()))().toISOString();
        const result = await dependencies.schedulerStore.configureDailyFollowUp({
          operationId: newId(),
          commandId: input.commandId,
          enabled: input.command.enabled,
          mode: input.command.mode,
          now,
        });
        return {
          operationId: result.operationId,
          commandId: input.commandId,
          disposition: result.disposition,
          status: "completed",
        };
      }

      if (input.command.type === "process_due_follow_up") {
        if (!dependencies.schedulerStore) {
          throw new Error("每日自主跟进尚未配置");
        }
        const now = (dependencies.clock ?? (() => new Date()))();
        const claimed = await dependencies.schedulerStore.claimDueDailyFollowUp({
          now: now.toISOString(),
        });
        if (!claimed) {
          return {
            operationId: "daily-follow-up-idle",
            commandId: input.commandId,
            disposition: "duplicate",
            status: "completed",
          };
        }

        const nextRunAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
        try {
          const result = await desk.submit({
            commandId: `daily-radar:${claimed.scheduledFor}`,
            command: {
              type: "run_cycle",
              trigger: "daily",
              dataMode:
                claimed.job.mode === "real"
                  ? "live_with_demo_fallback"
                  : "demo_only",
              decisionMode:
                claimed.job.mode === "real" ? "mind" : "demo_mind",
            },
          });
          await dependencies.schedulerStore.completeDailyFollowUp({
            completedAt: now.toISOString(),
            nextRunAt,
            radarOperationId: result.operationId,
          });
          return {
            ...result,
            commandId: input.commandId,
          };
        } catch (error) {
          await dependencies.schedulerStore.failDailyFollowUp({
            failedAt: now.toISOString(),
            nextRunAt,
            error: error instanceof Error ? error.message : "每日自主跟进失败",
          });
          throw error;
        }
      }

      if (input.command.type === "prepare_proposal") {
        if (
          !dependencies.workspaceStore ||
          !dependencies.profileStore ||
          !dependencies.proposalStore
        ) {
          throw new Error("内容建议尚未配置");
        }

        const existing = await dependencies.proposalStore.findProposalByCommandId(
          input.commandId,
        );
        if (existing) {
          return {
            operationId: existing.operationId,
            commandId: existing.commandId,
            disposition: "duplicate",
            status: "completed",
          };
        }

        const [radar, storedProfile] = await Promise.all([
          dependencies.workspaceStore.getLatestRadarRun(),
          dependencies.profileStore.getCreatorProfile(),
        ]);
        if (!radar) throw new Error("请先运行今日雷达");
        const profile = storedProfile ?? defaultCreatorProfile();
        const signalId = input.command.signalId;
        const signal = radar.signals.find(
          (candidate) => candidate.id === signalId,
        );
        if (!signal) throw new Error("所选信号不在最新雷达中");

        const operationId = newId();
        const now = (dependencies.clock ?? (() => new Date()))().toISOString();
        const evidenceVersion = `evidence-${operationId}-v1`;
        const sourceId = `source-${signal.id}`;
        const claimStatus = signal.evidenceStatus ?? "supported";
        const supportingEvidenceIds =
          claimStatus === "unknown" ? [] : [sourceId];
        const evidence: EvidencePacket = {
          id: `packet-${operationId}`,
          version: evidenceVersion,
          createdAt: now,
          signalId: signal.id,
          synthetic: signal.synthetic,
          sources: [
            {
              id: sourceId,
              name: signal.sourceName,
              url: signal.sourceUrl,
              publishedAt: signal.publishedAt,
              synthetic: signal.synthetic,
            },
          ],
          claims: [
            {
              id: `claim-${signal.id}-reported`,
              text: signal.summary,
              status: claimStatus,
              evidenceIds: supportingEvidenceIds,
            },
            {
              id: `claim-${signal.id}-trend`,
              text: "该信号是否代表可持续的长期趋势",
              status: claimStatus === "supported" ? "unknown" : claimStatus,
              evidenceIds: [],
            },
          ],
          risks: [
            claimStatus === "unknown"
              ? "来源没有提供足够依据支持该主张"
              : claimStatus === "conflicted"
                ? "现有来源互相冲突，不应使用确定语气"
                : signal.synthetic
                  ? "当前证据来自演示数据，不可当作真实事实发布"
                  : "当前仅有单一来源，发布前建议交叉核验",
          ],
        };
        const authority =
          input.command.proposalMode === "demo"
            ? dependencies.demoMind
            : dependencies.mind.draftProposal
              ? dependencies.mind
              : undefined;
        if (!authority?.draftProposal) {
          throw new Error(
            input.command.proposalMode === "demo"
              ? "演示 Mind 尚未配置"
              : "核心 Mind 尚未配置内容建议能力",
          );
        }

        const decision = await authority.draftProposal({
          asOf: now,
          profile,
          signal,
          evidence,
          radarDecision: radar.mindDecision,
        });
        if (decision.evidenceVersion !== evidence.version) {
          throw new Error("Mind 返回的证据版本与本轮不一致");
        }
        if (
          decision.goNoGo === "go" &&
          (!decision.chineseDraft ||
            !decision.englishDraft ||
            decision.chineseDraft.trim() === decision.englishDraft.trim())
        ) {
          throw new Error("Mind 未返回合格的中英独立草稿");
        }

        const proposal: ContentProposal = {
          operationId,
          commandId: input.commandId,
          generatedAt: now,
          version: 1,
          status:
            decision.goNoGo === "go" ? "awaiting_review" : "abandoned",
          synthetic: input.command.proposalMode === "demo" || signal.synthetic,
          radarProof: {
            operationId: radar.operationId,
            mode: radar.mode,
            decisionMode: radar.decisionMode,
            mindDecision: radar.mindDecision,
          },
          signal,
          evidence,
          mindDecision: decision,
          chineseDraft: decision.chineseDraft,
          englishDraft: decision.englishDraft,
        };
        await dependencies.proposalStore.saveProposal(proposal);
        return {
          operationId,
          commandId: input.commandId,
          disposition: "accepted",
          status: "completed",
        };
      }

      if (input.command.type === "review_proposal") {
        if (!dependencies.proposalStore) {
          throw new Error("人工审核尚未配置");
        }
        const result = await dependencies.proposalStore.reviewProposal({
          operationId: newId(),
          commandId: input.commandId,
          proposalId: input.command.proposalId,
          expectedVersion: input.command.expectedVersion,
          decision: input.command.decision,
          reason: input.command.reason,
          decidedAt: (dependencies.clock ?? (() => new Date()))().toISOString(),
        });
        return {
          operationId: result.operationId,
          commandId: input.commandId,
          disposition: result.disposition,
          status: "completed",
        };
      }

      if (input.command.type === "link_publication") {
        if (!dependencies.publicationStore) {
          throw new Error("发布关联尚未配置");
        }
        const operationId = newId();
        const linkedAt = (
          dependencies.clock ?? (() => new Date())
        )().toISOString();
        const metrics = input.command.metrics;
        const fields: MetricField[] = [
          "impressions",
          "likes",
          "replies",
          "reposts",
          "bookmarks",
          "followersDelta",
        ];
        const availableFields = fields.filter(
          (field) => metrics[field] !== undefined,
        );
        const missingFields = fields.filter(
          (field) => metrics[field] === undefined,
        );
        const rateFields: MetricField[] = [
          "impressions",
          "likes",
          "replies",
          "reposts",
          "bookmarks",
        ];
        const hasCompleteRate = rateFields.every(
          (field) => metrics[field] !== undefined,
        );
        const impressions = metrics.impressions;
        const engagementRate =
          hasCompleteRate && impressions !== undefined && impressions > 0
            ? ((metrics.likes as number) +
                (metrics.replies as number) +
                (metrics.reposts as number) +
                (metrics.bookmarks as number)) /
              impressions
            : undefined;
        const publication: PublicationLink = {
          operationId,
          commandId: input.commandId,
          proposalId: input.command.proposalId,
          proposalVersion: input.command.expectedProposalVersion,
          mode: input.command.mode,
          platform: "x",
          source: "manual_entry",
          postUrl: input.command.postUrl,
          actualText: input.command.actualText,
          publishedAt: input.command.publishedAt,
          linkedAt,
          metrics: {
            capturedAt: linkedAt,
            source: "manual_entry",
            values: metrics,
            availableFields,
            missingFields,
            engagementRate,
            engagementRateFormula:
              "(likes + replies + reposts + bookmarks) / impressions",
            calculationState: !hasCompleteRate
              ? "incomplete"
              : impressions === undefined || impressions <= 0
                ? "invalid_impressions"
                : "complete",
          },
        };
        const result = await dependencies.publicationStore.linkPublication({
          publication,
          expectedProposalVersion: input.command.expectedProposalVersion,
        });
        return {
          operationId: result.operationId,
          commandId: input.commandId,
          disposition: result.disposition,
          status: "completed",
        };
      }

      if (input.command.type === "prepare_learning") {
        if (
          !dependencies.publicationStore ||
          !dependencies.profileStore ||
          !dependencies.learningStore
        ) {
          throw new Error("学习更新尚未配置");
        }
        const existing = await dependencies.learningStore.findLearningByCommandId(
          input.commandId,
        );
        if (existing) {
          return {
            operationId: existing.operationId,
            commandId: existing.commandId,
            disposition: "duplicate",
            status: "completed",
          };
        }

        const [publication, profile] = await Promise.all([
          dependencies.publicationStore.getLatestPublication(),
          dependencies.profileStore.getCreatorProfile(),
        ]);
        if (!publication || publication.operationId !== input.command.publicationId) {
          throw new Error("发布关联不存在或不是最新记录");
        }
        if (!profile) throw new Error("请先保存创作者基线");
        const authority =
          input.command.learningMode === "demo"
            ? dependencies.demoMind
            : dependencies.mind.suggestLearning
              ? dependencies.mind
              : undefined;
        if (!authority?.suggestLearning) {
          throw new Error(
            input.command.learningMode === "demo"
              ? "演示 Mind 尚未配置学习能力"
              : "核心 Mind 尚未配置学习能力",
          );
        }
        const operationId = newId();
        const createdAt = (
          dependencies.clock ?? (() => new Date())
        )().toISOString();
        const decision = await authority.suggestLearning({
          asOf: createdAt,
          profile,
          publication,
        });
        const update: LearningUpdate = {
          operationId,
          commandId: input.commandId,
          createdAt,
          version: 1,
          status: "proposed",
          synthetic:
            input.command.learningMode === "demo" || publication.mode === "demo",
          publicationId: publication.operationId,
          proposalId: publication.proposalId,
          source: {
            postUrl: publication.postUrl,
            actualText: publication.actualText,
            metricsSource: publication.metrics.source,
            metricsCapturedAt: publication.metrics.capturedAt,
          },
          mindDecision: decision,
          memoryText: decision.suggestedMemory,
        };
        await dependencies.learningStore.saveLearning(update);
        return {
          operationId,
          commandId: input.commandId,
          disposition: "accepted",
          status: "completed",
        };
      }

      if (input.command.type === "manage_learning") {
        if (!dependencies.learningStore) {
          throw new Error("学习更新尚未配置");
        }
        if (
          input.command.action === "edit" &&
          !input.command.memoryText?.trim()
        ) {
          throw new Error("编辑学习记忆时必须提供新内容");
        }
        const result = await dependencies.learningStore.updateLearning({
          operationId: newId(),
          commandId: input.commandId,
          learningId: input.command.learningId,
          expectedVersion: input.command.expectedVersion,
          action: input.command.action,
          memoryText: input.command.memoryText?.trim(),
          updatedAt: (dependencies.clock ?? (() => new Date()))().toISOString(),
        });
        return {
          operationId: result.operationId,
          commandId: input.commandId,
          disposition: result.disposition,
          status: "completed",
        };
      }

      if (!dependencies.workspaceStore || !dependencies.signalSource) {
        throw new Error("今日雷达尚未配置");
      }

      const existing = await dependencies.workspaceStore.findRadarRunByCommandId(
        input.commandId,
      );
      if (existing) {
        return {
          operationId: existing.operationId,
          commandId: existing.commandId,
          disposition: "duplicate",
          status: "completed",
        };
      }

      const now = (dependencies.clock ?? (() => new Date()))();
      const collected = await dependencies.signalSource.collect({
        focus: input.command.focus,
        asOf: now.toISOString(),
        dataMode: input.command.dataMode,
      });
      const signals = Array.isArray(collected) ? collected : collected.signals;
      const collectedSignals = [...
        signals.reduce((byUrl, signal) => {
          const current = byUrl.get(signal.canonicalUrl);
          if (!current || signal.relevanceScore > current.relevanceScore) {
            byUrl.set(signal.canonicalUrl, signal);
          }
          return byUrl;
        }, new Map<string, RadarSignal>()),
      ]
        .map(([, signal]) => signal)
        .sort((left, right) => right.relevanceScore - left.relevanceScore);

      let uniqueSignals = collectedSignals;
      let mindDecision: MindRadarDecision | undefined;
      if (
        input.command.decisionMode === "mind" ||
        input.command.decisionMode === "demo_mind"
      ) {
        const profile =
          (await dependencies.profileStore?.getCreatorProfile()) ??
          defaultCreatorProfile(input.command.focus);
        const rankingMind =
          input.command.decisionMode === "mind"
            ? dependencies.mind
            : dependencies.demoMind;
        if (!rankingMind?.rankRadar) {
          throw new Error(
            input.command.decisionMode === "mind"
              ? "核心 Mind 尚未配置排序能力"
              : "演示 Mind 尚未配置排序能力",
          );
        }

        mindDecision = await rankingMind.rankRadar({
          asOf: now.toISOString(),
          profile,
          signals: collectedSignals,
        });
        const byId = new Map(collectedSignals.map((signal) => [signal.id, signal]));
        const seen = new Set<string>();
        uniqueSignals = mindDecision.rankedSignals.map((ranked) => {
          const signal = byId.get(ranked.signalId);
          if (!signal || seen.has(ranked.signalId)) {
            throw new Error("Mind 返回了无效或重复的信号标识");
          }
          seen.add(ranked.signalId);
          return {
            ...signal,
            relevanceScore: ranked.relevanceScore,
            mindReason: ranked.why,
            recommendation: ranked.recommendation,
          };
        });
      }

      const run: RadarRun = {
        operationId: newId(),
        commandId: input.commandId,
        generatedAt: now.toISOString(),
        trigger: input.command.trigger,
        mode: Array.isArray(collected)
          ? signals.every((signal) => signal.synthetic)
            ? "demo"
            : "live"
          : collected.mode,
        decisionMode: mindDecision
          ? input.command.decisionMode === "demo_mind"
            ? "demo_mind"
            : "mind"
          : undefined,
        mindDecision,
        focus: input.command.focus,
        signals: uniqueSignals,
        warnings: Array.isArray(collected) ? undefined : collected.warnings,
      };
      await dependencies.workspaceStore.saveRadarRun(run);

      return {
        operationId: run.operationId,
        commandId: run.commandId,
        disposition: "accepted",
        status: "completed",
      };
    },

    async inspect(query) {
      if (query.view !== "dashboard") {
        throw new Error("不支持的只读视图");
      }

      const [
        database,
        mind,
        creatorProfile,
        latestProposal,
        latestPublication,
        latestLearning,
        dailyFollowUp,
      ] = await Promise.all([
        dependencies.database.check(),
        dependencies.mind.inspect(),
        dependencies.profileStore?.getCreatorProfile(),
        dependencies.proposalStore?.getLatestProposal(),
        dependencies.publicationStore?.getLatestPublication(),
        dependencies.learningStore?.getLatestLearning(),
        dependencies.schedulerStore?.getDailyFollowUp(),
      ]);
      const latestRadar = await dependencies.workspaceStore?.getLatestRadarRun();
      const competitionProof = buildCompetitionProof({
        latestRadar,
        latestProposal,
        latestPublication,
        latestLearning,
        dailyFollowUp,
        generatedAt: (dependencies.clock ?? (() => new Date()))().toISOString(),
      });

      const mindStatus: DashboardView["systemStatus"]["mind"] =
        mind.state === "connected"
          ? {
              state: "connected",
              label: "Minds 已连接",
              mindId: mind.mind.id,
              mindName: mind.mind.name,
            }
          : {
              state: mind.state,
              label:
                mind.state === "not_configured"
                  ? "Minds 未连接"
                  : "Minds 暂时不可用",
              guidance: mind.guidance,
            };

      return {
        systemStatus: {
          database: database.ready
            ? { state: "ready", label: "数据库已就绪" }
            : {
                state: "unavailable",
                label: "数据库不可用",
                guidance: database.detail,
              },
          mind: mindStatus,
          x: dependencies.xConfigured
            ? { state: "connected", label: "X 官方 API 已配置" }
            : { state: "not_configured", label: "X 未连接" },
          demo: { state: "ready", label: "演示模式可用" },
          scheduler: dailyFollowUp?.enabled
            ? {
                state: "enabled",
                label:
                  dailyFollowUp.mode === "real"
                    ? "真实每日跟进已启用"
                    : "演示每日跟进已启用",
                mode: dailyFollowUp.mode,
                runState: dailyFollowUp.runState,
                nextRunAt: dailyFollowUp.nextRunAt,
                lastRunAt: dailyFollowUp.lastRunAt,
                lastRadarOperationId: dailyFollowUp.lastRadarOperationId,
                lastError: dailyFollowUp.lastError,
              }
            : { state: "not_enabled", label: "每日调度未启用" },
        },
        creatorProfile,
        latestProposal: latestProposal
          ? {
              operationId: latestProposal.operationId,
              generatedAt: latestProposal.generatedAt,
              version: latestProposal.version,
              status: latestProposal.status,
              synthetic: latestProposal.synthetic,
              radarProof: latestProposal.radarProof,
              signal: latestProposal.signal,
              evidence: latestProposal.evidence,
              mindDecision: latestProposal.mindDecision,
              chineseDraft: latestProposal.chineseDraft,
              englishDraft: latestProposal.englishDraft,
              review: latestProposal.review,
            }
          : undefined,
        latestPublication: latestPublication
          ? {
              operationId: latestPublication.operationId,
              proposalId: latestPublication.proposalId,
              proposalVersion: latestPublication.proposalVersion,
              mode: latestPublication.mode,
              platform: latestPublication.platform,
              source: latestPublication.source,
              postUrl: latestPublication.postUrl,
              actualText: latestPublication.actualText,
              publishedAt: latestPublication.publishedAt,
              linkedAt: latestPublication.linkedAt,
              metrics: latestPublication.metrics,
            }
          : undefined,
        latestLearning: latestLearning
          ? {
              operationId: latestLearning.operationId,
              createdAt: latestLearning.createdAt,
              version: latestLearning.version,
              status: latestLearning.status,
              synthetic: latestLearning.synthetic,
              publicationId: latestLearning.publicationId,
              proposalId: latestLearning.proposalId,
              source: latestLearning.source,
              mindDecision: latestLearning.mindDecision,
              memoryText: latestLearning.memoryText,
            }
          : undefined,
        competitionProof,
        latestRadar: latestRadar
          ? {
              operationId: latestRadar.operationId,
              generatedAt: latestRadar.generatedAt,
              trigger: latestRadar.trigger,
              mode: latestRadar.mode,
              decisionMode: latestRadar.decisionMode,
              mindDecision: latestRadar.mindDecision,
              focus: latestRadar.focus,
              signals: latestRadar.signals,
              warnings: latestRadar.warnings,
            }
          : undefined,
      };
    },
  };
  return desk;
}

function defaultCreatorProfile(focus?: string): CreatorProfile {
  return {
    positioning: focus?.trim() || "聚焦科技、AI 与商业的可信内容",
    audience: "希望快速理解行业变化的创作者与专业读者",
    voice: "专业、简洁、证据优先",
    version: 0,
    updatedAt: "1970-01-01T00:00:00.000Z",
  };
}

function buildCompetitionProof(input: {
  latestRadar?: RadarRun;
  latestProposal?: ContentProposal;
  latestPublication?: PublicationLink;
  latestLearning?: LearningUpdate;
  dailyFollowUp?: DailyFollowUpJob;
  generatedAt: string;
}): CompetitionProof {
  const selectionSource = input.latestProposal
    ? input.latestProposal.radarProof
    : input.latestRadar;
  const selection: CompetitionProofStage = selectionSource?.mindDecision
    ? {
        status:
          selectionSource.decisionMode === "mind" &&
          selectionSource.mode === "live"
            ? "verified"
            : "demo",
        label:
          selectionSource.decisionMode === "mind" &&
          selectionSource.mode === "live"
            ? "真实 Mind 已参与选题"
            : "仅有演示选题证据",
        detail:
          selectionSource.decisionMode === "mind" &&
          selectionSource.mode === "live"
            ? "真实来源经过核心 Mind 排序，并与本条内容建议绑定。"
            : "当前排序来自 Recorded Mind 或演示来源，不能冒充真实调用。",
        decisionId: selectionSource.mindDecision.decisionId,
        mindName: selectionSource.mindDecision.mindName,
        conversationAlias: selectionSource.mindDecision.conversationAlias,
      }
    : {
        status: "missing",
        label: "缺少 Mind 选题证据",
        detail: "请连接核心 Mind，并用“运行真实来源”生成一次雷达。",
      };

  const expression: CompetitionProofStage = input.latestProposal?.radarProof
    ? {
        status:
          !input.latestProposal.synthetic &&
          input.latestProposal.mindDecision.mindId !== "recorded-demo-mind"
            ? "verified"
            : "demo",
        label:
          !input.latestProposal.synthetic &&
          input.latestProposal.mindDecision.mindId !== "recorded-demo-mind"
            ? "真实 Mind 已参与表达"
            : "仅有演示表达证据",
        detail:
          !input.latestProposal.synthetic &&
          input.latestProposal.mindDecision.mindId !== "recorded-demo-mind"
            ? `中英建议绑定证据版本 ${input.latestProposal.evidence.version}。`
            : "当前建议包含演示来源或 Recorded Mind 输出，不可作为真实调用证明。",
        decisionId: input.latestProposal.mindDecision.decisionId,
        mindName: input.latestProposal.mindDecision.mindName,
        conversationAlias: input.latestProposal.mindDecision.conversationAlias,
      }
    : {
        status: "missing",
        label: "缺少 Mind 表达证据",
        detail: input.latestProposal
          ? "现有内容建议没有绑定选题记录，请重新从雷达生成。"
          : "请从真实 Mind 排序后的信号生成一份内容建议。",
      };

  const activeLearning =
    input.latestLearning && input.latestLearning.status !== "deleted"
      ? input.latestLearning
      : undefined;
  const learningIsLinked = Boolean(
    activeLearning &&
      input.latestProposal &&
      input.latestPublication &&
      activeLearning.proposalId === input.latestProposal.operationId &&
      activeLearning.publicationId === input.latestPublication.operationId &&
      input.latestPublication.proposalId === input.latestProposal.operationId,
  );
  const learning: CompetitionProofStage = activeLearning && learningIsLinked
    ? {
        status:
          !activeLearning.synthetic && activeLearning.status === "accepted"
            ? "verified"
            : "demo",
        label:
          !activeLearning.synthetic && activeLearning.status === "accepted"
            ? "真实 Mind 学习已由用户确认"
            : "仅有演示学习证据",
        detail:
          !activeLearning.synthetic && activeLearning.status === "accepted"
            ? "学习建议绑定实际发布文本与指标，并已由创作者确认。"
            : "当前学习来自演示记录，或尚未完成用户确认。",
        decisionId: activeLearning.mindDecision.decisionId,
        mindName: activeLearning.mindDecision.mindName,
        conversationAlias: activeLearning.mindDecision.conversationAlias,
      }
    : {
        status: "missing",
        label: "缺少 Mind 学习证据",
        detail: activeLearning
          ? "现有学习记录没有与当前建议和发布结果形成同一条链。"
          : "请关联真实发布结果，让核心 Mind 提议并由用户确认记忆。",
      };

  const autonomy: CompetitionProofStage =
    input.dailyFollowUp?.enabled &&
    input.dailyFollowUp.lastRunAt &&
    input.dailyFollowUp.lastRadarOperationId &&
    !input.dailyFollowUp.lastError
      ? {
          status: input.dailyFollowUp.mode === "real" ? "verified" : "demo",
          label:
            input.dailyFollowUp.mode === "real"
              ? "真实 Mind 已自主跟进"
              : "仅有演示自主跟进证据",
          detail:
            input.dailyFollowUp.mode === "real"
              ? `后台任务已在 ${input.dailyFollowUp.lastRunAt} 自主运行真实雷达。`
              : "后台任务已自主运行演示雷达，但不能冒充真实 Mind 调用。",
          decisionId: input.dailyFollowUp.lastRadarOperationId,
        }
      : {
          status: "missing",
          label: "缺少自主跟进证据",
          detail: input.dailyFollowUp?.lastError
            ? `最近一次后台任务失败：${input.dailyFollowUp.lastError}`
            : "请启用每日跟进，并让后台任务完成至少一次运行。",
        };

  return {
    readyForJudging: [selection, expression, learning, autonomy].every(
      (stage) => stage.status === "verified",
    ),
    generatedAt: input.generatedAt,
    selection,
    expression,
    learning,
    autonomy,
  };
}
