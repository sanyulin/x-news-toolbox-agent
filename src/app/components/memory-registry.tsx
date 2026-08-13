"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { CreatorMemory } from "@/core/creator-desk";

export function MemoryRegistry({ memories }: { memories: CreatorMemory[] }) {
  const router = useRouter();
  const [pending, setPending] = useState<string>();
  const [error, setError] = useState("");

  async function decide(memoryId: string, action: "supersede" | "delete") {
    setPending(memoryId);
    setError("");
    try {
      const response = await fetch(`/api/memories/${memoryId}/decision`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "记忆决策失败");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "记忆决策失败");
    } finally {
      setPending(undefined);
    }
  }

  return <section className="surface memory-registry"><h3>创作者记忆审计</h3>{memories.length ? <ul>{memories.map((memory) => <li key={memory.memoryId}><div><strong>{scopeLabel(memory.scope)} · {statusLabel(memory.status)}</strong><p>{memory.text}</p><small>{memory.memoryId} · 已应用 {memory.applicationCount} 次</small></div>{memory.status === "accepted" ? <div className="memory-actions"><span>保留</span><button disabled={Boolean(pending)} onClick={() => void decide(memory.memoryId, "supersede")} type="button">标记为已替代</button><button disabled={Boolean(pending)} onClick={() => void decide(memory.memoryId, "delete")} type="button">删除</button></div> : memory.status === "proposed" ? <small>请在内容草稿的学习区确认或编辑</small> : null}</li>)}</ul> : <p>尚无记忆记录。</p>}{error ? <p className="review-error" role="alert">{error}</p> : null}</section>;
}

function scopeLabel(scope: CreatorMemory["scope"]) {
  return scope === "global" ? "全局" : scope === "x" ? "X" : "小红书";
}

function statusLabel(status: CreatorMemory["status"]) {
  return { proposed: "待确认", accepted: "已接受", superseded: "已替代", deleted: "已删除" }[status];
}
