import { NextResponse } from "next/server";
import { z } from "zod";
import { createAppDesk } from "@/server/create-app-desk";
import { beginPlatformDraftStage, completePlatformDraftStage, failPlatformDraftStage } from "@/server/radar-job-runner";

export const runtime = "nodejs";
const editSchema = z.object({ commandId: z.string().min(8).max(100), body: z.string().trim().min(1).max(1400), title: z.string().trim().max(40).optional(), hashtags: z.array(z.string().trim().min(1).max(40)).max(12), coverText: z.string().trim().max(80).optional(), visualBrief: z.array(z.string().trim().min(1).max(160)).max(6).optional() });

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const parsed = editSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "人工编辑内容无效" }, { status: 400 });
  let draftJobId: string | undefined;
  try {
    const { id } = await context.params;
    const desk = createAppDesk();
    const before = await desk.inspect({ view: "dashboard" });
    const draft = before.latestPlatformDraft;
    const proposal = before.latestProposal;
    if (!draft || draft.operationId !== id || !proposal || proposal.operationId !== draft.proposalId) throw new Error("平台文案不存在或不是最新版本");
    const draftJob = beginPlatformDraftStage({ radarOperationId: proposal.radarProof?.operationId, proposalId: proposal.operationId, platform: draft.platform, platformMode: proposal.synthetic ? "demo" : "mind", evidenceVersion: proposal.evidence.version });
    draftJobId = draftJob?.id;
    const receipt = await desk.submit({ commandId: parsed.data.commandId, command: { type: "edit_platform_draft", draftId: id, body: parsed.data.body, title: parsed.data.title, hashtags: parsed.data.hashtags, coverText: parsed.data.coverText, visualBrief: parsed.data.visualBrief } });
    const edited = (await desk.inspect({ view: "dashboard" })).latestPlatformDraft;
    if (!edited || edited.operationId !== receipt.operationId) throw new Error("人工编辑没有正确保存");
    completePlatformDraftStage(draftJob?.id, { platformDraftId: edited.operationId, mindDecisionId: edited.decisionId, usedMemoryIds: edited.usedMemoryIds, valid: edited.validation.valid });
    return NextResponse.json({ ok: true, receipt });
  } catch (error) {
    failPlatformDraftStage(draftJobId, error);
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "人工编辑保存失败" }, { status: 500 });
  }
}

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const dashboard = await createAppDesk().inspect({ view: "dashboard" });
  const { id } = await context.params;
  const draft = dashboard.latestPlatformDraft;
  const proposal = dashboard.latestProposal;
  if (!draft || draft.operationId !== id || !proposal || proposal.operationId !== draft.proposalId) return NextResponse.json({ ok: false, error: "平台文案不存在或不是最新版本" }, { status: 404 });
  if (draft.validation.valid) return NextResponse.json({ ok: false, error: "平台文案已经通过校验，无需自动修订" }, { status: 409 });
  if (draft.revisionCount >= 2) return NextResponse.json({ ok: false, error: "已达到两次自动修订上限，请使用人工编辑" }, { status: 409 });
  const draftJob = beginPlatformDraftStage({ radarOperationId: proposal.radarProof?.operationId, proposalId: proposal.operationId, platform: draft.platform, platformMode: proposal.synthetic ? "demo" : "mind", evidenceVersion: proposal.evidence.version });
  try {
    const desk = createAppDesk();
    const receipt = await desk.submit({ commandId: crypto.randomUUID(), command: { type: "prepare_platform_draft", proposalId: proposal.operationId, platform: draft.platform, proposalMode: proposal.synthetic ? "demo" : "mind" } });
    const revised = (await desk.inspect({ view: "dashboard" })).latestPlatformDraft;
    if (!revised || revised.operationId !== receipt.operationId) throw new Error("修订后的平台草稿没有正确保存");
    completePlatformDraftStage(draftJob?.id, { platformDraftId: revised.operationId, mindDecisionId: revised.decisionId, usedMemoryIds: revised.usedMemoryIds, valid: revised.validation.valid });
    return NextResponse.json({ ok: true, receipt });
  } catch (error) {
    failPlatformDraftStage(draftJob?.id, error);
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "平台文案修订失败" }, { status: 500 });
  }
}
