import { NextResponse } from "next/server";
import { z } from "zod";
import { createWorkspaceDataStore } from "@/server/workspace-data";

export const runtime = "nodejs";
const schema = z.object({ participant: z.string().trim().min(1).max(40), round: z.union([z.literal(1), z.literal(2)]), platform: z.enum(["x", "xiaohongshu"]), baselineMinutes: z.number().positive().max(600), assistedMinutes: z.number().positive().max(600), mindRecommendationUseful: z.boolean(), adopted: z.boolean(), modificationReason: z.string().trim().max(500).optional(), platformFit: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]), memoryImprovement: z.string().trim().max(500).optional() });

export async function GET() { return NextResponse.json({ schema: "creator-test/v1", records: createWorkspaceDataStore().listCreatorTests() }); }
export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "创作者测试记录无效" }, { status: 400 });
  try {
    const record = createWorkspaceDataStore().saveCreatorTest({ id: crypto.randomUUID(), ...parsed.data, createdAt: new Date().toISOString() });
    return NextResponse.json({ ok: true, record });
  } catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error && error.message.includes("UNIQUE") ? "该参与者的这一轮已经记录" : "保存测试记录失败" }, { status: 409 }); }
}
