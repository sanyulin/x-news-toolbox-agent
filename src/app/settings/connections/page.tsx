import { ConnectionSettings } from "@/app/components/connection-settings";
import { CreatorProfileForm } from "@/app/components/creator-profile-form";
import { HorizonSettings } from "@/app/components/horizon-settings";
import { DailyFollowUpPanel } from "@/app/components/daily-follow-up-panel";
import { SourceManager } from "@/app/components/source-manager";
import { createAppDesk } from "@/server/create-app-desk";
import { horizonRuntimeReady } from "@/server/horizon-worker";
import { getPublicRuntimeConfig } from "@/server/runtime-config";
import { createWorkspaceDataStore } from "@/server/workspace-data";

export const dynamic = "force-dynamic";

export default async function ConnectionsPage() {
  const dashboard = await createAppDesk().inspect({ view: "dashboard" });
  const mindStatus = dashboard.systemStatus.mind;
  const config = getPublicRuntimeConfig();
  const sources = createWorkspaceDataStore().listSources();
  return <section className="page-stack"><header className="page-heading"><h2>设置</h2><span className={mindStatus.state === "connected" ? "state state-ready" : "state"}>{mindStatus.state === "connected" ? "Mind 已连接" : "需配置"}</span></header>{mindStatus.state !== "connected" ? <p className="settings-error">{mindStatus.guidance}</p> : null}<div className="surface settings-surface"><ConnectionSettings initialConfig={config} /><HorizonSettings initialConfig={config.horizon} workerReady={horizonRuntimeReady()} /><details className="optional-profile" open><summary><span>创作者偏好</span><small>Mind 的长期基线</small></summary><CreatorProfileForm initialProfile={dashboard.creatorProfile} /></details></div><DailyFollowUpPanel mindConnected={mindStatus.state === "connected"} scheduler={dashboard.systemStatus.scheduler} /><details className="surface settings-section"><summary>信息来源</summary><SourceManager initialSources={sources} xApiKeyConfigured={config.xApiKeyConfigured} /></details></section>;
}
