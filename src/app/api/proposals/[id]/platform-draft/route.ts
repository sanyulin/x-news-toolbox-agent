import { NextResponse } from "next/server";
import { z } from "zod";

import { createAppDesk } from "@/server/create-app-desk";
import { beginPlatformDraftStage, completePlatformDraftStage, failPlatformDraftStage } from "@/server/radar-job-runner";

export const runtime = "nodejs";

const schema = z.object({
  commandId: z.string().min(8).max(100),
  platform: z.enum(["x", "xiaohongshu"]),
  proposalMode: z.enum(["demo", "mind"]),
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "平台文案参数无效" }, { status: 400 });
  try {
    const { id } = await context.params;
    const desk = createAppDesk();
    const proposal = (await desk.inspect({ view: "dashboard" })).latestProposal;
    if (!proposal || proposal.operationId !== id) throw new Error("内容建议不存在或不是最新版本");
    const draftJob = beginPlatformDraftStage({ radarOperationId: proposal.radarProof?.operationId, proposalId: id, platform: parsed.data.platform, platformMode: parsed.data.proposalMode, evidenceVersion: proposal.evidence.version });
    try {
      const receipt = await desk.submit({
      commandId: parsed.data.commandId,
      command: { type: "prepare_platform_draft", proposalId: id, platform: parsed.data.platform, proposalMode: parsed.data.proposalMode },
      });
      const draft = (await desk.inspect({ view: "dashboard" })).latestPlatformDraft;
      if (!draft || draft.operationId !== receipt.operationId) throw new Error("平台草稿没有正确保存");
      completePlatformDraftStage(draftJob?.id, { platformDraftId: draft.operationId, mindDecisionId: draft.decisionId, usedMemoryIds: draft.usedMemoryIds, valid: draft.validation.valid });
      return NextResponse.json({ ok: true, receipt });
    } catch (error) {
      failPlatformDraftStage(draftJob?.id, error);
      throw error;
    }
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "平台文案生成失败" }, { status: 500 });
  }
}
