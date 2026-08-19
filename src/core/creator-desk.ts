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
  memoryStore?: MemoryStore;
  platformDraftStore?: PlatformDraftStore;
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
  usedMemoryIds?: string[];
  memoryInfluence?: string;
  memoryConflicts?: string[];
  rankedSignals: Array<{
    signalId: string;
    relevanceScore: number;
    why: string;
    recommendation: "write" | "watch" | "skip";
  }>;
}

export interface AutonomousRunPlan {
  decisionId: string;
  mindId: string;
  mindName: string;
  conversationAlias: string;
  action: "scan" | "skip";
  focus: string;
  reason: string;
  requestedDraftCount: number;
  usedMemoryIds: string[];
  memoryInfluence: string;
  memoryConflicts: string[];
}

export interface MindAuthority {
  inspect(): Promise<MindInspection>;
  planAutonomousRun?(input: {
    asOf: string;
    profile: CreatorProfile;
    memories: CreatorMemory[];
    locked: {
      platform: PlatformId;
      maximumDrafts: number;
      focus?: string;
    };
  }): Promise<AutonomousRunPlan>;
  rankRadar?(input: {
    asOf: string;
    profile: CreatorProfile;
    signals: RadarSignal[];
    memories?: CreatorMemory[];
  }): Promise<MindRadarDecision>;
  draftProposal?(input: ProposalDraftInput): Promise<ProposalMindDecision>;
  draftPlatform?(input: PlatformDraftInput): Promise<PlatformMindDecision>;
  suggestLearning?(input: LearningDraftInput): Promise<LearningMindDecision>;
  commitMemory?(memory: CreatorMemory): Promise<void>;
}

export interface ProposalMindAuthority {
  planAutonomousRun?(input: {
    asOf: string;
    profile: CreatorProfile;
    memories: CreatorMemory[];
    locked: {
      platform: PlatformId;
      maximumDrafts: number;
      focus?: string;
    };
  }): Promise<AutonomousRunPlan>;
  rankRadar?(input: {
    asOf: string;
    profile: CreatorProfile;
    signals: RadarSignal[];
    memories?: CreatorMemory[];
  }): Promise<MindRadarDecision>;
  draftProposal(input: ProposalDraftInput): Promise<ProposalMindDecision>;
  draftPlatform?(input: PlatformDraftInput): Promise<PlatformMindDecision>;
  suggestLearning?(input: LearningDraftInput): Promise<LearningMindDecision>;
}

export interface CreatorProfile {
  positioning: string;
  audience: string;
  voice: string;
  boundaries?: string;
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
    profile: Pick<CreatorProfile, "positioning" | "audience" | "voice" | "boundaries">;
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
  platform: PlatformId;
  outputCount?: number;
  focus?: string;
  dailyTime?: string;
  runState: "idle" | "running" | "failed";
  leaseUntil?: string;
  nextRunAt?: string;
  lastRunAt?: string;
  lastRadarOperationId?: string;
  lastProposalOperationId?: string;
  lastPlatformDraftOperationId?: string;
  lastProposalOperationIds?: string[];
  lastPlatformDraftOperationIds?: string[];
  lastPlan?: AutonomousRunPlan;
  lastCandidateCount?: number;
  lastPriorityCount?: number;
  lastOutcome?: "drafted" | "skipped";
  lastError?: string;
  updatedAt: string;
}

export const DAILY_CANDIDATE_LIMIT = 10;
export const DAILY_PRIORITY_LIMIT = 3;

export interface SchedulerStore {
  getDailyFollowUp(): Promise<DailyFollowUpJob | undefined>;
  configureDailyFollowUp(input: {
    operationId: string;
    commandId: string;
    enabled: boolean;
    mode: "demo" | "real";
    platform: PlatformId;
    outputCount?: number;
    focus?: string;
    dailyTime?: string;
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
    radarOperationId?: string;
    proposalOperationId?: string;
    platformDraftOperationId?: string;
    proposalOperationIds?: string[];
    platformDraftOperationIds?: string[];
    candidateCount?: number;
    priorityCount?: number;
    plan: AutonomousRunPlan;
    outcome: "drafted" | "skipped";
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
  memories?: CreatorMemory[];
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
  usedMemoryIds?: string[];
  memoryInfluence?: string;
  memoryConflicts?: string[];
}

export type PlatformId = "x" | "xiaohongshu";

export interface PlatformDraftInput extends ProposalDraftInput {
  platform: PlatformId;
  proposalId: string;
  revision?: { attempt: number; errors: string[] };
}

export interface PlatformMindDecision {
  decisionId: string;
  mindId: string;
  mindName: string;
  conversationAlias: string;
  evidenceVersion: string;
  body: string;
  title?: string;
  hashtags: string[];
  coverText?: string;
  visualBrief?: string[];
  evidenceRefs: string[];
  usedMemoryIds: string[];
  memoryInfluence: string;
  memoryConflicts?: string[];
}

export interface PlatformDraft extends PlatformMindDecision {
  operationId: string;
  commandId: string;
  proposalId: string;
  platform: PlatformId;
  createdAt: string;
  revisionCount: number;
  editedByCreator?: boolean;
  validation: { valid: boolean; errors: string[]; warnings: string[] };
}

export interface PlatformDraftStore {
  findPlatformDraftByCommandId(commandId: string): Promise<PlatformDraft | undefined>;
  savePlatformDraft(draft: PlatformDraft): Promise<void>;
  getLatestPlatformDraft(): Promise<PlatformDraft | undefined>;
  listPlatformDrafts?(limit?: number): Promise<PlatformDraft[]>;
  getPlatformDraftById?(operationId: string): Promise<PlatformDraft | undefined>;
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
  listProposals?(limit?: number): Promise<ContentProposal[]>;
  getProposalById?(operationId: string): Promise<ContentProposal | undefined>;
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
  platform: PlatformId;
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
  getPublicationById?(operationId: string): Promise<PublicationLink | undefined>;
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
  scope?: "global" | PlatformId;
}

export interface CreatorMemory {
  memoryId: string;
  scope: "global" | PlatformId;
  text: string;
  sourcePublicationId: string;
  sourceProposalId?: string;
  sourceMetrics: MetricSnapshot;
  confidence: "low" | "medium" | "high";
  status: "proposed" | "accepted" | "superseded" | "deleted";
  createdAt: string;
  acceptedAt?: string;
  lastAppliedAt?: string;
  applicationCount: number;
  synthetic: boolean;
}

export interface MemoryStore {
  listMemories(input?: { scope?: "global" | PlatformId; status?: CreatorMemory["status"] }): Promise<CreatorMemory[]>;
  saveMemory(memory: CreatorMemory): Promise<void>;
  markMemoriesApplied(input: { memoryIds: string[]; appliedAt: string }): Promise<void>;
  updateMemory(input: { memoryId: string; status: CreatorMemory["status"]; text?: string; acceptedAt?: string }): Promise<CreatorMemory>;
}

export interface LearningStore {
  findLearningByCommandId(commandId: string): Promise<LearningUpdate | undefined>;
  saveLearning(update: LearningUpdate): Promise<void>;
  getLatestLearning(): Promise<LearningUpdate | undefined>;
  getLearningById?(operationId: string): Promise<LearningUpdate | undefined>;
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
  latestPlatformDraft?: Omit<PlatformDraft, "commandId">;
  memories: CreatorMemory[];
  causalChain?: {
    memory: CreatorMemory;
    sourceProposal: Omit<ContentProposal, "commandId">;
    sourcePublication: Omit<PublicationLink, "commandId">;
    sourceLearning: Omit<LearningUpdate, "commandId">;
  };
  autonomyEvidence?: {
    proposal: Omit<ContentProposal, "commandId">;
    platformDraft: Omit<PlatformDraft, "commandId">;
  };
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
  memoryCausality: CompetitionProofStage;
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
          candidateLimit?: number;
        }
      | {
          type: "update_profile";
          expectedVersion: number;
          positioning: string;
          audience: string;
          voice: string;
          boundaries?: string;
        }
      | {
          type: "prepare_proposal";
          signalId: string;
          proposalMode: "demo" | "mind" | "evidence";
        }
      | {
          type: "prepare_platform_draft";
          proposalId: string;
          platform: PlatformId;
          proposalMode: "demo" | "mind";
        }
      | {
          type: "edit_platform_draft";
          draftId: string;
          body: string;
          title?: string;
          hashtags: string[];
          coverText?: string;
          visualBrief?: string[];
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
          platform?: PlatformId;
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
          platform: PlatformId;
          outputCount?: number;
          focus?: string;
          dailyTime?: string;
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
    mindDecision?: MindRadarDecision;
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
            boundaries: input.command.boundaries ?? "不伪造事实，不冒充亲身体验，不推断敏感属性，不自动发布",
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
          platform: input.command.platform,
          outputCount: input.command.outputCount,
          focus: input.command.focus,
          dailyTime: input.command.dailyTime,
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

        const nextRunAt = nextDailyRun(now, claimed.job.dailyTime);
        try {
          const maximumDrafts = Math.max(1, Math.min(5, claimed.job.outputCount ?? 1));
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
              focus: claimed.job.focus,
              candidateLimit: DAILY_CANDIDATE_LIMIT,
            },
          });
          const radar = (await desk.inspect({ view: "dashboard" })).latestRadar;
          if (!radar?.mindDecision) throw new Error("Mind 本轮没有返回候选筛选结果");
          const prioritySignals = radar.signals
            .filter((candidate) => candidate.recommendation !== "skip")
            .slice(0, DAILY_PRIORITY_LIMIT);
          const selectedSignals = prioritySignals
            .filter((candidate) => candidate.recommendation === "write")
            .slice(0, maximumDrafts);
          const plan: AutonomousRunPlan = {
            decisionId: radar.mindDecision.decisionId,
            mindId: radar.mindDecision.mindId,
            mindName: radar.mindDecision.mindName,
            conversationAlias: radar.mindDecision.conversationAlias,
            action: selectedSignals.length ? "scan" : "skip",
            focus: claimed.job.focus ?? radar.focus ?? "每日候选筛选",
            reason: radar.mindDecision.rationale,
            requestedDraftCount: selectedSignals.length,
            usedMemoryIds: radar.mindDecision.usedMemoryIds ?? [],
            memoryInfluence: radar.mindDecision.memoryInfluence ?? "本轮未使用长期记忆。",
            memoryConflicts: radar.mindDecision.memoryConflicts ?? [],
          };
          if (!selectedSignals.length) {
            await dependencies.schedulerStore.completeDailyFollowUp({
              completedAt: now.toISOString(),
              nextRunAt,
              radarOperationId: result.operationId,
              candidateCount: radar.signals.length,
              priorityCount: prioritySignals.length,
              plan,
              outcome: "skipped",
            });
            return {
              operationId: plan.decisionId,
              commandId: input.commandId,
              disposition: "accepted",
              status: "completed",
            };
          }
          const proposalOperationIds: string[] = [];
          const platformDraftOperationIds: string[] = [];
          for (const [index, signal] of selectedSignals.entries()) {
            const proposalResult = await desk.submit({
              commandId: `daily-proposal:${claimed.scheduledFor}:${index}`,
              command: { type: "prepare_proposal", signalId: signal.id, proposalMode: "evidence" },
            });
            const platformResult = await desk.submit({
              commandId: `daily-platform:${claimed.scheduledFor}:${index}`,
              command: {
                type: "prepare_platform_draft",
                proposalId: proposalResult.operationId,
                platform: claimed.job.platform ?? "x",
                proposalMode: claimed.job.mode === "real" ? "mind" : "demo",
              },
            });
            proposalOperationIds.push(proposalResult.operationId);
            platformDraftOperationIds.push(platformResult.operationId);
          }
          await dependencies.schedulerStore.completeDailyFollowUp({
            completedAt: now.toISOString(),
            nextRunAt,
            radarOperationId: result.operationId,
            proposalOperationId: proposalOperationIds.at(-1),
            platformDraftOperationId: platformDraftOperationIds.at(-1),
            proposalOperationIds,
            platformDraftOperationIds,
            candidateCount: radar.signals.length,
            priorityCount: prioritySignals.length,
            plan,
            outcome: "drafted",
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

        const [radar, storedProfile, memories] = await Promise.all([
          dependencies.workspaceStore.getLatestRadarRun(),
          dependencies.profileStore.getCreatorProfile(),
          dependencies.memoryStore?.listMemories({ scope: "global", status: "accepted" }) ?? [],
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
        let decision: ProposalMindDecision;
        if (input.command.proposalMode === "evidence") {
          const radarDecision = radar.mindDecision;
          const rankedSignal = radarDecision?.rankedSignals.find((candidate) => candidate.signalId === signal.id);
          if (!radarDecision || !rankedSignal) throw new Error("最新雷达缺少可核验的 Mind 选题决策");
          decision = {
            decisionId: radarDecision.decisionId,
            mindId: radarDecision.mindId,
            mindName: radarDecision.mindName,
            conversationAlias: radarDecision.conversationAlias,
            goNoGo: rankedSignal.recommendation === "skip" ? "no_go" : "go",
            reason: rankedSignal.why,
            angle: rankedSignal.why,
            evidenceVersion,
            usedMemoryIds: radarDecision.usedMemoryIds ?? [],
            memoryInfluence: radarDecision.memoryInfluence ?? "选题阶段未报告长期记忆影响。",
            memoryConflicts: radarDecision.memoryConflicts ?? [],
          };
        } else {
          const authority = input.command.proposalMode === "demo"
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
          decision = await authority.draftProposal({
            asOf: now,
            profile,
            signal,
            evidence,
            radarDecision: radar.mindDecision,
            memories,
          });
        }
        if (decision.evidenceVersion !== evidence.version) {
          throw new Error("Mind 返回的证据版本与本轮不一致");
        }
        if (
          input.command.proposalMode !== "evidence" &&
          decision.goNoGo === "go" &&
          (!decision.chineseDraft ||
            !decision.englishDraft ||
            decision.chineseDraft.trim() === decision.englishDraft.trim())
        ) {
          throw new Error("Mind 未返回合格的中英独立草稿");
        }
        validateMemoryUsage(decision.usedMemoryIds ?? [], memories);
        if (input.command.proposalMode !== "evidence" && decision.usedMemoryIds?.length) {
          await dependencies.memoryStore?.markMemoriesApplied({
            memoryIds: decision.usedMemoryIds,
            appliedAt: now,
          });
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

      if (input.command.type === "prepare_platform_draft") {
        if (!dependencies.proposalStore || !dependencies.platformDraftStore) {
          throw new Error("平台文案尚未配置");
        }
        const existing = await dependencies.platformDraftStore.findPlatformDraftByCommandId(input.commandId);
        if (existing) return { operationId: existing.operationId, commandId: input.commandId, disposition: "duplicate", status: "completed" };
        const proposal = await dependencies.proposalStore.getLatestProposal();
        if (!proposal || proposal.operationId !== input.command.proposalId) throw new Error("内容建议不存在或不是最新版本");
        const profile = (await dependencies.profileStore?.getCreatorProfile()) ?? defaultCreatorProfile();
        const memories = await (dependencies.memoryStore?.listMemories({ scope: input.command.platform, status: "accepted" }) ?? Promise.resolve([]));
        const authority = input.command.proposalMode === "demo" ? dependencies.demoMind : dependencies.mind;
        if (!authority?.draftPlatform) throw new Error(input.command.proposalMode === "demo" ? "演示 Mind 尚未配置平台写作能力" : "核心 Mind 尚未配置平台写作能力");
        let decision: PlatformMindDecision | undefined;
        let validation = { valid: false, errors: ["尚未生成"], warnings: [] as string[] };
        let revisionCount = 0;
        for (let attempt = 0; attempt < 3; attempt += 1) {
          revisionCount = attempt;
          decision = await authority.draftPlatform({
            asOf: (dependencies.clock ?? (() => new Date()))().toISOString(),
            profile,
            signal: proposal.signal,
            evidence: proposal.evidence,
            radarDecision: proposal.radarProof?.mindDecision,
            memories,
            platform: input.command.platform,
            proposalId: proposal.operationId,
            revision: attempt ? { attempt, errors: validation.errors } : undefined,
          });
          validateMemoryUsage(decision.usedMemoryIds, memories);
          validation = validatePlatformDraft(input.command.platform, decision, proposal.evidence);
          if (validation.valid) break;
        }
        if (!decision) throw new Error("Mind 未返回平台文案");
        const createdAt = (dependencies.clock ?? (() => new Date()))().toISOString();
        const draft: PlatformDraft = {
          ...decision,
          operationId: newId(),
          commandId: input.commandId,
          proposalId: proposal.operationId,
          platform: input.command.platform,
          createdAt,
          revisionCount,
          validation,
        };
        await dependencies.platformDraftStore.savePlatformDraft(draft);
        if (decision.usedMemoryIds.length) await dependencies.memoryStore?.markMemoriesApplied({ memoryIds: decision.usedMemoryIds, appliedAt: createdAt });
        return { operationId: draft.operationId, commandId: input.commandId, disposition: "accepted", status: "completed" };
      }

      if (input.command.type === "edit_platform_draft") {
        if (!dependencies.proposalStore || !dependencies.platformDraftStore) throw new Error("平台文案尚未配置");
        const existing = await dependencies.platformDraftStore.findPlatformDraftByCommandId(input.commandId);
        if (existing) return { operationId: existing.operationId, commandId: input.commandId, disposition: "duplicate", status: "completed" };
        const [draft, proposal] = await Promise.all([dependencies.platformDraftStore.getLatestPlatformDraft(), dependencies.proposalStore.getLatestProposal()]);
        if (!draft || draft.operationId !== input.command.draftId || !proposal || proposal.operationId !== draft.proposalId) throw new Error("平台文案不存在或不是最新版本");
        const operationId = newId();
        const edited: PlatformDraft = {
          ...draft,
          operationId,
          commandId: input.commandId,
          createdAt: (dependencies.clock ?? (() => new Date()))().toISOString(),
          body: input.command.body.trim(),
          title: input.command.title?.trim() || undefined,
          hashtags: input.command.hashtags.map((tag) => tag.trim()).filter(Boolean),
          coverText: input.command.coverText?.trim() || undefined,
          visualBrief: input.command.visualBrief?.map((item) => item.trim()).filter(Boolean),
          revisionCount: draft.revisionCount + 1,
          editedByCreator: true,
        };
        edited.validation = validatePlatformDraft(edited.platform, edited, proposal.evidence);
        await dependencies.platformDraftStore.savePlatformDraft(edited);
        return { operationId, commandId: input.commandId, disposition: "accepted", status: "completed" };
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
          platform: input.command.platform ?? "x",
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
        if (dependencies.memoryStore) {
          await dependencies.memoryStore.saveMemory({
            memoryId: operationId,
            scope: update.scope ?? publication.platform,
            text: update.memoryText,
            sourcePublicationId: publication.operationId,
            sourceProposalId: publication.proposalId,
            sourceMetrics: publication.metrics,
            confidence: decision.confidence,
            status: "proposed",
            createdAt,
            applicationCount: 0,
            synthetic: update.synthetic,
          });
        }
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
        const updatedAt = (dependencies.clock ?? (() => new Date()))().toISOString();
        const result = await dependencies.learningStore.updateLearning({
          operationId: newId(),
          commandId: input.commandId,
          learningId: input.command.learningId,
          expectedVersion: input.command.expectedVersion,
          action: input.command.action,
          memoryText: input.command.memoryText?.trim(),
          updatedAt,
        });
        if ((input.command.action === "accept" || input.command.action === "edit") && result.update.status === "accepted" && dependencies.memoryStore) {
          const publication = await dependencies.publicationStore?.getLatestPublication();
          if (publication && publication.operationId === result.update.publicationId) {
            const existingMemory = (await dependencies.memoryStore.listMemories()).find((memory) => memory.memoryId === result.update.operationId);
            const memory = existingMemory
              ? await dependencies.memoryStore.updateMemory({
                  memoryId: existingMemory.memoryId,
                  status: "accepted",
                  text: result.update.memoryText,
                  acceptedAt: existingMemory.acceptedAt ?? updatedAt,
                })
              : {
                  memoryId: result.update.operationId,
                  scope: result.update.scope ?? publication.platform,
                  text: result.update.memoryText,
                  sourcePublicationId: publication.operationId,
                  sourceProposalId: publication.proposalId,
                  sourceMetrics: publication.metrics,
                  confidence: result.update.mindDecision.confidence,
                  status: "accepted" as const,
                  createdAt: result.update.createdAt,
                  acceptedAt: updatedAt,
                  applicationCount: 0,
                  synthetic: result.update.synthetic,
                };
            if (!existingMemory) await dependencies.memoryStore.saveMemory(memory);
            if (!memory.synthetic) await dependencies.mind.commitMemory?.(memory);
          }
        } else if (input.command.action === "delete" && dependencies.memoryStore) {
          const matching = (await dependencies.memoryStore.listMemories()).find((memory) => memory.memoryId === result.update.operationId);
          if (matching) {
            const deleted = await dependencies.memoryStore.updateMemory({ memoryId: matching.memoryId, status: "deleted" });
            if (!deleted.synthetic) await dependencies.mind.commitMemory?.(deleted);
          }
        }
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
      const candidateLimit = input.command.candidateLimit
        ? Math.max(1, Math.min(20, input.command.candidateLimit))
        : Number.MAX_SAFE_INTEGER;
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
        .sort((left, right) => right.relevanceScore - left.relevanceScore)
        .slice(0, candidateLimit);

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

        const memories = await (dependencies.memoryStore?.listMemories({ scope: "global", status: "accepted" }) ?? Promise.resolve([]));
        mindDecision = await rankingMind.rankRadar({
          asOf: now.toISOString(),
          profile,
          signals: collectedSignals,
          memories,
        });
        validateMemoryUsage(mindDecision.usedMemoryIds ?? [], memories);
        if (mindDecision.usedMemoryIds?.length) await dependencies.memoryStore?.markMemoriesApplied({ memoryIds: mindDecision.usedMemoryIds, appliedAt: now.toISOString() });
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
        mindDecision,
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
        latestPlatformDraft,
        memories,
        dailyFollowUp,
      ] = await Promise.all([
        dependencies.database.check(),
        dependencies.mind.inspect(),
        dependencies.profileStore?.getCreatorProfile(),
        dependencies.proposalStore?.getLatestProposal(),
        dependencies.publicationStore?.getLatestPublication(),
        dependencies.learningStore?.getLatestLearning(),
        dependencies.platformDraftStore?.getLatestPlatformDraft(),
        dependencies.memoryStore?.listMemories() ?? [],
        dependencies.schedulerStore?.getDailyFollowUp(),
      ]);
      const latestRadar = await dependencies.workspaceStore?.getLatestRadarRun();
      const causalMemory = memories.find((memory) => memory.status === "accepted" && memory.applicationCount > 0 && !memory.synthetic);
      const [sourceProposal, sourcePublication, sourceLearning] = causalMemory
        ? await Promise.all([
            causalMemory.sourceProposalId ? dependencies.proposalStore?.getProposalById?.(causalMemory.sourceProposalId) : undefined,
            dependencies.publicationStore?.getPublicationById?.(causalMemory.sourcePublicationId),
            dependencies.learningStore?.getLearningById?.(causalMemory.memoryId),
          ])
        : [];
      const causalChain = causalMemory && sourceProposal && sourcePublication && sourceLearning
        ? { memory: causalMemory, sourceProposal: omitCommandId(sourceProposal), sourcePublication: omitCommandId(sourcePublication), sourceLearning: omitCommandId(sourceLearning) }
        : undefined;
      const causalProofChain = causalMemory && sourceProposal && sourcePublication && sourceLearning
        ? { memory: causalMemory, sourceProposal, sourcePublication, sourceLearning }
        : undefined;
      const [autonomyProposal, autonomyDraft] = dailyFollowUp?.lastProposalOperationId && dailyFollowUp.lastPlatformDraftOperationId
        ? await Promise.all([
            dependencies.proposalStore?.getProposalById?.(dailyFollowUp.lastProposalOperationId),
            dependencies.platformDraftStore?.getPlatformDraftById?.(dailyFollowUp.lastPlatformDraftOperationId),
          ])
        : [];
      const autonomyEvidence = autonomyProposal && autonomyDraft
        ? { proposal: omitCommandId(autonomyProposal), platformDraft: omitCommandId(autonomyDraft) }
        : undefined;
      const competitionProof = buildCompetitionProof({
        latestRadar,
        latestProposal,
        latestPublication,
        latestLearning,
        latestPlatformDraft,
        memories,
        dailyFollowUp,
        causalChain: causalProofChain,
        autonomyEvidence: autonomyProposal && autonomyDraft ? { proposal: autonomyProposal, platformDraft: autonomyDraft } : undefined,
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
                platform: dailyFollowUp.platform ?? "x",
                runState: dailyFollowUp.runState,
                leaseUntil: dailyFollowUp.leaseUntil,
                nextRunAt: dailyFollowUp.nextRunAt,
                lastRunAt: dailyFollowUp.lastRunAt,
                lastRadarOperationId: dailyFollowUp.lastRadarOperationId,
                lastProposalOperationId: dailyFollowUp.lastProposalOperationId,
                lastPlatformDraftOperationId: dailyFollowUp.lastPlatformDraftOperationId,
                lastProposalOperationIds: dailyFollowUp.lastProposalOperationIds,
                lastPlatformDraftOperationIds: dailyFollowUp.lastPlatformDraftOperationIds,
                lastPlan: dailyFollowUp.lastPlan,
                lastCandidateCount: dailyFollowUp.lastCandidateCount,
                lastPriorityCount: dailyFollowUp.lastPriorityCount,
                lastOutcome: dailyFollowUp.lastOutcome,
                outputCount: dailyFollowUp.outputCount,
                focus: dailyFollowUp.focus,
                dailyTime: dailyFollowUp.dailyTime,
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
        latestPlatformDraft: latestPlatformDraft
          ? omitCommandId(latestPlatformDraft)
          : undefined,
        memories,
        causalChain,
        autonomyEvidence,
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
    boundaries: "不伪造事实，不冒充亲身体验，不推断敏感属性，不自动发布",
    version: 0,
    updatedAt: "1970-01-01T00:00:00.000Z",
  };
}

function omitCommandId<T extends { commandId: string }>(value: T): Omit<T, "commandId"> {
  const { commandId: _commandId, ...rest } = value;
  return rest;
}

function validateMemoryUsage(memoryIds: string[], available: CreatorMemory[]) {
  const allowed = new Set(available.filter((memory) => memory.status === "accepted").map((memory) => memory.memoryId));
  if (memoryIds.some((memoryId) => !allowed.has(memoryId))) {
    throw new Error("Mind 返回了未知或未批准的记忆标识");
  }
}

function validatePlatformDraft(platform: PlatformId, draft: PlatformMindDecision, evidence: EvidencePacket) {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (draft.evidenceVersion !== evidence.version) errors.push("平台文案使用了错误的证据版本");
  if (!draft.evidenceRefs.length) errors.push("必须保留至少一个证据引用");
  const knownEvidence = new Set(evidence.sources.map((source) => source.id));
  if (draft.evidenceRefs.some((reference) => !knownEvidence.has(reference))) errors.push("平台文案包含未知证据引用");
  if (platform === "x") {
    if (draft.body.length > 280) errors.push("X 正文超过 280 字符");
    if (!/[。！？.!?]$/u.test(draft.body.trim())) errors.push("X 正文必须以完整句子结束");
  } else {
    if (!draft.title?.trim()) errors.push("小红书必须包含标题");
    if ((draft.title?.length ?? 0) > 20) errors.push("小红书标题超过 20 个字符");
    if (draft.body.length > 1000) errors.push("小红书正文超过 1000 个字符");
    if (!draft.coverText?.trim()) errors.push("小红书必须包含封面文案");
    if (!draft.visualBrief || draft.visualBrief.length < 2 || draft.visualBrief.length > 4) errors.push("小红书必须包含 2–4 条图片建议");
    if (draft.hashtags.length > 10) errors.push("小红书标签不能超过 10 个");
  }
  if (!draft.usedMemoryIds.length) warnings.push("本轮没有使用已确认的创作者记忆");
  return { valid: errors.length === 0, errors, warnings };
}

function buildCompetitionProof(input: {
  latestRadar?: RadarRun;
  latestProposal?: ContentProposal;
  latestPublication?: PublicationLink;
  latestLearning?: LearningUpdate;
  latestPlatformDraft?: PlatformDraft;
  memories: CreatorMemory[];
  dailyFollowUp?: DailyFollowUpJob;
  causalChain?: { memory: CreatorMemory; sourceProposal: ContentProposal; sourcePublication: PublicationLink; sourceLearning: LearningUpdate };
  autonomyEvidence?: { proposal: ContentProposal; platformDraft: PlatformDraft };
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

  const expressionSource = input.latestPlatformDraft;
  const expressionIsLinked = Boolean(
    input.latestProposal?.radarProof &&
      expressionSource &&
      expressionSource.proposalId === input.latestProposal.operationId &&
      expressionSource.evidenceVersion === input.latestProposal.evidence.version,
  );
  const expressionIsDemo = Boolean(
    expressionIsLinked &&
      input.latestProposal &&
      expressionSource &&
      (input.latestProposal.synthetic ||
        input.latestProposal.radarProof?.mode !== "live" ||
        input.latestProposal.radarProof?.decisionMode !== "mind" ||
        expressionSource.mindId === "recorded-demo-mind"),
  );
  const expressionIsVerified = Boolean(
    expressionIsLinked && !expressionIsDemo && expressionSource?.validation.valid,
  );
  const expression: CompetitionProofStage = input.latestProposal && expressionSource && expressionIsLinked
    ? {
        status: expressionIsVerified ? "verified" : expressionIsDemo ? "demo" : "missing",
        label: expressionIsVerified ? "真实 Mind 已参与表达" : expressionIsDemo ? "仅有演示表达证据" : "平台草稿未通过校验",
        detail: expressionIsVerified
          ? `${expressionSource.platform === "x" ? "X" : "小红书"}文案绑定证据版本 ${input.latestProposal.evidence.version}。`
          : expressionIsDemo
            ? "当前建议包含演示来源或 Recorded Mind 输出，不可作为真实调用证明。"
            : `当前真实草稿仍有校验错误：${expressionSource.validation.errors.join("；")}`,
        decisionId: expressionSource.decisionId,
        mindName: expressionSource.mindName,
        conversationAlias: expressionSource.conversationAlias,
      }
    : {
        status: "missing",
        label: "缺少 Mind 表达证据",
        detail: input.latestProposal
          ? expressionSource
            ? "最近平台草稿不属于当前内容建议，请为当前建议重新生成。"
            : "请从内容建议生成一份经过校验的平台文案。"
          : "请从真实 Mind 排序后的信号生成内容建议和平台文案。",
      };

  const learningUpdate = input.causalChain?.sourceLearning ?? input.latestLearning;
  const learningProposal = input.causalChain?.sourceProposal ?? input.latestProposal;
  const learningPublication = input.causalChain?.sourcePublication ?? input.latestPublication;
  const activeLearning =
    learningUpdate && learningUpdate.status !== "deleted"
      ? learningUpdate
      : undefined;
  const learningIsLinked = Boolean(
    activeLearning &&
      learningProposal &&
      learningPublication &&
      activeLearning.proposalId === learningProposal.operationId &&
      activeLearning.publicationId === learningPublication.operationId &&
      learningPublication.proposalId === learningProposal.operationId,
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

  const autonomyIsLinked = Boolean(
    input.dailyFollowUp?.enabled &&
    input.dailyFollowUp.lastRunAt &&
    input.dailyFollowUp.lastRadarOperationId &&
    input.dailyFollowUp.lastProposalOperationId &&
    input.dailyFollowUp.lastPlatformDraftOperationId &&
    input.autonomyEvidence?.proposal.operationId === input.dailyFollowUp.lastProposalOperationId &&
    input.autonomyEvidence.platformDraft.operationId === input.dailyFollowUp.lastPlatformDraftOperationId &&
    input.autonomyEvidence.platformDraft.proposalId === input.autonomyEvidence.proposal.operationId &&
    input.autonomyEvidence.platformDraft.evidenceVersion === input.autonomyEvidence.proposal.evidence.version &&
    !input.dailyFollowUp.lastError,
  );
  const autonomyIsReal = Boolean(
    autonomyIsLinked &&
      input.dailyFollowUp?.mode === "real" &&
      input.autonomyEvidence &&
      !input.autonomyEvidence.proposal.synthetic &&
      input.autonomyEvidence.proposal.radarProof?.mode === "live" &&
      input.autonomyEvidence.proposal.radarProof?.decisionMode === "mind" &&
      input.autonomyEvidence.platformDraft.mindId !== "recorded-demo-mind" &&
      input.autonomyEvidence.platformDraft.validation.valid,
  );
  const autonomyIsDemo = Boolean(
    autonomyIsLinked &&
      input.dailyFollowUp &&
      input.autonomyEvidence &&
      (input.dailyFollowUp.mode !== "real" ||
        input.autonomyEvidence.proposal.synthetic ||
        input.autonomyEvidence.proposal.radarProof?.mode !== "live" ||
        input.autonomyEvidence.proposal.radarProof?.decisionMode !== "mind" ||
        input.autonomyEvidence.platformDraft.mindId === "recorded-demo-mind"),
  );
  const autonomy: CompetitionProofStage = autonomyIsLinked
      ? {
          status: autonomyIsReal ? "verified" : autonomyIsDemo ? "demo" : "missing",
          label:
            autonomyIsReal
              ? "真实 Mind 已自主跟进"
              : autonomyIsDemo
                ? "仅有演示自主跟进证据"
                : "自主草稿未通过校验",
          detail:
            autonomyIsReal
              ? `后台任务已在 ${input.dailyFollowUp?.lastRunAt} 自主完成真实雷达、选题和待审核平台草稿。`
              : autonomyIsDemo
                ? "后台任务包含演示来源或 Recorded Mind，不能冒充真实自主调用。"
                : "后台任务已运行，但真实平台草稿尚未通过校验。",
          decisionId: input.dailyFollowUp?.lastRadarOperationId,
        }
      : {
          status: "missing",
          label: "缺少自主跟进证据",
          detail: input.dailyFollowUp?.lastError
            ? `最近一次后台任务失败：${input.dailyFollowUp.lastError}`
            : "请启用每日跟进，并让后台任务自主完成一次雷达、选题和待审核草稿。",
        };

  const acceptedAppliedMemory = input.causalChain?.memory ?? input.memories.find(
    (memory) => memory.status === "accepted" && memory.applicationCount > 0 && !memory.synthetic,
  );
  const memoryTime = acceptedAppliedMemory ? Date.parse(acceptedAppliedMemory.acceptedAt ?? acceptedAppliedMemory.createdAt) : Number.NaN;
  const platformUseIsLater = Boolean(
    acceptedAppliedMemory &&
      input.latestPlatformDraft?.usedMemoryIds.includes(acceptedAppliedMemory.memoryId) &&
      Date.parse(input.latestPlatformDraft.createdAt) > memoryTime &&
      (!acceptedAppliedMemory.sourceProposalId || input.latestPlatformDraft.proposalId !== acceptedAppliedMemory.sourceProposalId),
  );
  const proposalUseIsLater = Boolean(
    acceptedAppliedMemory &&
      input.latestProposal?.mindDecision.usedMemoryIds?.includes(acceptedAppliedMemory.memoryId) &&
      Date.parse(input.latestProposal.generatedAt) > memoryTime &&
      (!acceptedAppliedMemory.sourceProposalId || input.latestProposal.operationId !== acceptedAppliedMemory.sourceProposalId),
  );
  const radarUseIsLater = Boolean(
    acceptedAppliedMemory &&
      input.latestRadar?.mindDecision?.usedMemoryIds?.includes(acceptedAppliedMemory.memoryId) &&
      Date.parse(input.latestRadar.generatedAt) > memoryTime,
  );
  const decisionUsedMemory = platformUseIsLater || proposalUseIsLater || radarUseIsLater;
  const memoryCausality: CompetitionProofStage = acceptedAppliedMemory && decisionUsedMemory
    ? {
        status: "verified",
        label: "已证明记忆影响下一轮决策",
        detail: `记忆 ${acceptedAppliedMemory.memoryId} 已被真实 Mind 用于后续轮次，共记录 ${acceptedAppliedMemory.applicationCount} 次应用。`,
        decisionId: platformUseIsLater
          ? input.latestPlatformDraft?.decisionId
          : proposalUseIsLater
            ? input.latestProposal?.mindDecision.decisionId
            : input.latestRadar?.mindDecision?.decisionId,
        mindName: platformUseIsLater
          ? input.latestPlatformDraft?.mindName
          : proposalUseIsLater
            ? input.latestProposal?.mindDecision.mindName
            : input.latestRadar?.mindDecision?.mindName,
        conversationAlias: platformUseIsLater
          ? input.latestPlatformDraft?.conversationAlias
          : proposalUseIsLater
            ? input.latestProposal?.mindDecision.conversationAlias
            : input.latestRadar?.mindDecision?.conversationAlias,
      }
    : {
        status: input.memories.some((memory) => memory.synthetic && memory.applicationCount > 0) ? "demo" : "missing",
        label: "缺少记忆因果证据",
        detail: "请接受一条真实学习记忆，并让下一轮 Mind 明确返回该 memoryId。",
      };

  return {
    readyForJudging: [selection, expression, learning, autonomy, memoryCausality].every(
      (stage) => stage.status === "verified",
    ),
    generatedAt: input.generatedAt,
    selection,
    expression,
    learning,
    autonomy,
    memoryCausality,
  };
}

function nextDailyRun(now: Date, dailyTime = "09:00") {
  const [hours, minutes] = dailyTime.split(":").map(Number);
  const next = new Date(now);
  next.setDate(next.getDate() + 1);
  next.setHours(Number.isFinite(hours) ? hours : 9, Number.isFinite(minutes) ? minutes : 0, 0, 0);
  return next.toISOString();
}
