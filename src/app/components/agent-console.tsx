"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

import type { DashboardView } from "@/core/creator-desk";
import type { SourceRecord } from "@/server/workspace-data";
import type { RadarJobRecord } from "@/server/workspace-data";

export function AgentConsole({
  enabled,
  latestRadar,
  sources,
  initialJob,
  readinessMessage,
}: {
  enabled: boolean;
  latestRadar?: DashboardView["latestRadar"];
  sources: SourceRecord[];
  initialJob?: RadarJobRecord;
  readinessMessage?: string;
}) {
  const router = useRouter();
  const [focus, setFocus] = useState("");
  const [job, setJob] = useState(initialJob);
  const [message, setMessage] = useState("");
  const running = job?.status === "running";
  const enabledSources = sources.filter((source) => source.enabled);

  useEffect(() => {
    if (!job || job.status !== "running") return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/radar/${job.id}`, { cache: "no-store" });
        const result = await response.json() as { job?: RadarJobRecord; error?: string };
        if (!response.ok || !result.job) throw new Error(result.error || "读取任务状态失败");
        if (cancelled) return;
        setJob(result.job);
        if (result.job.status === "completed") {
          setMessage("运行完成，可前往结果记录查看证据");
          router.refresh();
        }
      } catch (error) {
        if (!cancelled) setMessage(error instanceof Error ? error.message : "读取任务状态失败");
      }
    }, 800);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [job, router]);

  async function runAgent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    try {
      const response = await fetch("/api/radar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          commandId: crypto.randomUUID(),
          sourceIds: enabledSources.map((source) => source.id),
          focus: focus.trim() || undefined,
        }),
      });
      const result = (await response.json()) as { error?: string; job?: RadarJobRecord };
      if (!response.ok) throw new Error(result.error || "Agent 运行失败");
      if (!result.job) throw new Error("没有返回雷达任务");
      setJob(result.job);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Agent 运行失败");
    }
  }

  async function retry() {
    if (!job) return;
    setMessage("");
    try {
      const response = await fetch(`/api/runs/${job.id}/retry`, { method: "POST" });
      const result = await response.json() as { run?: RadarJobRecord; error?: string };
      if (!response.ok || !result.run) throw new Error(result.error || "重试失败");
      setJob(result.run);
    } catch (error) { setMessage(error instanceof Error ? error.message : "重试失败"); }
  }

  return (
    <section className="page-stack">
      <header className="page-heading">
        <h2>信息扫描</h2>
        <span
          aria-live="polite"
          className={running ? "state state-working" : enabled ? "state state-ready" : "state"}
        >
          {running ? "工作中" : enabled ? "就绪" : "需配置"}
        </span>
      </header>

      <form className="surface run-workspace" onSubmit={runAgent}>
        <div className="run-source-summary">
          <span>{enabledSources.length ? `自动使用 ${enabledSources.length} 个已启用来源` : "使用 Horizon 内置来源"}</span>
          <Link href="/sources">管理来源</Link>
        </div>

        <label className="field">
          <span>分析重点（可选）</span>
          <input maxLength={240} onChange={(event) => setFocus(event.target.value)} placeholder="可选，例如：AI 创作者增长" value={focus} />
        </label>

        <div className="form-footer">
          <p className={job?.status === "failed" ? "form-status settings-error" : "form-status"} aria-live="polite">{running ? `${job.message}${job.executionMode === "replay" ? "（历史 checkpoint 回放）" : ""}` : job?.error || message || readinessMessage}</p>
          <button className="primary-action compact-action" disabled={!enabled || running} type="submit">
            {running ? "正在运行…" : "运行 Agent"}
          </button>
          {job?.status === "failed" && job.runStage !== "failed_terminal" ? <button className="button button-secondary" onClick={() => void retry()} type="button">从失败阶段重试</button> : null}
          {job?.runStage === "failed_terminal" ? <small>请先到“连接设置”修复配置，再新建一次运行。</small> : null}
        </div>
      </form>

      <section className="surface latest-run-card">
        <div>
          <span>最近运行</span>
          <strong>{latestRadar ? `${latestRadar.signals.length} 条结果` : "尚无真实运行"}</strong>
          {latestRadar ? <time dateTime={latestRadar.generatedAt}>{new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(latestRadar.generatedAt))}</time> : null}
        </div>
        <Link className="button-link" href="/results">查看结果</Link>
      </section>
    </section>
  );
}
