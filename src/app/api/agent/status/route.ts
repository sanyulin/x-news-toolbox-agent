import { NextResponse } from "next/server";

import { CREATOR_AGENT_CONTRACT } from "@/core/agent-contract";
import { createAppDesk } from "@/server/create-app-desk";
import { authorizeAgentTool } from "@/server/agent-tool-auth";
import { getPublicRuntimeConfig } from "@/server/runtime-config";
import { createWorkspaceDataStore } from "@/server/workspace-data";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!authorizeAgentTool(request)) return NextResponse.json({ ok: false, error: "未授权" }, { status: 401 });
  const dashboard = await createAppDesk().inspect({ view: "dashboard" });
  const config = getPublicRuntimeConfig();
  const run = createWorkspaceDataStore().getLatestRadarJob();
  const schedulerEnabled = dashboard.systemStatus.scheduler.state === "enabled";
  const mindConnected = dashboard.systemStatus.mind.state === "connected";
  return NextResponse.json({
    ok: true,
    agentContract: CREATOR_AGENT_CONTRACT,
    readyForAutonomy:
      dashboard.systemStatus.database.state === "ready" &&
      mindConnected &&
      Boolean(dashboard.creatorProfile) &&
      schedulerEnabled,
    configuration: {
      mindConfigured: config.apiKeyConfigured,
      mindConnected,
      creatorProfileConfigured: Boolean(dashboard.creatorProfile),
      horizonConfigured:
        config.horizon.enabled &&
        (config.horizon.provider === "ollama" || config.horizon.apiKeyConfigured),
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
