"use client";

import { FormEvent, useState } from "react";

type ReviewDecision = "approve" | "request_changes" | "reject";

export function ReviewPanel({
  proposalId,
  version,
}: {
  proposalId: string;
  version: number;
}) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState<ReviewDecision>();
  const [error, setError] = useState("");

  async function review(decision: ReviewDecision) {
    if (reason.trim().length < 2) {
      setError("请先填写简短的审核原因");
      return;
    }
    setSubmitting(decision);
    setError("");
    try {
      const response = await fetch("/api/reviews", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          commandId: crypto.randomUUID(),
          proposalId,
          expectedVersion: version,
          decision,
          reason,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "审核提交失败");
      window.location.assign("/#content-proposal");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "审核提交失败");
      setSubmitting(undefined);
    }
  }

  return (
    <form
      className="review-panel"
      onSubmit={(event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        void review("approve");
      }}
    >
      <div>
        <span>人工审核</span>
        <h4>最终决定始终由你作出</h4>
        <p>批准只会锁定可复制版本，不会自动发布到 X。</p>
      </div>
      <label>
        <span>审核原因</span>
        <textarea
          maxLength={500}
          minLength={2}
          onChange={(event) => setReason(event.target.value)}
          placeholder="例如：证据边界清楚，语气符合我的表达方式"
          required
          rows={3}
          value={reason}
        />
      </label>
      <div className="review-actions">
        <button
          className="button button-primary"
          disabled={Boolean(submitting)}
          type="submit"
        >
          {submitting === "approve" ? "正在批准…" : "批准，保留为待发布"}
        </button>
        <button
          className="button button-secondary"
          disabled={Boolean(submitting)}
          onClick={() => void review("request_changes")}
          type="button"
        >
          {submitting === "request_changes" ? "正在记录…" : "要求修改"}
        </button>
        <button
          className="review-reject"
          disabled={Boolean(submitting)}
          onClick={() => void review("reject")}
          type="button"
        >
          {submitting === "reject" ? "正在拒绝…" : "拒绝"}
        </button>
      </div>
      {error ? <p className="review-error" role="alert">{error}</p> : null}
    </form>
  );
}
