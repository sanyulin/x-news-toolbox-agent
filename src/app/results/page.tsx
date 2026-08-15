import { ProposalButton } from "@/app/components/proposal-button";
import { createAppDesk } from "@/server/create-app-desk";

export const dynamic = "force-dynamic";

export default async function ResultsPage() {
  const dashboard = await createAppDesk().inspect({ view: "dashboard" });
  const run = dashboard.latestRadar?.mode === "live" ? dashboard.latestRadar : undefined;
  const visibleWarnings = run?.warnings?.filter((warning) => !/warnings\.warn\(\s*$/i.test(warning.trim()));
  return <section className="page-stack"><header className="page-heading"><h2>运行结果</h2>{run ? <time dateTime={run.generatedAt}>{new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(run.generatedAt))}</time> : null}</header>{!run ? <div className="surface empty-state">尚无真实运行结果</div> : <section className="surface result-surface">{visibleWarnings?.length ? <p className="run-warning">{visibleWarnings.join("；")}</p> : null}<ol className="result-list">{run.signals.map((signal) => <li key={signal.id}><div className="result-main"><div className="result-meta"><span>{signal.sourceName}</span><span>{Math.round(signal.relevanceScore * 100)}%</span></div><h3>{signal.title}</h3><p>{signal.summary}</p>{signal.mindReason ? <small>{signal.mindReason}</small> : null}</div><div className="result-actions"><a href={signal.sourceUrl} rel="noreferrer" target="_blank">查看来源</a>{signal.recommendation !== "skip" ? <ProposalButton proposalMode="mind" signalId={signal.id} /> : null}</div></li>)}</ol></section>}</section>;
}
