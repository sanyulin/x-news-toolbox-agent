import { NextResponse } from "next/server";

import { resolvesToPublicAddress } from "@/server/network-address";
import { sourceInputSchema } from "@/server/source-validation";
import { createWorkspaceDataStore } from "@/server/workspace-data";
import { normalizeXHandle } from "@/server/x-reader";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ ok: true, sources: createWorkspaceDataStore().listSources() });
}

export async function POST(request: Request) {
  const parsed = sourceInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message ?? "来源参数无效" }, { status: 400 });
  if (parsed.data.type !== "x-account" && !(await resolvesToPublicAddress(parsed.data.locator))) {
    return NextResponse.json({ ok: false, error: "来源地址不可访问" }, { status: 400 });
  }
  try {
    const source = createWorkspaceDataStore().saveSource({
      id: crypto.randomUUID(),
      ...parsed.data,
      locator: parsed.data.type === "x-account" ? normalizeXHandle(parsed.data.locator) : parsed.data.locator,
      lastStatus: "unchecked",
    });
    return NextResponse.json({ ok: true, source }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error && error.message.includes("UNIQUE") ? "这个来源已经存在" : "来源保存失败";
    return NextResponse.json({ ok: false, error: message }, { status: 409 });
  }
}
