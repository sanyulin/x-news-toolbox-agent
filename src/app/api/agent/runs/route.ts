import { NextResponse } from "next/server";

import { authorizeAgentTool } from "@/server/agent-tool-auth";
import { processDueFollowUp } from "@/server/follow-up-worker";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!authorizeAgentTool(request)) return NextResponse.json({ ok: false, error: "未授权" }, { status: 401 });
  try {
    const receipt = await processDueFollowUp();
    return NextResponse.json({ ok: true, receipt: receipt ?? null });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Agent 运行失败" }, { status: 500 });
  }
}
