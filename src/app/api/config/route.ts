import { NextResponse } from "next/server";
import { z } from "zod";

import { createMindsMindAuthority } from "@/adapters/minds-mind-authority";
import { isPublicHttpsUrl, resolvesToPublicAddress } from "@/server/network-address";
import {
  getEffectiveRuntimeConfig,
  saveRuntimeConfig,
  toPublicRuntimeConfig,
} from "@/server/runtime-config";

export const runtime = "nodejs";

const requestSchema = z.object({
  builderApiKey: z.string().trim().max(500).optional(),
  mindId: z.string().trim().max(200).optional(),
  xBearerToken: z.string().trim().max(1000).optional(),
  xQuery: z.string().trim().max(300).optional(),
  defaultSourceUrl: z
    .string()
    .trim()
    .max(2000)
    .refine((value) => !value || isPublicHttpsUrl(value), "内容源必须是公网 HTTPS 地址")
    .optional(),
});

export async function GET() {
  return NextResponse.json({
    ok: true,
    config: toPublicRuntimeConfig(getEffectiveRuntimeConfig()),
  });
}

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "配置参数无效" }, { status: 400 });
  }

  if (
    parsed.data.defaultSourceUrl &&
    !(await resolvesToPublicAddress(parsed.data.defaultSourceUrl))
  ) {
    return NextResponse.json(
      { ok: false, error: "内容源地址不可访问" },
      { status: 400 },
    );
  }

  const current = getEffectiveRuntimeConfig();
  const builderApiKey = parsed.data.builderApiKey || current.builderApiKey;
  if (!builderApiKey) {
    return NextResponse.json(
      { ok: false, error: "请填写 Mind API Key" },
      { status: 400 },
    );
  }

  const conversationAlias = current.conversationAlias || "creator-main";
  const requestedMindId = parsed.data.mindId || current.mindId;
  const inspection = await createMindsMindAuthority({
    builderApiKey,
    preferredMindId: requestedMindId,
    conversationAlias,
  }).inspect();
  if (inspection.state !== "connected") {
    return NextResponse.json(
      { ok: false, error: inspection.guidance },
      { status: 400 },
    );
  }

  const saved = {
    ...current,
    builderApiKey,
    xBearerToken: parsed.data.xBearerToken || current.xBearerToken,
    mindId: inspection.mind.id,
    conversationAlias,
    defaultSourceUrl: parsed.data.defaultSourceUrl || current.defaultSourceUrl,
    xQuery: parsed.data.xQuery || current.xQuery,
  };
  saveRuntimeConfig(saved);

  return NextResponse.json({
    ok: true,
    config: toPublicRuntimeConfig(saved),
    mind: { id: inspection.mind.id, name: inspection.mind.name },
  });
}
