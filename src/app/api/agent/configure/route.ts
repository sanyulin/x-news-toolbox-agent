import { NextResponse } from "next/server";
import { z } from "zod";

import { createAppDesk } from "@/server/create-app-desk";
import { authorizeAgentTool } from "@/server/agent-tool-auth";

export const runtime = "nodejs";

const requestSchema = z.object({
  requestId: z.string().trim().min(8).max(80),
  profile: z.object({
    positioning: z.string().trim().min(4).max(240),
    audience: z.string().trim().min(4).max(240),
    voice: z.string().trim().min(2).max(160),
    boundaries: z.string().trim().min(2).max(400).default(
      "不伪造事实，不冒充亲身体验，不推断敏感属性，不自动发布",
    ),
  }).strict(),
  automation: z.object({
    enabled: z.boolean(),
    platform: z.enum(["x", "xiaohongshu"]),
    outputCount: z.number().int().min(1).max(5).default(1),
    focus: z.string().trim().max(240).optional(),
    dailyTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/u).default("09:00"),
  }).strict(),
}).strict();

export async function POST(request: Request) {
  if (!authorizeAgentTool(request)) {
    return NextResponse.json({ ok: false, error: "未授权" }, { status: 401 });
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Mind 自配置参数无效" },
      { status: 400 },
    );
  }

  try {
    const desk = createAppDesk();
    const before = await desk.inspect({ view: "dashboard" });
    if (parsed.data.automation.enabled && before.systemStatus.mind.state !== "connected") {
      return NextResponse.json(
        { ok: false, error: "请先由用户配置 Mind API Key，再启用自动运行" },
        { status: 409 },
      );
    }

    const profile = await desk.submit({
      commandId: `${parsed.data.requestId}:profile`,
      command: {
        type: "update_profile",
        expectedVersion: before.creatorProfile?.version ?? 0,
        ...parsed.data.profile,
      },
    });
    const automation = await desk.submit({
      commandId: `${parsed.data.requestId}:automation`,
      command: {
        type: "configure_daily_follow_up",
        enabled: parsed.data.automation.enabled,
        mode: "real",
        platform: parsed.data.automation.platform,
        outputCount: parsed.data.automation.outputCount,
        focus: parsed.data.automation.focus,
        dailyTime: parsed.data.automation.dailyTime,
      },
    });
    const after = await desk.inspect({ view: "dashboard" });

    return NextResponse.json({
      ok: true,
      profile: profile.profile,
      automation: after.systemStatus.scheduler,
      receipts: {
        profile: profile.disposition,
        automation: automation.disposition,
      },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Mind 自配置失败";
    return NextResponse.json(
      { ok: false, error: message },
      { status: message.includes("刷新后重试") ? 409 : 500 },
    );
  }
}
