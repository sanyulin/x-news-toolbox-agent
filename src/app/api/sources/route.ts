import { NextResponse } from "next/server";

import { resolvesToPublicAddress } from "@/server/network-address";
import { getEffectiveRuntimeConfig, loadRuntimeConfig, saveRuntimeConfig } from "@/server/runtime-config";
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
  const { authType, credential, xBearerToken, ...sourceInput } = parsed.data;
  if (sourceInput.type !== "x-account" && !(await resolvesToPublicAddress(sourceInput.locator))) {
    return NextResponse.json({ ok: false, error: "来源地址不可访问" }, { status: 400 });
  }
  const config = getEffectiveRuntimeConfig();
  const storedConfig = loadRuntimeConfig();
  if (sourceInput.type === "x-account" && !xBearerToken && !config.xBearerToken) {
    return NextResponse.json({ ok: false, error: "请填写 X Bearer Token" }, { status: 400 });
  }
  try {
    const id = crypto.randomUUID();
    const source = createWorkspaceDataStore().saveSource({
      id,
      ...sourceInput,
      locator: sourceInput.type === "x-account" ? normalizeXHandle(sourceInput.locator) : sourceInput.locator,
      lastStatus: "unchecked",
    });
    if ((sourceInput.type === "x-account" && xBearerToken) || (sourceInput.type === "json" && authType !== "none" && credential)) {
      saveRuntimeConfig({
        ...storedConfig,
        xBearerToken: sourceInput.type === "x-account" && xBearerToken ? xBearerToken : storedConfig.xBearerToken,
        sourceCredentials: sourceInput.type === "json" && authType !== "none" && credential
          ? { ...storedConfig.sourceCredentials, [id]: { type: authType, secret: credential } }
          : storedConfig.sourceCredentials,
      });
    }
    return NextResponse.json({ ok: true, source }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error && error.message.includes("UNIQUE") ? "这个来源已经存在" : "来源保存失败";
    return NextResponse.json({ ok: false, error: message }, { status: 409 });
  }
}
