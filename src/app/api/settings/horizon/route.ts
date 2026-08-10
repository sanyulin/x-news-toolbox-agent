import { NextResponse } from "next/server";
import { z } from "zod";

import { defaultHorizonModel, loadRuntimeConfig, saveRuntimeConfig, toPublicRuntimeConfig } from "@/server/runtime-config";

export const runtime = "nodejs";

const schema = z.object({
  enabled: z.boolean(),
  provider: z.enum(["openai", "deepseek", "anthropic", "gemini", "doubao", "ali", "minimax", "azure", "ollama"]),
  apiKey: z.string().trim().max(2_000).optional(),
  baseUrl: z.string().trim().max(500).optional(),
  azureEndpoint: z.string().trim().max(500).nullish(),
  hours: z.number().int().min(1).max(168),
  threshold: z.number().min(0).max(10),
  hackerNews: z.boolean(),
  ossInsight: z.boolean(),
  enrich: z.boolean(),
});

export async function PUT(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Horizon 配置参数无效" }, { status: 400 });
  if (parsed.data.baseUrl && !validEndpoint(parsed.data.baseUrl, parsed.data.provider === "ollama")) {
    return NextResponse.json({ ok: false, error: "Base URL 必须是公网 HTTPS；Ollama 可使用本机 HTTP" }, { status: 400 });
  }
  if (parsed.data.provider === "azure" && (!parsed.data.azureEndpoint || !validEndpoint(parsed.data.azureEndpoint, false))) {
    return NextResponse.json({ ok: false, error: "Azure Endpoint 必须是公网 HTTPS 地址" }, { status: 400 });
  }
  const current = loadRuntimeConfig();
  const apiKey = parsed.data.apiKey || current.horizon?.apiKey;
  if (parsed.data.enabled && parsed.data.provider !== "ollama" && !apiKey) {
    return NextResponse.json({ ok: false, error: "请填写 Horizon AI API Key" }, { status: 400 });
  }
  const saved = {
    ...current,
    horizon: {
      ...parsed.data,
      model: defaultHorizonModel(parsed.data.provider),
      apiKey,
      baseUrl: parsed.data.baseUrl || undefined,
      azureEndpoint: parsed.data.azureEndpoint || undefined,
    },
  };
  saveRuntimeConfig(saved);
  return NextResponse.json({ ok: true, config: toPublicRuntimeConfig(saved).horizon });
}

function validEndpoint(value: string, allowLocalHttp: boolean) {
  try {
    const url = new URL(value);
    if (url.protocol === "https:") return true;
    return allowLocalHttp && url.protocol === "http:" && ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  } catch {
    return false;
  }
}
