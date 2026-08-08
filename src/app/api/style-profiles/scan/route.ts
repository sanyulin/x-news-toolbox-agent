import { NextResponse } from "next/server";
import { z } from "zod";

import { scanStyleProfile } from "@/server/style-profile-service";

export const runtime = "nodejs";

const requestSchema = z.object({
  handles: z.array(z.string().trim().min(1).max(100)).min(1).max(3),
  sampleLimit: z.number().int().min(5).max(100).default(100),
  includeReplies: z.boolean().default(false),
  intensity: z.enum(["light", "medium"]).default("medium"),
  authorized: z.literal(true),
});

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "请确认账号授权并填写有效扫描参数" }, { status: 400 });
  }
  try {
    const profile = await scanStyleProfile(parsed.data);
    return NextResponse.json({ ok: true, profile }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "风格扫描失败" },
      { status: 400 },
    );
  }
}
