"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function RadarRunButton({
  className,
  label,
  decisionMode = "rules",
  dataMode = "demo_only",
}: {
  className: string;
  label: string;
  decisionMode?: "rules" | "mind" | "demo_mind";
  dataMode?: "demo_only" | "live_with_demo_fallback";
}) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");

  async function run() {
    setRunning(true);
    setError("");
    try {
      const response = await fetch("/api/radar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          commandId: crypto.randomUUID(),
          decisionMode,
          dataMode,
        }),
      });
      if (!response.ok) throw new Error("今日雷达运行失败");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "今日雷达运行失败");
    } finally {
      setRunning(false);
    }
  }

  return (
    <span className="radar-run-control">
      <button className={className} disabled={running} onClick={run} type="button">
        {running ? "正在整理信号…" : label}
      </button>
      {error ? <span className="control-error" role="alert">{error}</span> : null}
    </span>
  );
}
