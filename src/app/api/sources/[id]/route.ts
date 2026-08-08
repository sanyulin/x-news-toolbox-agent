import { NextResponse } from "next/server";
import { z } from "zod";

import { isPublicHttpsUrl, resolvesToPublicAddress } from "@/server/network-address";
import { createWorkspaceDataStore } from "@/server/workspace-data";
import { normalizeXHandle } from "@/server/x-reader";

export const runtime = "nodejs";

const patchSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  locator: z.string().trim().min(1).max(2000).optional(),
  enabled: z.boolean().optional(),
  mapping: z.record(z.string(), z.string()).optional(),
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const store = createWorkspaceDataStore();
  const current = store.listSources().find((source) => source.id === id);
  if (!current) return NextResponse.json({ ok: false, error: "来源不存在" }, { status: 404 });
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "来源参数无效" }, { status: 400 });
  if (parsed.data.locator) {
    if (current.type === "x-account") {
      const handle = normalizeXHandle(parsed.data.locator);
      if (!/^[A-Za-z0-9_]{1,15}$/.test(handle)) return NextResponse.json({ ok: false, error: "X 账号格式无效" }, { status: 400 });
      parsed.data.locator = handle;
    } else if (!isPublicHttpsUrl(parsed.data.locator) || !(await resolvesToPublicAddress(parsed.data.locator))) {
      return NextResponse.json({ ok: false, error: "来源地址不可访问" }, { status: 400 });
    }
  }
  const source = store.updateSource(id, { ...parsed.data, lastStatus: "unchecked", lastError: undefined });
  return NextResponse.json({ ok: true, source });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const deleted = createWorkspaceDataStore().deleteSource(id);
  return deleted
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ ok: false, error: "来源不存在" }, { status: 404 });
}
