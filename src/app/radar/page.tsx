import { AgentConsole } from "@/app/components/agent-console";
import { DailyFollowUpPanel } from "@/app/components/daily-follow-up-panel";
import { createAppDesk } from "@/server/create-app-desk";
import { horizonRuntimeReady } from "@/server/horizon-worker";
import { getEffectiveRuntimeConfig } from "@/server/runtime-config";
import { createWorkspaceDataStore } from "@/server/workspace-data";

export const dynamic = "force-dynamic";

export default async function RadarPage() {
  const dashboard = await createAppDesk().inspect({ view: "dashboard" });
  const store = createWorkspaceDataStore();
  const sources = store.listSources();
  const config = getEffectiveRuntimeConfig();
  const horizon = config.horizon;
  const workerReady = horizonRuntimeReady();
  const providerReady = Boolean(horizon?.provider && horizon.model && (horizon.provider === "ollama" || horizon.apiKey));
  const sourceReady = Boolean(sources.some((source) => source.enabled) || horizon?.hackerNews || horizon?.ossInsight);
  const enabled = dashboard.systemStatus.mind.state === "connected"
    && dashboard.systemStatus.database.state === "ready"
    && Boolean(horizon?.enabled)
    && providerReady
    && workerReady
    && sourceReady;
  const readinessMessage = !horizon?.enabled
    ? "请先在接口设置中启用 Horizon 雷达"
    : !providerReady
      ? "请先配置 Horizon AI 服务商、模型和 API Key"
      : !workerReady
        ? "Horizon Worker 尚未安装"
        : !sourceReady
          ? "请至少启用一个真实信息来源"
          : dashboard.systemStatus.mind.state !== "connected"
            ? "请先连接 Mind"
            : undefined;
  return <><AgentConsole enabled={enabled} initialJob={store.getLatestRadarJob()} latestRadar={dashboard.latestRadar} readinessMessage={readinessMessage} sources={sources} /><DailyFollowUpPanel mindConnected={dashboard.systemStatus.mind.state === "connected"} scheduler={dashboard.systemStatus.scheduler} /></>;
}
