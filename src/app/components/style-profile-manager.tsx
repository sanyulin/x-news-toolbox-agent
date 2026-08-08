"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import type { StyleProfileRecord } from "@/server/workspace-data";

export function StyleProfileManager({ profiles, xConfigured }: { profiles: StyleProfileRecord[]; xConfigured: boolean }) {
  const router = useRouter();
  const [scanning, setScanning] = useState(false);
  const [message, setMessage] = useState("");

  async function scan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setScanning(true);
    setMessage("");
    const data = new FormData(event.currentTarget);
    const handles = String(data.get("handles") ?? "").split(/[\s,，]+/).filter(Boolean);
    try {
      const response = await fetch("/api/style-profiles/scan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          handles,
          sampleLimit: Number(data.get("sampleLimit")),
          includeReplies: data.get("includeReplies") === "on",
          intensity: data.get("intensity"),
          authorized: data.get("authorized") === "on",
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "风格扫描失败");
      setMessage("风格档案草稿已生成，请检查后启用");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "风格扫描失败");
    } finally {
      setScanning(false);
    }
  }

  async function activate(id: string) {
    setMessage("");
    const response = await fetch(`/api/style-profiles/${id}/activate`, { method: "POST" });
    const result = await response.json();
    setMessage(response.ok ? "风格档案已启用" : result.error || "启用失败");
    if (response.ok) router.refresh();
  }

  return (
    <section className="page-stack">
      <header className="page-heading">
        <div><span className="eyebrow">STYLE PROFILE</span><h2>风格档案</h2></div>
        <span className={xConfigured ? "state state-ready" : "state"}>{xConfigured ? "X 已连接" : "需配置 X"}</span>
      </header>

      <form className="surface style-scan-form" onSubmit={scan}>
        <label className="field style-handles"><span>已授权 X 账号（最多 3 个）</span><input name="handles" placeholder="@account_a, @account_b" required /></label>
        <label className="field"><span>样本数/账号</span><select defaultValue="100" name="sampleLimit"><option value="25">25 条</option><option value="50">50 条</option><option value="100">100 条</option></select></label>
        <label className="field"><span>参考强度</span><select defaultValue="medium" name="intensity"><option value="light">轻度参考</option><option value="medium">中等参考</option></select></label>
        <label className="check-field"><input name="includeReplies" type="checkbox" /><span>将回复纳入样本</span></label>
        <label className="check-field authorization-check"><input name="authorized" required type="checkbox" /><span>我确认这些账号属于本人或已获得明确授权</span></label>
        <button className="primary-action compact-action" disabled={!xConfigured || scanning} type="submit">{scanning ? "Agent 正在分析…" : "扫描并生成档案"}</button>
      </form>
      <p className="form-status" aria-live="polite">{message}</p>

      <div className="profile-list">
        {!profiles.length ? <div className="surface empty-state">尚无风格档案</div> : profiles.map((profile) => (
          <article className={`surface style-card ${profile.status === "active" ? "style-card-active" : ""}`} key={profile.id}>
            <div className="style-card-heading"><div><span>版本 {profile.version} · @{profile.handles.join(" · @")}</span><h3>{profile.features.summary}</h3></div><span className={profile.status === "active" ? "state state-ready" : "state"}>{profile.status === "active" ? "使用中" : "草稿"}</span></div>
            <dl className="style-features"><div><dt>句子节奏</dt><dd>{profile.features.sentenceRhythm}</dd></div><div><dt>论证结构</dt><dd>{profile.features.argumentStructure}</dd></div><div><dt>证据偏好</dt><dd>{profile.features.evidenceStyle}</dd></div><div><dt>避免复刻</dt><dd>{profile.features.avoid.join("；")}</dd></div></dl>
            <footer><span>{profile.sampleCount} 条样本 · {new Intl.DateTimeFormat("zh-CN").format(new Date(profile.generatedAt))}</span>{profile.status !== "active" ? <button className="button-link" onClick={() => activate(profile.id)} type="button">启用此档案</button> : null}</footer>
          </article>
        ))}
      </div>
    </section>
  );
}
