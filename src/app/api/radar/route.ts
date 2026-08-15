import { NextResponse } from "next/server";
import { z } from "zod";

import { startRadarJob } from "@/server/radar-job-runner";
import { createWorkspaceDataStore } from "@/server/workspace-data";

export const runtime = "nodejs";

const requestSchema = z.object({
  commandId: z.string().min(8).max(100),
  focus: z.string().trim().min(2).max(240).optional(),
  sourceIds: z.array(z.string().min(8).max(100)).max(50).default([]),
});

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "运行参数无效" }, { status: 400 });

  const known = new Set(createWorkspaceDataStore().listSources().map((source) => source.id));
  if (parsed.data.sourceIds.some((id) => !known.has(id))) {
    return NextResponse.json({ ok: false, error: "包含不存在的信息来源" }, { status: 400 });
  }

  const job = startRadarJob(parsed.data);
  return NextResponse.json({ ok: true, job }, { status: job.status === "running" ? 202 : 200 });
}
