import { NextResponse } from "next/server";

import { createRssSignalSource } from "@/adapters/live-signal-source";
import { getEffectiveRuntimeConfig, sourceCredentialHeaders } from "@/server/runtime-config";
import { createWorkspaceDataStore } from "@/server/workspace-data";
import { inspectXAccount } from "@/server/x-reader";

export const runtime = "nodejs";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const store = createWorkspaceDataStore();
  const source = store.listSources().find((item) => item.id === id);
  if (!source) return NextResponse.json({ ok: false, error: "来源不存在" }, { status: 404 });
  const checkedAt = new Date().toISOString();
  const config = getEffectiveRuntimeConfig();
  try {
    let detail: string;
    if (source.type === "x-account") {
      const token = config.xBearerToken;
      if (!token) throw new Error("请先配置 X Bearer Token");
      const account = await inspectXAccount(token, source.locator);
      detail = `已连接 @${account.handle}`;
    } else {
      const result = await createRssSignalSource({ feeds: [{
        name: source.name,
        url: source.locator,
        mapping: source.mapping,
        headers: sourceCredentialHeaders(config, source.id),
      }] }).collect({ asOf: checkedAt });
      if (!result.signals.length) throw new Error(result.warnings[0] ?? "来源没有可读取的内容");
      detail = `读取到 ${result.signals.length} 条内容`;
    }
    const updated = store.updateSource(id, { lastStatus: "ready", lastCheckedAt: checkedAt, lastSuccessAt: checkedAt, lastError: undefined });
    return NextResponse.json({ ok: true, detail, source: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "连接测试失败";
    store.updateSource(id, { lastStatus: "error", lastCheckedAt: checkedAt, lastError: message });
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
