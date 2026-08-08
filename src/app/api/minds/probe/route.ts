import { NextResponse } from "next/server";

import { createAppMindAuthority } from "@/server/create-app-desk";

export const runtime = "nodejs";

export async function POST() {
  try {
    const result = await createAppMindAuthority().probe();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Minds 连接验证失败，请稍后重试",
      },
      { status: 503 },
    );
  }
}
