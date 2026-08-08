import { NextResponse } from "next/server";
import { z } from "zod";

import { createAppDesk } from "@/server/create-app-desk";

export const runtime = "nodejs";

const requestSchema = z.object({
  commandId: z.string().min(8).max(100),
  proposalId: z.string().min(8).max(120),
  expectedVersion: z.number().int().min(1),
  decision: z.enum(["approve", "request_changes", "reject"]),
  reason: z.string().trim().min(2).max(500),
});

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "请选择审核决定并填写简短原因" },
      { status: 400 },
    );
  }

  try {
    const receipt = await createAppDesk().submit({
      commandId: parsed.data.commandId,
      command: {
        type: "review_proposal",
        proposalId: parsed.data.proposalId,
        expectedVersion: parsed.data.expectedVersion,
        decision: parsed.data.decision,
        reason: parsed.data.reason,
      },
    });
    return NextResponse.json({ ok: true, receipt });
  } catch (error) {
    const message = error instanceof Error ? error.message : "审核提交失败";
    return NextResponse.json(
      { ok: false, error: message },
      { status: message.includes("刷新后重试") ? 409 : 500 },
    );
  }
}
