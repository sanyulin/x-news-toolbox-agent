import { SourceManager } from "@/app/components/source-manager";
import { getEffectiveRuntimeConfig } from "@/server/runtime-config";
import { createWorkspaceDataStore } from "@/server/workspace-data";

export const dynamic = "force-dynamic";

export default function SourcesPage() {
  const store = createWorkspaceDataStore();
  store.ensureDefaultSource(getEffectiveRuntimeConfig().defaultSourceUrl);
  return <SourceManager initialSources={store.listSources()} />;
}
