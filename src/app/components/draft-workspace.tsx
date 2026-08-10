"use client";

import { useState } from "react";

import type { DashboardView } from "@/core/creator-desk";
import { createPlatformVariants, type CopyPlatform } from "@/core/platform-copy";

export function DraftWorkspace({ proposal }: { proposal?: DashboardView["latestProposal"] }) {
  if (!proposal?.chineseDraft && !proposal?.englishDraft) {
    return <div className="surface empty-state">尚无内容草稿。请先在“结果记录”中选择一条信号生成草稿。</div>;
  }
  const variants = createPlatformVariants({ chinese: proposal.chineseDraft, english: proposal.englishDraft });
  return <PlatformDrafts variants={variants} />;
}

function PlatformDrafts({ variants }: { variants: ReturnType<typeof createPlatformVariants> }) {
  const [platform, setPlatform] = useState<CopyPlatform>(variants[0]?.platform ?? "x");
  const selected = variants.find((variant) => variant.platform === platform) ?? variants[0];
  return <div className="draft-platform-workspace">
    <div className="draft-platform-picker" role="group" aria-label="选择输出平台">
      <span>输出平台</span>
      {variants.map((variant) => <button className={variant.platform === selected?.platform ? "button-link is-active" : "button-link"} key={variant.platform} onClick={() => setPlatform(variant.platform)} type="button">{variant.label}</button>)}
    </div>
    {selected ? <div className="draft-grid"><Draft variant={selected} /></div> : null}
  </div>;
}

function Draft({ variant }: { variant: ReturnType<typeof createPlatformVariants>[number] }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(variant.text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_500);
  }
  return <article className="surface draft-card"><header><span>{variant.label} · {variant.characterCount}/{variant.maxCharacters}</span><button className="button-link" onClick={copy} type="button">{copied ? "已复制" : "复制"}</button></header><p>{variant.text}</p>{variant.warnings.map((warning) => <small className="draft-warning" key={warning}>{warning}</small>)}</article>;
}
