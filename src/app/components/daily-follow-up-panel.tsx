"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { DashboardView } from "@/core/creator-desk";

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
            ? `${scheduler.mode === "real" ? "真实" : "演示"}模式 · ${scheduler.runState === "running" ? "正在运行" : "等待下一轮"}`
            : "启用后，后台会自行准备下一轮雷达；绝不自动发布。"}
        </p>
      </div>
      {scheduler.state === "enabled" ? (
        <>
          <small>下次：{formatTime(scheduler.nextRunAt)}</small>
          <small>最近：{formatTime(scheduler.lastRunAt)}</small>
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
