import { ReviewPanel } from "@/app/components/review-panel";
import type { ContentProposal, PlatformDraft } from "@/core/creator-desk";
import { createAppDesk, resolveDatabasePath } from "@/server/create-app-desk";
import { createSqliteWorkspaceStore } from "@/adapters/sqlite-health";

export const dynamic = "force-dynamic";

export default async function InboxPage() {
  const store = createSqliteWorkspaceStore(resolveDatabasePath(process.env.CREATOR_MIND_DATABASE_PATH));
  const dashboard = await createAppDesk().inspect({ view: "dashboard" });
  const proposals = await store.listProposals?.(20) ?? [];
  const drafts = await store.listPlatformDrafts?.(20) ?? [];
  const draftByProposal = new Map<string, PlatformDraft>();
  for (const draft of drafts) if (!draftByProposal.has(draft.proposalId)) draftByProposal.set(draft.proposalId, draft);
  const cards = proposals.flatMap((proposal) => {
    const draft = draftByProposal.get(proposal.operationId);
    return draft ? [{ proposal, draft }] : [];
  });
  const waiting = cards.filter(({ proposal }) => proposal.status === "awaiting_review").length;
  const scheduler = dashboard.systemStatus.scheduler;

  return <section className="page-stack">
    <header className="page-heading"><div><small>MIND CONTENT INBOX</small><h2>今日内容</h2></div><span className={waiting ? "state state-working" : "state state-ready"}>{waiting ? `${waiting} 条待审核` : "已处理"}</span></header>
    {scheduler.state === "enabled" && scheduler.lastOutcome === "skipped" ? <section className="surface run-notice" role="status"><strong>本轮自动运行已完成 · SKIP</strong><p>Mind 已筛选 {scheduler.lastCandidateCount ?? 0} 条候选，保留 {scheduler.lastPriorityCount ?? 0} 条优先项，本轮没有生成新文案。</p>{scheduler.lastPlan?.reason ? <p>{scheduler.lastPlan.reason}</p> : null}<small>最近运行：{formatTime(scheduler.lastRunAt)} · 下一次：{formatTime(scheduler.nextRunAt)}</small></section> : null}
    {scheduler.state === "enabled" && scheduler.lastPlan ? <section className="surface mind-plan-summary"><strong>Mind 最近计划</strong><p>{scheduler.lastPlan.reason}</p><small>{scheduler.lastPlan.action === "scan" ? `关注：${scheduler.lastPlan.focus}` : "Mind 判断本轮无需扫描"}</small></section> : null}
    {cards.length ? <div className="inbox-list">{cards.map(({ proposal, draft }) => <InboxCard draft={draft} key={draft.operationId} proposal={proposal} />)}</div> : <div className="surface empty-state">尚无候选内容。完成设置并启用自动运行后，Mind 会把值得审核的内容送到这里。</div>}
  </section>;
}

function formatTime(value?: string) {
  return value ? new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "尚无";
}

function InboxCard({ proposal, draft }: { proposal: ContentProposal; draft: PlatformDraft }) {
  const sources = proposal.evidence.sources.filter((source) => draft.evidenceRefs.includes(source.id));
  return <article className="surface inbox-card">
    <header><div><span>{draft.platform === "x" ? "X" : "小红书"} · {proposal.status === "awaiting_review" ? "等待审核" : statusLabel(proposal.status)}</span><h3>{draft.title ?? proposal.signal.title}</h3></div><span className={draft.validation.valid ? "state state-ready" : "state"}>{draft.validation.valid ? "格式通过" : "需要修改"}</span></header>
    <p className="inbox-reason"><strong>推荐理由：</strong>{proposal.mindDecision.reason}</p>
    <p className="inbox-body">{draft.body}</p>
    {draft.hashtags.length ? <p className="draft-tags">{draft.hashtags.map((tag) => `#${tag}`).join(" ")}</p> : null}
    <div className="inbox-meta"><small>Mind：{draft.mindName}</small><small>决策：{draft.decisionId}</small><small>证据：{draft.evidenceVersion}</small></div>
    <div><strong>来源</strong><ul>{sources.map((source) => <li key={source.id}><a href={source.url} rel="noreferrer" target="_blank">{source.name}</a></li>)}</ul></div>
    <small>记忆影响：{draft.memoryInfluence}</small>
    {proposal.status === "awaiting_review" && draft.validation.valid ? <ReviewPanel proposalId={proposal.operationId} version={proposal.version} /> : null}
  </article>;
}

function statusLabel(status: ContentProposal["status"]) {
  return ({ needs_changes: "等待修改", approved_unpublished: "已采用", rejected: "已拒绝", abandoned: "已放弃", awaiting_review: "等待审核" } as const)[status];
}
