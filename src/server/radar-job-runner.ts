import type { SignalSource } from "@/core/creator-desk";
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
    const collection = await collectRadarSignals(selected, (stage) => {
      store.updateRadarJob(jobId, { stage, message: stageMessage(stage) });
    });
    store.updateRadarJob(jobId, { stage: "mind", message: "Mind 正在进行创作者相关性判断" });
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
      error: undefined,
    });
  } catch (error) {
    store.updateRadarJob(jobId, {
      stage: "failed",
      status: "failed",
      message: "雷达运行失败",
      error: safeError(error),
    });
  } finally {
    running.delete(jobId);
  }
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
