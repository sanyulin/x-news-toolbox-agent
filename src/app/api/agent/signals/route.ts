import { NextResponse } from "next/server";

import { createAppDesk } from "@/server/create-app-desk";
import { authorizeAgentTool } from "@/server/agent-tool-auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!authorizeAgentTool(request)) return NextResponse.json({ ok: false, error: "未授权" }, { status: 401 });
  const radar = (await createAppDesk().inspect({ view: "dashboard" })).latestRadar;
  return NextResponse.json({
    ok: true,
    radar: radar ? {
      operationId: radar.operationId,
      generatedAt: radar.generatedAt,
      mode: radar.mode,
      decisionId: radar.mindDecision?.decisionId,
      signals: radar.signals.map((signal) => ({
        id: signal.id,
        title: signal.title,
        summary: signal.summary,
        sourceName: signal.sourceName,
        sourceUrl: signal.sourceUrl,
        publishedAt: signal.publishedAt,
        recommendation: signal.recommendation,
        mindReason: signal.mindReason,
      })),
    } : null,
  }, { headers: { "Cache-Control": "no-store" } });
}
