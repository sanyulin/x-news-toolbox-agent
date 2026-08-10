import { ConnectionSettings } from "@/app/components/connection-settings";
import { CreatorProfileForm } from "@/app/components/creator-profile-form";
import { HorizonSettings } from "@/app/components/horizon-settings";
import { createAppDesk } from "@/server/create-app-desk";
import { horizonRuntimeReady } from "@/server/horizon-worker";
import { getPublicRuntimeConfig } from "@/server/runtime-config";

export const dynamic = "force-dynamic";

export default async function ConnectionsPage() {
  const dashboard = await createAppDesk().inspect({ view: "dashboard" });
  const mindStatus = dashboard.systemStatus.mind;
  const config = getPublicRuntimeConfig();
  return <section className="page-stack"><header className="page-heading"><h2>连接设置</h2><span className={mindStatus.state === "connected" ? "state state-ready" : "state"}>{mindStatus.state === "connected" ? "Mind 已连接" : "需配置"}</span></header>{mindStatus.state !== "connected" ? <p className="settings-error">{mindStatus.guidance}</p> : null}<div className="surface settings-surface"><ConnectionSettings initialConfig={config} /><HorizonSettings initialConfig={config.horizon} workerReady={horizonRuntimeReady()} /><details className="optional-profile"><summary><span>创作者偏好</span><small>可选</small></summary><CreatorProfileForm initialProfile={dashboard.creatorProfile} /></details></div></section>;
}
