"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { DAILY_CANDIDATE_LIMIT, DAILY_PRIORITY_LIMIT, type DashboardView, type PlatformId } from "@/core/creator-desk";

export function DailyFollowUpPanel({
  scheduler,
  mindConnected,
}: {
  scheduler: DashboardView["systemStatus"]["scheduler"];
  mindConnected: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [platform, setPlatform] = useState<PlatformId>(scheduler.state === "enabled" ? scheduler.platform : "x");
  const [outputCount, setOutputCount] = useState(scheduler.state === "enabled" ? scheduler.outputCount ?? 1 : 1);
  const [focus, setFocus] = useState(scheduler.state === "enabled" ? scheduler.focus ?? "" : "");
  const [dailyTime, setDailyTime] = useState(scheduler.state === "enabled" ? scheduler.dailyTime ?? "09:00" : "09:00");

  async function configure(enabled: boolean, mode: "demo" | "real") {
    setPending(true);
    setError(undefined);
    try {
      const response = await fetch("/api/follow-up", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          commandId: crypto.randomUUID(),
          enabled,
          mode,
          platform,
          outputCount,
          focus: focus.trim() || undefined,
          dailyTime,
        }),
      });
      const payload = (await response.json()) as { ok: boolean; error?: string };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "设置失败");
      }
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "设置失败");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="scheduler-card" aria-label="每日自主跟进">
      <div>
        <strong>自主跟进</strong>
        <p>
          {scheduler.state === "enabled"
            ? `${scheduler.mode === "real" ? "真实" : "演示"}模式 · 每天筛选 ${DAILY_CANDIDATE_LIMIT} 条、优先保留 ${DAILY_PRIORITY_LIMIT} 条 · 最多输出 ${scheduler.outputCount ?? 1} 条 · ${scheduler.runState === "running" ? "Mind 正在工作" : "等待下一轮"}`
            : `每天采集 ${DAILY_CANDIDATE_LIMIT} 条候选，由 Mind 优先保留 ${DAILY_PRIORITY_LIMIT} 条；没有合适内容时会说明 SKIP 原因。`}
        </p>
      </div>
      {scheduler.state === "enabled" ? (
        <>
          <small>下次：{formatTime(scheduler.nextRunAt)}</small>
          <small>最近：{formatTime(scheduler.lastRunAt)}</small>
          {scheduler.lastPlan ? <small>Mind 计划：{scheduler.lastPlan.action === "scan" ? "执行扫描" : "跳过本轮"} · {scheduler.lastPlan.reason}</small> : null}
          {scheduler.lastError ? <p className="scheduler-error">{scheduler.lastError}</p> : null}
          <button
            className="button button-secondary"
            disabled={pending}
            onClick={() => configure(false, scheduler.mode)}
            type="button"
          >
            {pending ? "保存中…" : "停用每日跟进"}
          </button>
        </>
      ) : (
        <div className="scheduler-actions">
          <label><span>输出平台</span><select aria-label="自主跟进目标平台" disabled={pending} onChange={(event) => setPlatform(event.target.value as PlatformId)} value={platform}><option value="x">X</option><option value="xiaohongshu">小红书</option></select></label>
          <label><span>每天运行</span><input disabled={pending} onChange={(event) => setDailyTime(event.target.value)} type="time" value={dailyTime} /></label>
          <label><span>最多输出</span><input disabled={pending} max={5} min={1} onChange={(event) => setOutputCount(Number(event.target.value))} type="number" value={outputCount} /></label>
          <label className="scheduler-focus"><span>关注方向（可选）</span><input disabled={pending} maxLength={240} onChange={(event) => setFocus(event.target.value)} placeholder="例如：AI 产品与创作者经济" value={focus} /></label>
          <button
            className="button button-primary"
            disabled={pending || !mindConnected}
            onClick={() => configure(true, "real")}
            type="button"
          >
            启用真实跟进
          </button>
          <button
            className="button button-secondary"
            disabled={pending}
            onClick={() => configure(true, "demo")}
            type="button"
          >
            启用演示跟进
          </button>
        </div>
      )}
      {!mindConnected && scheduler.state !== "enabled" ? (
        <small>连接核心 Mind 后才能启用真实模式。</small>
      ) : null}
      {error ? <p className="scheduler-error">{error}</p> : null}
    </section>
  );
}

function formatTime(value?: string) {
  return value
    ? new Intl.DateTimeFormat("zh-CN", {
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(value))
    : "尚无";
}
