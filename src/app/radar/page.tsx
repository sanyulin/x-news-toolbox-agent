import { AgentConsole } from "@/app/components/agent-console";
import { createAppDesk } from "@/server/create-app-desk";
import { createWorkspaceDataStore } from "@/server/workspace-data";

export const dynamic = "force-dynamic";

export default async function RadarPage() {
  const dashboard = await createAppDesk().inspect({ view: "dashboard" });
  const sources = createWorkspaceDataStore().listSources();
  const enabled = dashboard.systemStatus.mind.state === "connected" && dashboard.systemStatus.database.state === "ready" && sources.some((source) => source.enabled);
  return <AgentConsole enabled={enabled} latestRadar={dashboard.latestRadar} sources={sources} />;
}
