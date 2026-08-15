import { createAppDesk } from "@/server/create-app-desk";
import { AGENT_GATE_LABELS, CREATOR_AGENT_CONTRACT } from "@/core/agent-contract";
import { CreatorTestForm } from "@/app/components/creator-test-form";
import { MemoryRegistry } from "@/app/components/memory-registry";
import { createWorkspaceDataStore, summarizeCreatorTests } from "@/server/workspace-data";

export const dynamic = "force-dynamic";

export default async function ProofPage() {
  const dashboard = await createAppDesk().inspect({ view: "dashboard" });
  const proof = dashboard.competitionProof;
  const workspaceData = createWorkspaceDataStore();
  const tests = workspaceData.listCreatorTests();
  const latestRun = workspaceData.getLatestRadarJob();
  const validation = summarizeCreatorTests(tests);
  const stages = [
    ["01", "Mind 选题", proof.selection],
    ["02", "平台表达", proof.expression],
    ["03", "反馈学习", proof.learning],
    ["04", "自主跟进", proof.autonomy],
    ["05", "记忆因果", proof.memoryCausality],
  ] as const;
  return <section className="page-stack proof-page">
    <header className="page-heading"><div><span className="eyebrow">JUDGING PROOF</span><h2>比赛证明</h2></div><span className={proof.readyForJudging ? "state state-ready" : "state"}>{proof.readyForJudging ? "已准备评审" : "仍需补齐真实证据"}</span></header>
    <section className="proof-summary surface"><strong>{stages.filter(([, , stage]) => stage.status === "verified").length} / 5 已验证</strong><p>所有阶段必须来自真实来源与真实 Mind；演示和历史回放不会冒充现场调用。</p><a className="button-link" href="/api/competition-proof">下载证明 JSON</a></section>
    <ol className="proof-timeline">{stages.map(([number, title, stage]) => <li className="surface" key={number}><span className="proof-number">{number}</span><div><div className="proof-stage-heading"><h3>{title}</h3><span className={`proof-badge proof-${stage.status}`}>{stage.status === "verified" ? "已验证" : stage.status === "demo" ? "演示" : "缺失"}</span></div><strong>{stage.label}</strong><p>{stage.detail}</p>{stage.mindName ? <small>{stage.mindName} · {stage.decisionId}</small> : null}</div></li>)}</ol>
    <section className="proof-evidence-grid">
      <article className="surface"><h3>真实来源与主张</h3>{dashboard.latestProposal ? <><p>{dashboard.latestProposal.signal.sourceName} · {new Date(dashboard.latestProposal.signal.publishedAt).toLocaleString("zh-CN")}</p><p>证据版本 {dashboard.latestProposal.evidence.version}</p><ul>{dashboard.latestProposal.evidence.claims.map((claim) => <li key={claim.id}>{claim.status} · {claim.text}</li>)}</ul></> : <p>尚无证据包</p>}</article>
      <article className="surface"><h3>创作者审核</h3>{dashboard.latestProposal?.review ? <><p>{dashboard.latestProposal.review.decision} · 版本 {dashboard.latestProposal.review.reviewedVersion}</p><p>{dashboard.latestProposal.review.reason}</p></> : <p>尚未完成审核</p>}</article>
      <article className="surface"><h3>发布反馈</h3>{dashboard.latestPublication ? <><p>{dashboard.latestPublication.platform === "x" ? "X" : "小红书"} · {dashboard.latestPublication.mode === "real" ? "真实记录" : "演示记录"}</p><p>可用指标 {dashboard.latestPublication.metrics.availableFields.length} 项</p></> : <p>尚未关联发布结果</p>}</article>
      <article className="surface"><h3>长期记忆</h3>{dashboard.latestLearning ? <><p>{dashboard.latestLearning.status} · {dashboard.latestLearning.mindDecision.confidence}</p><p>{dashboard.latestLearning.memoryText}</p></> : <p>尚无学习记忆</p>}</article>
      <article className="surface"><h3>最近运行 checkpoint</h3>{latestRun ? <><p>Agent Contract {latestRun.contractVersion ?? CREATOR_AGENT_CONTRACT.version} · {latestRun.executionMode === "live" ? "实时运行" : latestRun.executionMode === "replay" ? "真实历史运行回放" : latestRun.executionMode === "demo" ? "演示运行" : "旧记录（模式未标注）"} · {latestRun.runStage ?? latestRun.stage}</p><p>重试 {latestRun.retryCount ?? 0} 次 · 心跳 {latestRun.heartbeatAt ? new Date(latestRun.heartbeatAt).toLocaleString("zh-CN") : "未记录"}</p>{latestRun.checkpoints?.length ? <ol className="checkpoint-list">{latestRun.checkpoints.map((checkpoint, index) => <li key={`${checkpoint.stage}-${checkpoint.startedAt}-${index}`}><strong>{checkpoint.stage}</strong><small>{checkpoint.executionMode} · {new Date(checkpoint.startedAt).toLocaleTimeString("zh-CN")}{checkpoint.completedAt ? " → 已结束" : " → 进行中"}</small></li>)}</ol> : <small>旧运行没有阶段历史。</small>}{latestRun.gateResults?.length ? <ul>{latestRun.gateResults.map((result) => <li key={result.gate}>{AGENT_GATE_LABELS[result.gate]} · {result.status === "passed" ? "通过" : result.status === "rejected" ? "未通过" : "待确认"} · {result.detail}</li>)}</ul> : null}</> : <p>尚无运行账本</p>}</article>
    </section>
    {dashboard.latestPlatformDraft ? <section className="surface proof-evidence"><h3>最近平台表达</h3><p>{dashboard.latestPlatformDraft.platform === "x" ? "X" : "小红书"} · 证据 {dashboard.latestPlatformDraft.evidenceVersion}</p><p>{dashboard.latestPlatformDraft.memoryInfluence}</p></section> : null}
    {dashboard.causalChain ? <section className="surface proof-evidence"><h3>两轮记忆因果链</h3><p>第一轮发布：{dashboard.causalChain.sourcePublication.postUrl}</p><p>确认记忆：{dashboard.causalChain.memory.memoryId}</p><p>第二轮影响：{dashboard.latestPlatformDraft?.memoryInfluence ?? dashboard.latestRadar?.mindDecision?.memoryInfluence ?? "尚未记录"}</p></section> : null}
    {dashboard.autonomyEvidence ? <section className="surface proof-evidence"><h3>自主任务产物</h3><p>{dashboard.autonomyEvidence.platformDraft.platform === "x" ? "X" : "小红书"} · 等待创作者审核</p><p>提案 {dashboard.autonomyEvidence.proposal.operationId} · 草稿 {dashboard.autonomyEvidence.platformDraft.operationId}</p></section> : null}
    <MemoryRegistry memories={dashboard.memories} />
    <section className="surface proof-evidence"><h3>真实创作者验证</h3><div className="proof-metrics"><strong>{validation.completeParticipants} / 3 最低人数</strong><strong>中位节省 {validation.medianReduction.toFixed(0)}% · {validation.medianReduction >= 30 ? "达标" : "未达标"}</strong><strong>采用率 {validation.adoptionRate.toFixed(0)}% · {validation.adoptionRate >= 60 ? "达标" : "未达标"}</strong><strong>Mind 推荐有用率 {validation.recommendationUsefulRate.toFixed(0)}%</strong></div><p>{validation.hasMemoryImprovement ? "已有创作者在第二轮记录 Mind 记忆带来的改善。" : "尚缺少第二轮 Mind 记忆改善反馈。"}</p><a className="button-link" href="/docs/creator-validation" target="_blank">打开测试执行协议</a></section>
    <CreatorTestForm />
  </section>;
}
