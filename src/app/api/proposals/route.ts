import { NextResponse } from "next/server";
import { z } from "zod";

import { createAppDesk } from "@/server/create-app-desk";

export const runtime = "nodejs";

const requestSchema = z.object({
  commandId: z.string().min(8).max(100),
  signalId: z.string().min(1).max(120),
  proposalMode: z.enum(["demo", "mind"]),
});

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "内容建议参数无效" },
      { status: 400 },
    );
  }

  try {
    const receipt = await createAppDesk().submit({
      commandId: parsed.data.commandId,
      command: {
        type: "prepare_proposal",
        signalId: parsed.data.signalId,
        proposalMode: parsed.data.proposalMode,
      },
    });
    return NextResponse.json({ ok: true, receipt });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "内容建议生成失败";
    return NextResponse.json(
      { ok: false, error: message },
      { status: message.includes("MINDS_BUILDER_API_KEY") ? 503 : 500 },
    );
  }
}
