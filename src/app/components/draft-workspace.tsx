"use client";

import { useState } from "react";

import type { DashboardView } from "@/core/creator-desk";

export function DraftWorkspace({ proposal }: { proposal?: DashboardView["latestProposal"] }) {
  if (!proposal?.chineseDraft && !proposal?.englishDraft) {
    return <div className="surface empty-state">尚无内容草稿。请先在“结果记录”中选择一条信号生成草稿。</div>;
  }
  return <div className="draft-grid">{proposal.chineseDraft ? <Draft language="中文" text={proposal.chineseDraft} /> : null}{proposal.englishDraft ? <Draft language="English" text={proposal.englishDraft} /> : null}</div>;
}

function Draft({ language, text }: { language: string; text: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_500);
  }
  return <article className="surface draft-card"><header><span>{language}</span><button className="button-link" onClick={copy} type="button">{copied ? "已复制" : "复制"}</button></header><p>{text}</p></article>;
}
