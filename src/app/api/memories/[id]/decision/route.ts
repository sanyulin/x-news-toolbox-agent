import { NextResponse } from "next/server";
import { z } from "zod";

import { createSqliteWorkspaceStore } from "@/adapters/sqlite-health";
import { createAppDesk, createAppMindAuthority, resolveDatabasePath } from "@/server/create-app-desk";

export const runtime = "nodejs";
const schema = z.object({ action: z.enum(["accept", "edit", "supersede", "delete"]), text: z.string().trim().min(1).max(2000).optional() });

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || (parsed.data.action === "edit" && !parsed.data.text)) return NextResponse.json({ ok: false, error: "记忆决策参数无效" }, { status: 400 });
  try {
    const { id } = await context.params;
    const desk = createAppDesk();
    const dashboard = await desk.inspect({ view: "dashboard" });
    const learning = dashboard.latestLearning?.operationId === id ? dashboard.latestLearning : undefined;
    if (learning && parsed.data.action !== "supersede") {
      await desk.submit({
        commandId: crypto.randomUUID(),
        command: {
          type: "manage_learning",
          learningId: id,
          expectedVersion: learning.version,
          action: parsed.data.action,
          memoryText: parsed.data.text,
        },
      });
      const memory = (await desk.inspect({ view: "dashboard" })).memories.find((candidate) => candidate.memoryId === id);
      return NextResponse.json({ ok: true, memory });
    }
    const memory = await createSqliteWorkspaceStore(resolveDatabasePath(process.env.CREATOR_MIND_DATABASE_PATH)).updateMemory({
      memoryId: id,
      status: parsed.data.action === "delete" ? "deleted" : parsed.data.action === "supersede" ? "superseded" : "accepted",
      text: parsed.data.text,
    });
    if (!memory.synthetic) await createAppMindAuthority().commitMemory(memory);
    return NextResponse.json({ ok: true, memory });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "记忆更新失败" }, { status: 500 });
  }
}
