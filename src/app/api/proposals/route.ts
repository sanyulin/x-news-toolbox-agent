import { NextResponse } from "next/server";
import { z } from "zod";

import { createAppDesk } from "@/server/create-app-desk";
import { beginPlatformDraftStage, completePlatformDraftStage, failPlatformDraftStage } from "@/server/radar-job-runner";

export const runtime = "nodejs";

const requestSchema = z.object({
  commandId: z.string().min(8).max(100),
  signalId: z.string().min(1).max(120),
  proposalMode: z.enum(["demo", "mind"]),
  platform: z.enum(["x", "xiaohongshu"]).optional(),
});

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "内容建议参数无效" },
      { status: 400 },
    );
  }

  try {
    const desk = createAppDesk();
    const receipt = await desk.submit({
      commandId: parsed.data.commandId,
      command: {
        type: "prepare_proposal",
        signalId: parsed.data.signalId,
        proposalMode: parsed.data.platform ? "evidence" : parsed.data.proposalMode,
      },
    });
    if (!parsed.data.platform) return NextResponse.json({ ok: true, receipt });
    const proposal = (await desk.inspect({ view: "dashboard" })).latestProposal;
    if (!proposal || proposal.operationId !== receipt.operationId) throw new Error("证据提案没有正确保存");
    const draftJob = beginPlatformDraftStage({
      radarOperationId: proposal.radarProof?.operationId,
      proposalId: proposal.operationId,
      platform: parsed.data.platform,
      platformMode: parsed.data.proposalMode,
      evidenceVersion: proposal.evidence.version,
    });
    try {
      const platformReceipt = await desk.submit({
        commandId: `${parsed.data.commandId}:platform`,
        command: {
          type: "prepare_platform_draft",
          proposalId: receipt.operationId,
          platform: parsed.data.platform,
          proposalMode: parsed.data.proposalMode,
        },
      });
      const draft = (await desk.inspect({ view: "dashboard" })).latestPlatformDraft;
      if (!draft || draft.operationId !== platformReceipt.operationId) throw new Error("平台草稿没有正确保存");
      completePlatformDraftStage(draftJob?.id, { platformDraftId: draft.operationId, mindDecisionId: draft.decisionId, usedMemoryIds: draft.usedMemoryIds, valid: draft.validation.valid });
      return NextResponse.json({ ok: true, receipt, platformReceipt });
    } catch (error) {
      failPlatformDraftStage(draftJob?.id, error);
      throw error;
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "内容建议生成失败";
    return NextResponse.json(
      { ok: false, error: message },
      { status: message.includes("MINDS_BUILDER_API_KEY") ? 503 : 500 },
    );
  }
}
