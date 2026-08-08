import { NextResponse } from "next/server";

import { createWorkspaceDataStore } from "@/server/workspace-data";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ ok: true, profiles: createWorkspaceDataStore().listStyleProfiles() });
}
