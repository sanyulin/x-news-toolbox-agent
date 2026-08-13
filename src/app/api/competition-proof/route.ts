import { NextResponse } from "next/server";

import { createAppDesk } from "@/server/create-app-desk";
import { createWorkspaceDataStore } from "@/server/workspace-data";

export const runtime = "nodejs";

export async function GET() {
  const dashboard = await createAppDesk().inspect({ view: "dashboard" });
  const latestRun = createWorkspaceDataStore().getLatestRadarJob();
  return NextResponse.json(
    {
      schema: "mind-navigation-competition-proof/v2",
      proof: dashboard.competitionProof,
      evidence: {
        radar: dashboard.latestRadar,
        proposal: dashboard.latestProposal,
        platformDraft: dashboard.latestPlatformDraft,
        publication: dashboard.latestPublication,
        learning: dashboard.latestLearning,
        memories: dashboard.memories,
        causalChain: dashboard.causalChain,
        autonomyEvidence: dashboard.autonomyEvidence,
        run: latestRun,
        scheduler: dashboard.systemStatus.scheduler,
      },
    },
    {
      headers: {
        "cache-control": "no-store",
        "content-disposition": 'attachment; filename="mind-navigation-proof.json"',
      },
    },
  );
}
