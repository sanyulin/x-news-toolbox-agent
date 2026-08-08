import { DraftWorkspace } from "@/app/components/draft-workspace";
import { createAppDesk } from "@/server/create-app-desk";
import { createWorkspaceDataStore } from "@/server/workspace-data";

export const dynamic = "force-dynamic";

export default async function DraftsPage() {
  const dashboard = await createAppDesk().inspect({ view: "dashboard" });
  const activeStyle = createWorkspaceDataStore().getActiveStyleProfile();
  return <section className="page-stack"><header className="page-heading"><div><span className="eyebrow">DRAFT WORKSPACE</span><h2>内容草稿</h2></div><span className={activeStyle ? "state state-ready" : "state"}>{activeStyle ? `风格版本 ${activeStyle.version}` : "使用基础风格"}</span></header><DraftWorkspace proposal={dashboard.latestProposal} /></section>;
}
