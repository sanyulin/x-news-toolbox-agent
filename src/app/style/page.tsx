import { StyleProfileManager } from "@/app/components/style-profile-manager";
import { getPublicRuntimeConfig } from "@/server/runtime-config";
import { createWorkspaceDataStore } from "@/server/workspace-data";

export const dynamic = "force-dynamic";

export default function StylePage() {
  return <StyleProfileManager profiles={createWorkspaceDataStore().listStyleProfiles()} xConfigured={getPublicRuntimeConfig().xApiKeyConfigured} />;
}
