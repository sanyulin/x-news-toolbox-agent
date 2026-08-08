"use client";

import { useState } from "react";

export function ProposalButton({
  signalId,
  proposalMode,
}: {
  signalId: string;
  proposalMode: "demo" | "mind";
}) {
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");

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
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "内容建议生成失败");
      window.location.assign("/#content-proposal");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "内容建议生成失败");
    } finally {
      setRunning(false);
    }
  }

  return (
    <span className="proposal-control">
      <button className="signal-action" disabled={running} onClick={prepare} type="button">
        {running
          ? "正在生成…"
          : proposalMode === "mind"
            ? "让 Mind 起草"
            : "生成演示建议"}
      </button>
      {error ? <span className="control-error" role="alert">{error}</span> : null}
    </span>
  );
}
