"use client";

import { useState } from "react";

type ProbeState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success"; message: string }
  | { kind: "error"; message: string };

export function MindProbeButton({ enabled }: { enabled: boolean }) {
  const [state, setState] = useState<ProbeState>({ kind: "idle" });

  async function runProbe() {
    setState({ kind: "loading" });
    try {
      const response = await fetch("/api/minds/probe", { method: "POST" });
      const body = (await response.json()) as {
        ok: boolean;
        reply?: string;
        error?: string;
      };

      if (!response.ok || !body.ok) {
        throw new Error(body.error || "验证失败，请稍后重试");
      }

      setState({ kind: "success", message: body.reply || "连接验证通过" });
    } catch (error) {
      setState({
        kind: "error",
        message: error instanceof Error ? error.message : "验证失败，请稍后重试",
      });
    }
  }

  return (
    <div className="probe-control">
      <button
        className="button button-primary"
        disabled={!enabled || state.kind === "loading"}
        onClick={runProbe}
        type="button"
      >
        {state.kind === "loading" ? "正在等待 Mind 回复…" : "验证核心 Mind"}
      </button>
      {state.kind === "success" ? (
        <p className="probe-message probe-success" role="status">
          {state.message}
        </p>
      ) : null}
      {state.kind === "error" ? (
        <p className="probe-message probe-error" role="alert">
          {state.message}
        </p>
      ) : null}
    </div>
  );
}
