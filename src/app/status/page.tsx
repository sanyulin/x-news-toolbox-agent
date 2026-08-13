import Link from "next/link";

import { createAppDesk } from "@/server/create-app-desk";
import { createWorkspaceDataStore } from "@/server/workspace-data";

export const dynamic = "force-dynamic";

export default async function StatusPage() {
  const dashboard = await createAppDesk().inspect({ view: "dashboard" });
  const run = createWorkspaceDataStore().getLatestRadarJob();
  const scheduler = dashboard.systemStatus.scheduler;
  const stage = scheduler.state === "enabled" && scheduler.runState === "running" ? "Mind 正在自动工作" : run?.status === "running" ? run.message : scheduler.state === "enabled" ? "等待下一次自动运行" : "自动运行未启用";
  return <section className="page-stack">
    <header className="page-heading"><div><small>AGENT STATUS</small><h2>运行状态</h2></div><span className={scheduler.state === "enabled" && scheduler.runState === "running" ? "state state-working" : scheduler.state === "enabled" ? "state state-ready" : "state"}>{stage}</span></header>
    <section className="surface status-overview"><div><span>自动运行</span><strong>{scheduler.state === "enabled" ? "已启用" : "未启用"}</strong></div><div><span>核心 Mind</span><strong>{dashboard.systemStatus.mind.state === "connected" ? dashboard.systemStatus.mind.mindName : "未连接"}</strong></div><div><span>下一次</span><strong>{scheduler.state === "enabled" ? formatTime(scheduler.nextRunAt) : "—"}</strong></div></section>
    {scheduler.state === "enabled" ? <section className="surface status-detail"><h3>Mind-first 自动任务</h3><p>定时器只负责唤醒；Mind 决定是否扫描、关注方向、候选排序和创作内容。</p><dl><dt>目标平台</dt><dd>{scheduler.platform === "x" ? "X" : "小红书"}</dd><dt>最多输出</dt><dd>{scheduler.outputCount ?? 1} 条</dd><dt>最近结果</dt><dd>{scheduler.lastOutcome === "skipped" ? "Mind 跳过本轮" : scheduler.lastOutcome === "drafted" ? "已送入今日内容" : "尚无"}</dd>{scheduler.lastPlan ? <><dt>最近决策</dt><dd>{scheduler.lastPlan.reason}</dd><dt>记忆影响</dt><dd>{scheduler.lastPlan.memoryInfluence}</dd></> : null}</dl>{scheduler.lastError ? <p className="settings-error">{scheduler.lastError}</p> : null}</section> : <section className="surface empty-state">前往设置连接 Mind 并启用自动运行。<br /><Link href="/settings/connections">打开设置</Link></section>}
    {run?.checkpoints?.length ? <section className="surface status-detail"><h3>最近阶段</h3><ol className="checkpoint-list">{run.checkpoints.map((checkpoint, index) => <li key={`${checkpoint.stage}-${index}`}><strong>{checkpoint.stage}</strong><small>{checkpoint.executionMode} · {formatTime(checkpoint.heartbeatAt)}</small></li>)}</ol></section> : null}
  </section>;
}

function formatTime(value?: string) {
  return value ? new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "尚无";
}
