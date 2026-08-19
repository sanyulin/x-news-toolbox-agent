import { NextResponse } from "next/server";

import { CREATOR_AGENT_CONTRACT } from "@/core/agent-contract";
import { createAppDesk } from "@/server/create-app-desk";
import { horizonRuntimeReady } from "@/server/horizon-worker";
import { authorizeAgentTool } from "@/server/agent-tool-auth";
import { getPublicRuntimeConfig } from "@/server/runtime-config";
import { createWorkspaceDataStore } from "@/server/workspace-data";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!authorizeAgentTool(request)) return NextResponse.json({ ok: false, error: "未授权" }, { status: 401 });
  const dashboard = await createAppDesk().inspect({ view: "dashboard" });
  const config = getPublicRuntimeConfig();
  const store = createWorkspaceDataStore();
  const run = store.getLatestRadarJob();
  const enabledSources = store.listSources().filter((source) => source.enabled);
  const scheduler = dashboard.systemStatus.scheduler;
  const schedulerEnabled = scheduler.state === "enabled";
  const schedulerFailure = scheduler.state === "enabled" && scheduler.runState === "failed"
    ? scheduler.lastError ?? "未知错误"
    : undefined;
  const mindConnected = dashboard.systemStatus.mind.state === "connected";
  const workerReady = horizonRuntimeReady();
  const horizonConfigured = Boolean(
    config.horizon.enabled &&
    (config.horizon.provider === "ollama" || config.horizon.apiKeyConfigured),
  );
  const blockers = [
    ...(dashboard.systemStatus.database.state === "ready" ? [] : ["数据库未就绪"]),
    ...(mindConnected ? [] : ["核心 Mind 未连接"]),
    ...(dashboard.creatorProfile ? [] : ["创作者档案未配置"]),
    ...(schedulerEnabled ? [] : ["每日自动任务未启用"]),
    ...(schedulerFailure
      ? [`最近自动任务失败：${schedulerFailure}`]
      : []),
    ...(horizonConfigured ? [] : ["Horizon AI 未配置"]),
    ...(workerReady ? [] : ["Horizon Worker 未安装或版本不匹配"]),
    ...(enabledSources.length ? [] : ["没有启用的信息来源"]),
    ...(enabledSources.some((source) => source.lastStatus === "ready") ? [] : ["没有通过连接测试的信息来源"]),
  ];
  return NextResponse.json({
    ok: true,
    agentContract: CREATOR_AGENT_CONTRACT,
    readyForAutonomy: blockers.length === 0,
    blockers,
    configuration: {
      mindConfigured: config.apiKeyConfigured,
      mindConnected,
      creatorProfileConfigured: Boolean(dashboard.creatorProfile),
      horizonConfigured,
      horizonRuntimeReady: workerReady,
      enabledSourceCount: enabledSources.length,
      readySourceCount: enabledSources.filter((source) => source.lastStatus === "ready").length,
      xConfigured: config.xApiKeyConfigured,
      cronAuthenticationConfigured: Boolean(
        process.env.CREATOR_MIND_CRON_SECRET?.trim(),
      ),
    },
    mind: dashboard.systemStatus.mind,
    scheduler: dashboard.systemStatus.scheduler,
    run: run ? {
      id: run.id,
      status: run.status,
      stage: run.runStage ?? run.stage,
      message: run.message,
      heartbeatAt: run.heartbeatAt,
      errorType: run.errorType,
      contractVersion: run.contractVersion,
      gateResults: run.gateResults ?? [],
    } : null,
  }, { headers: { "Cache-Control": "no-store" } });
}
