import { NextResponse } from "next/server";
import { z } from "zod";

import { createAppDesk } from "@/server/create-app-desk";

export const runtime = "nodejs";

const metric = z.number().int().nonnegative().optional();
const requestSchema = z.object({
  commandId: z.string().min(8).max(100),
  proposalId: z.string().min(8).max(120),
  expectedProposalVersion: z.number().int().min(1),
  mode: z.enum(["demo", "real"]),
  postUrl: z.string().url().max(500),
  actualText: z.string().trim().min(1).max(5000),
  publishedAt: z.string().datetime(),
  metrics: z.object({
    impressions: metric,
    likes: metric,
    replies: metric,
    reposts: metric,
    bookmarks: metric,
    followersDelta: z.number().int().optional(),
  }),
});

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "请填写有效的发布链接、实际文案和发布时间" },
      { status: 400 },
    );
  }

  try {
    const receipt = await createAppDesk().submit({
      commandId: parsed.data.commandId,
      command: {
        type: "link_publication",
        proposalId: parsed.data.proposalId,
        expectedProposalVersion: parsed.data.expectedProposalVersion,
        mode: parsed.data.mode,
        postUrl: parsed.data.postUrl,
        actualText: parsed.data.actualText,
        publishedAt: parsed.data.publishedAt,
        metrics: parsed.data.metrics,
      },
    });
    return NextResponse.json({ ok: true, receipt });
  } catch (error) {
    const message = error instanceof Error ? error.message : "发布结果关联失败";
    return NextResponse.json(
      { ok: false, error: message },
      { status: message.includes("刷新后重试") ? 409 : 500 },
    );
  }
}
