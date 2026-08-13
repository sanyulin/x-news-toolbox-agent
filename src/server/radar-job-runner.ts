import type { PlatformId, SignalSource } from "@/core/creator-desk";
import { createAppDesk } from "@/server/create-app-desk";
import type { HorizonStage } from "@/server/horizon-worker";
import { collectRadarSignals } from "@/server/radar-signal-source";
import { getEffectiveRuntimeConfig } from "@/server/runtime-config";
import { createWorkspaceDataStore, type RadarJobRecord } from "@/server/workspace-data";

const running = new Set<string>();

export function startRadarJob(input: { commandId: string; sourceIds: string[]; focus?: string }) {
  const store = createWorkspaceDataStore();
  const existing = store.getLatestRadarJob();
  if (existing?.commandId === input.commandId || existing?.status === "running") return existing;
  const now = new Date().toISOString();
  const job: RadarJobRecord = {
    id: crypto.randomUUID(),
    commandId: input.commandId,
    sourceIds: input.sourceIds,
    focus: input.focus,
    stage: "queued",
    status: "running",
    message: "等待启动 Horizon",
    createdAt: now,
    updatedAt: now,
    runStage: "queued",
    inputSnapshot: { sourceIds: input.sourceIds, focus: input.focus },
    heartbeatAt: now,
    retryCount: 0,
    executionMode: "live",
    checkpoints: [{ stage: "queued", startedAt: now, heartbeatAt: now, inputSnapshot: { sourceIds: input.sourceIds, focus: input.focus }, executionMode: "live" }],
  };
  store.saveRadarJob(job);
  queueMicrotask(() => void runRadarJob(job.id).catch(() => undefined));
  return job;
}

export async function runRadarJob(jobId: string) {
  if (running.has(jobId)) return;
  running.add(jobId);
  const store = createWorkspaceDataStore();
  try {
    const job = store.getRadarJob(jobId);
    if (!job || job.status !== "running") return;
    const config = getEffectiveRuntimeConfig();
    if (!config.horizon?.enabled) throw new Error("请先在接口设置中启用 Horizon 雷达");
    const selected = store.getSources(job.sourceIds);
    const checkpoint = readRadarCollectionCheckpoint(job);
    const collection = checkpoint
      ? checkpoint
      : await collectRadarSignals(selected, (stage) => {
          store.updateRadarJob(jobId, { stage, runStage: stage === "enriching" || stage === "reading" ? "researching" : "collecting", heartbeatAt: new Date().toISOString(), message: stageMessage(stage) });
        });
    if (!checkpoint) store.updateRadarJob(jobId, { collectedSignals: collection.signals, collectionWarnings: collection.warnings });
    store.updateRadarJob(jobId, { stage: "mind", runStage: "ranking", heartbeatAt: new Date().toISOString(), message: "Mind 正在进行创作者相关性判断" });
    const source: SignalSource = { collect: async () => collection };
    const receipt = await createAppDesk({ sources: selected, signalSource: source }).submit({
      commandId: job.commandId,
      command: {
        type: "run_cycle",
        trigger: "manual",
        dataMode: "live_with_demo_fallback",
        decisionMode: "mind",
        focus: job.focus,
      },
    });
    store.updateRadarJob(jobId, {
      stage: "completed",
      status: "completed",
      message: `完成，共 ${collection.signals.length} 条真实候选`,
      radarOperationId: receipt.operationId,
      mindDecisionId: receipt.mindDecision?.decisionId,
      usedMemoryIds: receipt.mindDecision?.usedMemoryIds,
      runStage: "completed",
      completedAt: new Date().toISOString(),
      heartbeatAt: new Date().toISOString(),
      error: undefined,
      errorType: undefined,
      nextResumeStage: undefined,
    });
  } catch (error) {
    const errorType = classifyError(error);
    const retryable = errorType !== "configuration";
    store.updateRadarJob(jobId, {
      stage: "failed",
      status: "failed",
      message: retryable ? "雷达运行失败，可以从保存阶段重试" : "雷达配置无效，请修复配置后重新运行",
      error: safeError(error),
      errorType,
      runStage: retryable ? "failed_retryable" : "failed_terminal",
      nextResumeStage: retryable
        ? store.getRadarJob(jobId)?.collectedSignals?.length ? "ranking" : "collecting"
        : undefined,
      heartbeatAt: new Date().toISOString(),
    });
  } finally {
    running.delete(jobId);
  }
}

export function retryRadarJob(jobId: string) {
  const store = createWorkspaceDataStore();
  const job = store.getRadarJob(jobId);
  if (!job) throw new Error("运行记录不存在");
  if (job.status !== "failed") throw new Error("只有失败任务可以重试");
  if (job.runStage === "failed_terminal") throw new Error("该任务需要先修复配置，不能从失败阶段重试");
  const updated = store.updateRadarJob(jobId, buildRadarRetryPatch(job, new Date().toISOString()));
  queueMicrotask(() => void (job.nextResumeStage === "drafting" ? runDraftRetry(jobId) : runRadarJob(jobId)).catch(() => undefined));
  return updated;
}

export function beginPlatformDraftStage(input: {
  radarOperationId?: string;
  proposalId: string;
  platform: PlatformId;
  platformMode: "demo" | "mind";
  evidenceVersion: string;
}) {
  const store = createWorkspaceDataStore();
  const job = store.getLatestRadarJob();
  if (!job || !input.radarOperationId || job.radarOperationId !== input.radarOperationId) return undefined;
  return store.updateRadarJob(job.id, {
    stage: "mind",
    status: "running",
    runStage: "drafting",
    message: `Mind 正在生成${input.platform === "x" ? " X" : "小红书"}版本`,
    proposalId: input.proposalId,
    platform: input.platform,
    platformMode: input.platformMode,
    evidenceVersion: input.evidenceVersion,
    inputSnapshot: { ...job.inputSnapshot, sourceIds: job.sourceIds, focus: job.focus, proposalId: input.proposalId, platform: input.platform, evidenceVersion: input.evidenceVersion },
    heartbeatAt: new Date().toISOString(),
    completedAt: undefined,
    error: undefined,
    errorType: undefined,
    nextResumeStage: undefined,
  });
}

export function completePlatformDraftStage(jobId: string | undefined, input: { platformDraftId: string; mindDecisionId: string; usedMemoryIds: string[]; valid: boolean }) {
  if (!jobId) return undefined;
  const now = new Date().toISOString();
  return createWorkspaceDataStore().updateRadarJob(jobId, {
    stage: "completed",
    status: "completed",
    runStage: input.valid ? "waiting_review" : "drafting",
    message: input.valid ? "平台草稿已生成，等待创作者审核" : "自动修订仍未通过，请创作者人工编辑",
    platformDraftId: input.platformDraftId,
    mindDecisionId: input.mindDecisionId,
    usedMemoryIds: input.usedMemoryIds,
    heartbeatAt: now,
    error: undefined,
    errorType: undefined,
    nextResumeStage: undefined,
  });
}

export function failPlatformDraftStage(jobId: string | undefined, error: unknown) {
  if (!jobId) return undefined;
  const errorType = classifyError(error);
  const retryable = errorType !== "configuration";
  return createWorkspaceDataStore().updateRadarJob(jobId, {
    stage: "failed",
    status: "failed",
    runStage: retryable ? "failed_retryable" : "failed_terminal",
    message: retryable ? "平台生成失败，可以从草稿阶段重试" : "平台生成配置无效，请先修复配置",
    error: safeError(error),
    errorType,
    nextResumeStage: retryable ? "drafting" : undefined,
    heartbeatAt: new Date().toISOString(),
  });
}

export function completeReviewStage(proposalId: string, decision: "approve" | "request_changes" | "reject") {
  const store = createWorkspaceDataStore();
  const job = store.getLatestRadarJob();
  if (!job || job.proposalId !== proposalId) return undefined;
  const now = new Date().toISOString();
  return store.updateRadarJob(job.id, {
    stage: "completed",
    status: "completed",
    runStage: decision === "request_changes" ? "waiting_review" : "completed",
    message: decision === "request_changes" ? "创作者要求修改，等待重新生成并审核" : "创作者审核已完成",
    inputSnapshot: { ...job.inputSnapshot, sourceIds: job.sourceIds, focus: job.focus, reviewDecision: decision },
    heartbeatAt: now,
    completedAt: decision === "request_changes" ? undefined : now,
    nextResumeStage: undefined,
  });
}

async function runDraftRetry(jobId: string) {
  if (running.has(jobId)) return;
  running.add(jobId);
  const store = createWorkspaceDataStore();
  try {
    const job = store.getRadarJob(jobId);
    if (!job || job.status !== "running" || !job.proposalId || !job.platform || !job.platformMode) throw new Error("草稿 checkpoint 不完整");
    const desk = createAppDesk();
    await desk.submit({
      commandId: `${job.commandId}:draft-retry:${job.retryCount ?? 1}`,
      command: { type: "prepare_platform_draft", proposalId: job.proposalId, platform: job.platform, proposalMode: job.platformMode },
    });
    const draft = (await desk.inspect({ view: "dashboard" })).latestPlatformDraft;
    if (!draft || draft.proposalId !== job.proposalId) throw new Error("重试后没有生成平台草稿");
    completePlatformDraftStage(jobId, { platformDraftId: draft.operationId, mindDecisionId: draft.decisionId, usedMemoryIds: draft.usedMemoryIds, valid: draft.validation.valid });
  } catch (error) {
    failPlatformDraftStage(jobId, error);
  } finally {
    running.delete(jobId);
  }
}

export function readRadarCollectionCheckpoint(job: RadarJobRecord) {
  return job.collectedSignals?.length
    ? { signals: job.collectedSignals, mode: "live" as const, warnings: job.collectionWarnings ?? [] }
    : undefined;
}

export function buildRadarRetryPatch(job: RadarJobRecord, heartbeatAt: string): Partial<RadarJobRecord> {
  if (job.nextResumeStage === "drafting") {
    return {
      status: "running",
      stage: "mind",
      message: "从草稿 checkpoint 继续平台生成",
      error: undefined,
      retryCount: (job.retryCount ?? 0) + 1,
      runStage: "drafting",
      executionMode: "replay",
      heartbeatAt,
    };
  }
  const hasCheckpoint = Boolean(readRadarCollectionCheckpoint(job));
  return {
    status: "running",
    stage: hasCheckpoint ? "mind" : "queued",
    message: hasCheckpoint ? "从已保存候选继续 Mind 判断" : "重新开始采集",
    error: undefined,
    retryCount: (job.retryCount ?? 0) + 1,
    runStage: hasCheckpoint ? "ranking" : "collecting",
    executionMode: hasCheckpoint ? "replay" : "live",
    heartbeatAt,
  };
}

function stageMessage(stage: HorizonStage) {
  return ({
    validating: "正在检查 Horizon 配置",
    fetching: "正在采集真实信息",
    scoring: "Horizon 正在进行 AI 评分",
    filtering: "正在去重并筛选内容",
    enriching: "正在补充背景信息",
    reading: "正在整理结构化结果",
  } as const)[stage];
}

function safeError(error: unknown) {
  const message = error instanceof Error ? error.message : "未知错误";
  return message
    .replace(/(authorization|api[_-]?key|token)\s*[:=]\s*\S+/gi, "$1=[已隐藏]")
    .replace(/[A-Za-z]:\\[^\r\n]+/g, "[本机路径]")
    .slice(0, 800);
}

function classifyError(error: unknown): RadarJobRecord["errorType"] {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("timeout") || message.includes("timed out") || message.includes("超时")) return "timeout";
  if (message.includes("配置") || message.includes("api key") || message.includes("未安装")) return "configuration";
  if (message.includes("network") || message.includes("fetch") || message.includes("dns")) return "network";
  return "unknown";
}
