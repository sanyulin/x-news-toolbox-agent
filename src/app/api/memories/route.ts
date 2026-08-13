import { NextResponse } from "next/server";
import { createAppDesk } from "@/server/create-app-desk";

export const runtime = "nodejs";

export async function GET() {
  const dashboard = await createAppDesk().inspect({ view: "dashboard" });
  const proposed = dashboard.memories.filter((memory) => memory.status === "proposed");
  return NextResponse.json(
    { schema: "creator-memory/v2", proposed, memories: dashboard.memories },
    { headers: { "cache-control": "no-store" } },
  );
}
