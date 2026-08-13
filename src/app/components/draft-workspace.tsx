"use client";

import { useState } from "react";

import type { DashboardView } from "@/core/creator-desk";
import type { PlatformId } from "@/core/creator-desk";

export function DraftWorkspace({ proposal, draft }: { proposal?: DashboardView["latestProposal"]; draft?: DashboardView["latestPlatformDraft"] }) {
  if (!proposal) return <div className="surface empty-state">尚无内容草稿。请先在“运行结果”中选择平台并生成版本。</div>;
  const activeProposal = proposal;
  const [platform, setPlatform] = useState<PlatformId>(draft?.platform ?? "x");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  async function generate() {
    setRunning(true); setError("");
    try {
      const response = await fetch(`/api/proposals/${activeProposal.operationId}/platform-draft`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ commandId: crypto.randomUUID(), platform, proposalMode: activeProposal.synthetic ? "demo" : "mind" }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "平台文案生成失败");
      window.location.reload();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "平台文案生成失败"); setRunning(false); }
  }
  const current = draft?.proposalId === activeProposal.operationId && draft.platform === platform ? draft : undefined;
  return <div className="draft-platform-workspace">
    <div className="draft-platform-picker" role="group" aria-label="选择输出平台">
      <span>输出平台</span>
      <button className={platform === "x" ? "button-link is-active" : "button-link"} onClick={() => setPlatform("x")} type="button">X</button>
      <button className={platform === "xiaohongshu" ? "button-link is-active" : "button-link"} onClick={() => setPlatform("xiaohongshu")} type="button">小红书</button>
      <button className="button button-primary" disabled={running} onClick={generate} type="button">{running ? "Mind 正在创作…" : `生成 ${platform === "x" ? "X" : "小红书"} 版本`}</button>
    </div>
    {error ? <p className="review-error" role="alert">{error}</p> : null}
    {current ? <Draft draft={current} proposal={activeProposal} /> : <div className="surface empty-state">选择平台后，让 Mind 基于同一证据和已确认记忆单独创作。</div>}
  </div>;
}

function Draft({ draft, proposal }: { draft: NonNullable<DashboardView["latestPlatformDraft"]>; proposal: NonNullable<DashboardView["latestProposal"]> }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText([draft.title, draft.body, draft.hashtags.map((tag) => `#${tag}`).join(" ")].filter(Boolean).join("\n\n"));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_500);
  }
  const citedSources = proposal.evidence.sources.filter((source) => draft.evidenceRefs.includes(source.id));
  return <article className="surface draft-card"><header><span>{draft.platform === "x" ? "X" : "小红书"} · {draft.validation.valid ? "校验通过" : "需要人工修改"}{draft.editedByCreator ? " · 创作者已编辑" : ""}</span><button className="button-link" onClick={copy} type="button">{copied ? "已复制" : "复制"}</button></header>{draft.title ? <h3>{draft.title}</h3> : null}<p>{draft.body}</p>{draft.hashtags.length ? <p className="draft-tags">{draft.hashtags.map((tag) => `#${tag}`).join(" ")}</p> : null}{draft.coverText ? <p><strong>封面文案：</strong>{draft.coverText}</p> : null}{draft.visualBrief?.length ? <div><strong>图片建议</strong><ul>{draft.visualBrief.map((item) => <li key={item}>{item}</li>)}</ul></div> : null}{citedSources.length ? <div><strong>引用来源</strong><ul>{citedSources.map((source) => <li key={source.id}><a href={source.url} rel="noreferrer" target="_blank">{source.name}</a></li>)}</ul></div> : null}<small>记忆影响：{draft.memoryInfluence}</small>{draft.usedMemoryIds.length ? <small>使用记忆：{draft.usedMemoryIds.join("、")}</small> : null}{draft.memoryConflicts?.length ? <div className="memory-conflict"><strong>记忆冲突，需由你决定保留或替代</strong><ul>{draft.memoryConflicts.map((message) => <li key={message}>{message}</li>)}</ul></div> : null}{draft.validation.errors.map((message) => <small className="draft-warning" key={message}>{message}</small>)}{draft.validation.warnings.map((message) => <small className="draft-warning" key={message}>{message}</small>)}{!draft.validation.valid ? <ManualEditor draft={draft} /> : null}</article>;
}

function ManualEditor({ draft }: { draft: NonNullable<DashboardView["latestPlatformDraft"]> }) {
  const [body, setBody] = useState(draft.body);
  const [title, setTitle] = useState(draft.title ?? "");
  const [hashtags, setHashtags] = useState(draft.hashtags.join("、"));
  const [coverText, setCoverText] = useState(draft.coverText ?? "");
  const [visualBrief, setVisualBrief] = useState(draft.visualBrief?.join("\n") ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function save() {
    setSaving(true); setError("");
    try {
      const response = await fetch(`/api/variants/${draft.operationId}/revise`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ commandId: crypto.randomUUID(), body, title: title || undefined, hashtags: hashtags.split(/[、,，#\s]+/u).filter(Boolean), coverText: coverText || undefined, visualBrief: visualBrief.split("\n").map((item) => item.trim()).filter(Boolean) }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "人工编辑保存失败");
      window.location.reload();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "人工编辑保存失败"); setSaving(false); }
  }
  return <div className="manual-draft-editor"><strong>人工编辑</strong>{draft.platform === "xiaohongshu" ? <label><span>标题</span><input maxLength={40} onChange={(event) => setTitle(event.target.value)} value={title} /></label> : null}<label><span>正文</span><textarea maxLength={1400} onChange={(event) => setBody(event.target.value)} rows={8} value={body} /></label><label><span>标签</span><input onChange={(event) => setHashtags(event.target.value)} value={hashtags} /></label>{draft.platform === "xiaohongshu" ? <><label><span>封面文案</span><input maxLength={80} onChange={(event) => setCoverText(event.target.value)} value={coverText} /></label><label><span>图片建议（每行一条）</span><textarea maxLength={700} onChange={(event) => setVisualBrief(event.target.value)} rows={4} value={visualBrief} /></label></> : null}<button className="button button-primary" disabled={saving || !body.trim()} onClick={() => void save()} type="button">{saving ? "保存中…" : "保存并重新校验"}</button>{error ? <p className="review-error" role="alert">{error}</p> : null}</div>;
}
