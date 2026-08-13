import { NextResponse } from "next/server";
import { createWorkspaceDataStore } from "@/server/workspace-data";

export const runtime = "nodejs";
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const run = createWorkspaceDataStore().getRadarJob(id);
  return run ? NextResponse.json({ ok: true, schema: "creator-run/v1", run }, { headers: { "cache-control": "no-store" } }) : NextResponse.json({ ok: false, error: "运行记录不存在" }, { status: 404 });
}
