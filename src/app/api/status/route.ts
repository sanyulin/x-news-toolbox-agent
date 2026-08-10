import { NextResponse } from "next/server";

import { createAppDesk } from "@/server/create-app-desk";
import { horizonRuntimeReady } from "@/server/horizon-worker";
import { getPublicRuntimeConfig } from "@/server/runtime-config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const dashboard = await createAppDesk().inspect({ view: "dashboard" });
  const config = getPublicRuntimeConfig();
  return NextResponse.json({
    ok: true,
    status: {
      database: dashboard.systemStatus.database,
      mind: dashboard.systemStatus.mind,
      twitter: config.xApiKeyConfigured
        ? { state: "configured", label: "Twitter/X 已配置" }
        : { state: "not_configured", label: "Twitter/X 未配置" },
      horizon: config.horizon.enabled && config.horizon.apiKeyConfigured && horizonRuntimeReady()
        ? { state: "connected", label: "Horizon 已就绪" }
        : { state: "not_configured", label: "Horizon 待配置" },
      source: config.defaultSourceUrl
        ? { state: "configured", label: "内容源已配置" }
        : { state: "not_configured", label: "内容源待输入" },
      portable: process.env.CREATOR_MIND_PORTABLE === "1",
    },
  });
}
