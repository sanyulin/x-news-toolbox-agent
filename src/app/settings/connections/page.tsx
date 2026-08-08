import { ConnectionSettings } from "@/app/components/connection-settings";
import { CreatorProfileForm } from "@/app/components/creator-profile-form";
import { createAppDesk } from "@/server/create-app-desk";
import { getPublicRuntimeConfig } from "@/server/runtime-config";

export const dynamic = "force-dynamic";

export default async function ConnectionsPage() {
  const dashboard = await createAppDesk().inspect({ view: "dashboard" });
  const mindStatus = dashboard.systemStatus.mind;
  return <section className="page-stack"><header className="page-heading"><div><span className="eyebrow">CONNECTIONS</span><h2>接口设置</h2></div><span className={mindStatus.state === "connected" ? "state state-ready" : "state"}>{mindStatus.state === "connected" ? "Mind 已连接" : "需配置"}</span></header>{mindStatus.state !== "connected" ? <p className="settings-error">{mindStatus.guidance}</p> : null}<div className="surface settings-surface"><ConnectionSettings initialConfig={getPublicRuntimeConfig()} /><CreatorProfileForm initialProfile={dashboard.creatorProfile} /></div></section>;
}
