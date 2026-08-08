import { NextResponse } from "next/server";
import { z } from "zod";

import { createAppDesk } from "@/server/create-app-desk";

export const runtime = "nodejs";

const requestSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("prepare"),
    commandId: z.string().min(8).max(100),
    publicationId: z.string().min(8).max(120),
    learningMode: z.enum(["demo", "mind"]),
  }),
  z.object({
    action: z.enum(["accept", "edit", "delete"]),
    commandId: z.string().min(8).max(100),
    learningId: z.string().min(8).max(120),
    expectedVersion: z.number().int().min(1),
    memoryText: z.string().trim().max(2000).optional(),
  }),
]);

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "学习更新请求不完整" },
      { status: 400 },
    );
  }

  try {
    const command =
      parsed.data.action === "prepare"
        ? {
            type: "prepare_learning" as const,
            publicationId: parsed.data.publicationId,
            learningMode: parsed.data.learningMode,
          }
        : {
            type: "manage_learning" as const,
            learningId: parsed.data.learningId,
            expectedVersion: parsed.data.expectedVersion,
            action: parsed.data.action,
            memoryText: parsed.data.memoryText,
          };
    const receipt = await createAppDesk().submit({
      commandId: parsed.data.commandId,
      command,
    });
    return NextResponse.json({ ok: true, receipt });
  } catch (error) {
    const message = error instanceof Error ? error.message : "学习更新失败";
    return NextResponse.json(
      { ok: false, error: message },
      { status: message.includes("刷新后重试") ? 409 : 500 },
    );
  }
}
