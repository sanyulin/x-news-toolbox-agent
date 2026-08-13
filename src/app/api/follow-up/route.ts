import { NextResponse } from "next/server";
import { z } from "zod";

import { createAppDesk } from "@/server/create-app-desk";
import { processDueFollowUp } from "@/server/follow-up-worker";

export const runtime = "nodejs";

const requestSchema = z.object({
  commandId: z.string().min(8).max(100),
  enabled: z.boolean(),
  mode: z.enum(["demo", "real"]),
  platform: z.enum(["x", "xiaohongshu"]),
  outputCount: z.number().int().min(1).max(5).default(1),
  focus: z.string().trim().max(240).optional(),
  dailyTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/u).default("09:00"),
});

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "每日跟进参数无效" },
      { status: 400 },
    );
  }
  try {
    const desk = createAppDesk();
    const receipt = await desk.submit({
      commandId: parsed.data.commandId,
      command: {
        type: "configure_daily_follow_up",
        enabled: parsed.data.enabled,
        mode: parsed.data.mode,
        platform: parsed.data.platform,
        outputCount: parsed.data.outputCount,
        focus: parsed.data.focus,
        dailyTime: parsed.data.dailyTime,
      },
    });
    const dashboard = await desk.inspect({ view: "dashboard" });
    return NextResponse.json({
      ok: true,
      receipt,
      scheduler: dashboard.systemStatus.scheduler,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "每日跟进设置失败",
      },
      { status: 500 },
    );
  }
}

export async function GET(request: Request) {
  const secret = process.env.CREATOR_MIND_CRON_SECRET?.trim();
  if (
    process.env.NODE_ENV === "production" &&
    (!secret || request.headers.get("authorization") !== `Bearer ${secret}`)
  ) {
    return NextResponse.json({ ok: false, error: "未授权" }, { status: 401 });
  }
  try {
    const receipt = await processDueFollowUp();
    return NextResponse.json(
      { ok: true, receipt: receipt ?? null },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "每日跟进运行失败",
      },
      { status: 500 },
    );
  }
}
