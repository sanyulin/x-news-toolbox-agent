import { NextResponse } from "next/server";
import { z } from "zod";

import { createAppDesk } from "@/server/create-app-desk";
import { isPublicHttpsUrl, resolvesToPublicAddress } from "@/server/network-address";
import { getEffectiveRuntimeConfig } from "@/server/runtime-config";
import { createWorkspaceDataStore } from "@/server/workspace-data";

export const runtime = "nodejs";

const requestSchema = z.object({
  commandId: z.string().min(8).max(100),
  focus: z.string().trim().min(2).max(100).optional(),
  sourceIds: z.array(z.string().min(8).max(100)).max(50).optional(),
  sourceUrl: z
    .string()
    .trim()
    .url()
    .refine(isPublicHttpsUrl)
    .optional(),
});

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "运行参数无效" },
      { status: 400 },
    );
  }
  if (parsed.data.sourceUrl && !(await resolvesToPublicAddress(parsed.data.sourceUrl))) {
    return NextResponse.json(
      { ok: false, error: "来源地址不可访问" },
      { status: 400 },
    );
  }

  try {
    const store = createWorkspaceDataStore();
    store.ensureDefaultSource(getEffectiveRuntimeConfig().defaultSourceUrl);
    const sources = parsed.data.sourceUrl ? undefined : store.getSources(parsed.data.sourceIds);
    if (!parsed.data.sourceUrl && !sources?.length) {
      return NextResponse.json({ ok: false, error: "请先添加并启用至少一个信息来源" }, { status: 400 });
    }
    const addresses = (sources ?? []).filter((source) => source.type !== "x-account");
    const publicChecks = await Promise.all(addresses.map((source) => resolvesToPublicAddress(source.locator)));
    if (publicChecks.some((ready) => !ready)) {
      return NextResponse.json({ ok: false, error: "一个或多个来源地址不可访问" }, { status: 400 });
    }
    const receipt = await createAppDesk({
      sourceUrl: parsed.data.sourceUrl,
      sources,
    }).submit({
      commandId: parsed.data.commandId,
      command: {
        type: "run_cycle",
        trigger: "manual",
        dataMode: "live_with_demo_fallback",
        decisionMode: "mind",
        focus: parsed.data.focus,
      },
    });
    return NextResponse.json({ ok: true, receipt });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "今日雷达运行失败";
    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      { status: message.includes("MINDS_BUILDER_API_KEY") ? 503 : 500 },
    );
  }
}
