import { NextResponse } from "next/server";

import { createAppDesk } from "@/server/create-app-desk";

export const runtime = "nodejs";

export async function GET() {
  const dashboard = await createAppDesk().inspect({ view: "dashboard" });
  return NextResponse.json(dashboard.systemStatus);
}
