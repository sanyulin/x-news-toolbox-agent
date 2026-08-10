import { NextResponse } from "next/server";

import { createWorkspaceDataStore } from "@/server/workspace-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const job = createWorkspaceDataStore().getRadarJob(id);
  return job
    ? NextResponse.json({ ok: true, job })
    : NextResponse.json({ ok: false, error: "雷达任务不存在" }, { status: 404 });
}
