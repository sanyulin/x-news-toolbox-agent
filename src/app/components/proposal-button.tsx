"use client";

import { useState } from "react";

import type { PlatformId } from "@/core/creator-desk";

export function ProposalButton({
  signalId,
  proposalMode,
}: {
  signalId: string;
  proposalMode: "demo" | "mind";
}) {
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [platform, setPlatform] = useState<PlatformId>("x");

  async function prepare() {
    setRunning(true);
    setError("");
    try {
      const response = await fetch("/api/proposals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          commandId: crypto.randomUUID(),
          signalId,
          proposalMode,
          platform,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "内容建议生成失败");
      window.location.assign("/drafts");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "内容建议生成失败");
    } finally {
      setRunning(false);
    }
  }

  return (
    <span className="proposal-control">
      <select aria-label="输出平台" disabled={running} onChange={(event) => setPlatform(event.target.value as PlatformId)} value={platform}>
        <option value="x">X</option>
        <option value="xiaohongshu">小红书</option>
      </select>
      <button className="signal-action" disabled={running} onClick={prepare} type="button">
        {running
          ? "正在生成…"
          : proposalMode === "mind"
            ? `生成 ${platform === "x" ? "X" : "小红书"} 版本`
            : `生成${platform === "x" ? " X" : "小红书"}演示版本`}
      </button>
      {error ? <span className="control-error" role="alert">{error}</span> : null}
    </span>
  );
}
