"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

const metricFields = [
  ["impressions", "曝光"],
  ["likes", "点赞"],
  ["replies", "回复"],
  ["reposts", "转发"],
  ["bookmarks", "收藏"],
  ["followersDelta", "粉丝变化"],
] as const;

export function PublicationForm({
  proposalId,
  proposalVersion,
  mode,
  suggestedText,
}: {
  proposalId: string;
  proposalVersion: number;
  mode: "demo" | "real";
  suggestedText: string;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const metrics = Object.fromEntries(
      metricFields.flatMap(([name]) => {
        const value = String(form.get(name) ?? "").trim();
        return value === "" ? [] : [[name, Number(value)]];
      }),
    );

    try {
      const response = await fetch("/api/publications", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          commandId: crypto.randomUUID(),
          proposalId,
          expectedProposalVersion: proposalVersion,
          mode,
          postUrl: form.get("postUrl"),
          actualText: form.get("actualText"),
          publishedAt: new Date(String(form.get("publishedAt"))).toISOString(),
          metrics,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "发布结果关联失败");
      window.location.hash = "effect-review";
      router.refresh();
      setSubmitting(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "发布结果关联失败");
      setSubmitting(false);
    }
  }

  return (
    <form className="publication-form" onSubmit={submit}>
      <div className="publication-intro">
        <span>手工关联</span>
        <h4>把你实际发布的版本带回来</h4>
        <p>系统不会替你发布；这里只记录链接、最终文案和你愿意提供的指标。</p>
      </div>
      <label className="field-wide">
        <span>X 帖子链接</span>
        <input name="postUrl" placeholder="https://x.com/…/status/…" required type="url" />
      </label>
      <label className="field-wide">
        <span>实际发布文案</span>
        <textarea defaultValue={suggestedText} maxLength={5000} name="actualText" required rows={6} />
      </label>
      <label>
        <span>发布时间</span>
        <input name="publishedAt" required type="datetime-local" />
      </label>
      <div className="metric-inputs field-wide">
        {metricFields.map(([name, label]) => (
          <label key={name}>
            <span>{label}（可选）</span>
            <input min={name === "followersDelta" ? undefined : 0} name={name} step={1} type="number" />
          </label>
        ))}
      </div>
      <div className="publication-actions field-wide">
        <button className="button button-primary" disabled={submitting} type="submit">
          {submitting ? "正在关联…" : "关联发布结果"}
        </button>
        <small>{mode === "demo" ? "演示内容会继续保留醒目标记" : "真实发布记录"}</small>
      </div>
      {error ? <p className="review-error field-wide" role="alert">{error}</p> : null}
    </form>
  );
}
