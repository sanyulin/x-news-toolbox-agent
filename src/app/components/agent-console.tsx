"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import type { DashboardView } from "@/core/creator-desk";
import type { SourceRecord } from "@/server/workspace-data";

export function AgentConsole({
  enabled,
  latestRadar,
  sources,
}: {
  enabled: boolean;
  latestRadar?: DashboardView["latestRadar"];
  sources: SourceRecord[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState(() => sources.filter((source) => source.enabled).map((source) => source.id));
  const [focus, setFocus] = useState("");
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("");

  async function runAgent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected.length) return setMessage("请至少选择一个信息来源");
    setRunning(true);
    setMessage("");
    try {
      const response = await fetch("/api/radar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          commandId: crypto.randomUUID(),
          sourceIds: selected,
          focus: focus.trim() || undefined,
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || "Agent 运行失败");
      setMessage("运行完成，可前往结果记录查看证据");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Agent 运行失败");
    } finally {
      setRunning(false);
    }
  }

  return (
    <section className="page-stack">
      <header className="page-heading">
        <div>
          <span className="eyebrow">AGENT RUN</span>
          <h2>信息扫描</h2>
        </div>
        <span className={enabled ? "state state-ready" : "state"}>{enabled ? "就绪" : "需配置"}</span>
      </header>

      <form className="surface run-workspace" onSubmit={runAgent}>
        <fieldset className="source-picker">
          <legend>选择信息来源</legend>
          {!sources.length ? (
            <p className="empty-inline">还没有来源，请先前往“信息来源”添加。</p>
          ) : sources.map((source) => (
            <label key={source.id}>
              <input
                checked={selected.includes(source.id)}
                disabled={!source.enabled}
                onChange={(event) => setSelected((current) => event.target.checked ? [...current, source.id] : current.filter((id) => id !== source.id))}
                type="checkbox"
              />
              <span><b>{source.name}</b><small>{source.type === "x-account" ? `@${source.locator}` : source.locator}</small></span>
              <i className={`source-health source-health-${source.lastStatus}`} aria-label={source.lastStatus} />
            </label>
          ))}
        </fieldset>

        <label className="field">
          <span>分析重点</span>
          <input maxLength={100} onChange={(event) => setFocus(event.target.value)} placeholder="可选，例如：AI 创作者增长" value={focus} />
        </label>

        <div className="form-footer">
          <p className="form-status" aria-live="polite">{message}</p>
          <button className="primary-action compact-action" disabled={!enabled || running || !selected.length} type="submit">
            {running ? "正在运行…" : "运行 Agent"}
          </button>
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
