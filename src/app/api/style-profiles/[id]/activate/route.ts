import { NextResponse } from "next/server";

import { createWorkspaceDataStore } from "@/server/workspace-data";

export const runtime = "nodejs";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const profile = createWorkspaceDataStore().activateStyleProfile(id);
  return profile
    ? NextResponse.json({ ok: true, profile })
    : NextResponse.json({ ok: false, error: "风格档案不存在" }, { status: 404 });
}
