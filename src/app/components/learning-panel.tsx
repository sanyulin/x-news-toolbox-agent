"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Learning = {
  operationId: string;
  version: number;
  status: "proposed" | "accepted" | "deleted";
  synthetic: boolean;
  publicationId: string;
  memoryText: string;
  mindDecision: {
    summary: string;
    confidence: "low" | "medium" | "high";
    mindName: string;
  };
};

export function LearningPanel({
  publicationId,
  publicationMode,
  mindConnected,
  learning,
}: {
  publicationId: string;
  publicationMode: "demo" | "real";
  mindConnected: boolean;
  learning?: Learning;
}) {
  const router = useRouter();
  const current = learning?.publicationId === publicationId ? learning : undefined;
  const [memoryText, setMemoryText] = useState(current?.memoryText ?? "");
  const [submitting, setSubmitting] = useState<string>();
  const [error, setError] = useState("");

  useEffect(() => {
    setMemoryText(current?.memoryText ?? "");
  }, [current?.memoryText, current?.operationId, current?.version]);

  async function request(body: Record<string, unknown>, action: string) {
    setSubmitting(action);
    setError("");
    try {
      const response = await fetch("/api/learning", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ commandId: crypto.randomUUID(), ...body }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "学习更新失败");
      window.location.hash = "creator-memory";
      router.refresh();
      setSubmitting(undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "学习更新失败");
      setSubmitting(undefined);
    }
  }

  if (!current) {
    const learningMode = publicationMode === "real" && mindConnected ? "mind" : "demo";
    return (
      <div className="learning-empty">
        <p>让 Mind 比较“实际发布文本”和手工指标，先提出一条可审阅的记忆。</p>
        <button
          className="button button-primary"
          disabled={Boolean(submitting)}
          onClick={() => void request({ action: "prepare", publicationId, learningMode }, "prepare")}
          type="button"
        >
          {submitting ? "正在分析…" : learningMode === "mind" ? "让核心 Mind 复盘" : "生成演示学习建议"}
        </button>
        <small>建议不会自动写入长期记忆。</small>
        {error ? <p className="review-error" role="alert">{error}</p> : null}
      </div>
    );
  }

  if (current.status === "deleted") {
    return (
      <div className="learning-deleted">
        <strong>这条记忆已删除</strong>
        <p>删除状态仍保留在本地审计记录中，但不会作为有效创作者记忆展示。</p>
      </div>
    );
  }

  async function manage(action: "accept" | "edit" | "delete") {
    await request(
      {
        action,
        learningId: current!.operationId,
        expectedVersion: current!.version,
        memoryText: action === "edit" ? memoryText : undefined,
      },
      action,
    );
  }

  return (
    <div className="learning-card">
      <div className="learning-decision">
        <span>{current.synthetic ? "演示 Mind 建议" : "核心 Mind 建议"}</span>
        <strong>{current.mindDecision.summary}</strong>
        <small>{current.mindDecision.mindName} · 置信度 {confidenceLabel(current.mindDecision.confidence)}</small>
      </div>
      <label>
        <span>拟写入的创作者记忆</span>
        <textarea maxLength={2000} onChange={(event) => setMemoryText(event.target.value)} rows={4} value={memoryText} />
      </label>
      <div className="learning-actions">
        {current.status === "proposed" ? (
          <button className="button button-primary" disabled={Boolean(submitting)} onClick={() => void manage("accept")} type="button">
            {submitting === "accept" ? "正在接受…" : "接受原建议"}
          </button>
        ) : null}
        <button className="button button-secondary" disabled={Boolean(submitting) || !memoryText.trim()} onClick={() => void manage("edit")} type="button">
          {submitting === "edit" ? "正在保存…" : current.status === "accepted" ? "保存修改" : "编辑后接受"}
        </button>
        <button className="review-reject" disabled={Boolean(submitting)} onClick={() => void manage("delete")} type="button">
          {submitting === "delete" ? "正在删除…" : "删除记忆"}
        </button>
      </div>
      {current.status === "accepted" ? <p className="memory-active">已由你确认，版本 {current.version}</p> : null}
      {error ? <p className="review-error" role="alert">{error}</p> : null}
    </div>
  );
}

function confidenceLabel(value: Learning["mindDecision"]["confidence"]) {
  return { low: "低", medium: "中", high: "高" }[value];
}
