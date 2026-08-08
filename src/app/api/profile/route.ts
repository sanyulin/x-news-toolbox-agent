import { NextResponse } from "next/server";
import { z } from "zod";

import { createAppDesk } from "@/server/create-app-desk";

export const runtime = "nodejs";

const requestSchema = z.object({
  commandId: z.string().min(8).max(100),
  expectedVersion: z.number().int().min(0),
  positioning: z.string().trim().min(4).max(240),
  audience: z.string().trim().min(4).max(240),
  voice: z.string().trim().min(2).max(160),
});

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "请完整填写定位、目标受众和表达方式" },
      { status: 400 },
    );
  }

  try {
    const receipt = await createAppDesk().submit({
      commandId: parsed.data.commandId,
      command: {
        type: "update_profile",
        expectedVersion: parsed.data.expectedVersion,
        positioning: parsed.data.positioning,
        audience: parsed.data.audience,
        voice: parsed.data.voice,
      },
    });
    return NextResponse.json({ ok: true, receipt });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "创作者档案保存失败";
    return NextResponse.json(
      { ok: false, error: message },
      { status: message.includes("刷新后重试") ? 409 : 500 },
    );
  }
}
