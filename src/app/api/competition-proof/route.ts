import { NextResponse } from "next/server";

import { createAppDesk } from "@/server/create-app-desk";

export const runtime = "nodejs";

export async function GET() {
  const dashboard = await createAppDesk().inspect({ view: "dashboard" });
  return NextResponse.json(
    {
      schema: "mind-navigation-competition-proof/v1",
      proof: dashboard.competitionProof,
    },
    {
      headers: {
        "cache-control": "no-store",
        "content-disposition": 'attachment; filename="mind-navigation-proof.json"',
      },
    },
  );
}
