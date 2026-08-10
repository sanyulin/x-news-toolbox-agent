import { NextResponse } from "next/server";

import { horizonRuntimeReady, validateHorizonSettings } from "@/server/horizon-worker";
import { getEffectiveRuntimeConfig } from "@/server/runtime-config";
import { createWorkspaceDataStore } from "@/server/workspace-data";

export const runtime = "nodejs";

export async function POST() {
  const config = getEffectiveRuntimeConfig();
  if (!config.horizon?.enabled) return NextResponse.json({ ok: false, error: "请先启用 Horizon 雷达" }, { status: 400 });
  if (!horizonRuntimeReady()) return NextResponse.json({ ok: false, error: "Horizon Worker 尚未安装" }, { status: 503 });
  try {
    const result = await validateHorizonSettings(config.horizon, createWorkspaceDataStore().getSources());
    if (result.missingEnv.length) return NextResponse.json({ ok: false, error: `缺少运行密钥：${result.missingEnv.join("、")}`, result }, { status: 400 });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Horizon 验证失败" }, { status: 503 });
  }
}
