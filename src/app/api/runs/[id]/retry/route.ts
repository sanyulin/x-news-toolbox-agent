import { NextResponse } from "next/server";
import { retryRadarJob } from "@/server/radar-job-runner";

export const runtime = "nodejs";
export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    return NextResponse.json({ ok: true, run: retryRadarJob(id) }, { status: 202 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "重试失败" }, { status: 409 });
  }
}
