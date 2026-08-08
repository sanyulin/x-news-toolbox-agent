"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import type { SourceRecord, SourceType } from "@/server/workspace-data";

const typeLabels: Record<SourceType, string> = {
  rss: "RSS",
  atom: "Atom",
  json: "JSON API",
  rsshub: "RSSHub",
  "x-account": "X 账号",
};

export function SourceManager({ initialSources }: { initialSources: SourceRecord[] }) {
  const router = useRouter();
  const [type, setType] = useState<SourceType>("rss");
  const [busy, setBusy] = useState<string>();
  const [message, setMessage] = useState("");

  async function addSource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("add");
    setMessage("");
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      await request("/api/sources", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type,
          name: data.get("name"),
          locator: data.get("locator"),
          enabled: true,
          mapping: type === "json" ? Object.fromEntries(
            ["title", "url", "summary", "publishedAt"]
              .map((key) => [key, String(data.get(`mapping.${key}`) ?? "").trim()])
              .filter(([, value]) => value),
          ) : undefined,
        }),
      });
      form.reset();
      setType("rss");
      setMessage("来源已添加");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "来源添加失败");
    } finally {
      setBusy(undefined);
    }
  }

  async function act(source: SourceRecord, action: "test" | "toggle" | "delete") {
    setBusy(`${source.id}:${action}`);
    setMessage("");
    try {
      if (action === "test") {
        const result = await request(`/api/sources/${source.id}/test`, { method: "POST" });
        setMessage(result.detail || "连接正常");
      } else if (action === "toggle") {
        await request(`/api/sources/${source.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ enabled: !source.enabled }),
        });
      } else {
        await request(`/api/sources/${source.id}`, { method: "DELETE" });
      }
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "操作失败");
    } finally {
      setBusy(undefined);
    }
  }

  return (
    <section className="page-stack">
      <header className="page-heading">
        <div><span className="eyebrow">SOURCE REGISTRY</span><h2>信息来源</h2></div>
        <span className="page-count">{initialSources.filter((source) => source.enabled).length} / {initialSources.length} 启用</span>
      </header>

      <form className="surface source-add-form" onSubmit={addSource}>
        <label className="field"><span>类型</span><select onChange={(event) => setType(event.target.value as SourceType)} value={type}>{Object.entries(typeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className="field"><span>名称</span><input maxLength={80} name="name" placeholder="例如：AI 行业资讯" required /></label>
        <label className="field source-locator"><span>{type === "x-account" ? "X 账号" : "HTTPS 地址"}</span><input name="locator" placeholder={type === "x-account" ? "@username" : "https://example.com/feed.xml"} required type="text" /></label>
        <button className="primary-action compact-action" disabled={busy === "add"} type="submit">{busy === "add" ? "正在添加…" : "添加来源"}</button>
        {type === "json" ? <details className="mapping-fields"><summary>JSON 字段映射（可选）</summary><div>{[["title", "标题字段"], ["url", "链接字段"], ["summary", "摘要字段"], ["publishedAt", "时间字段"]].map(([key, label]) => <label className="field" key={key}><span>{label}</span><input name={`mapping.${key}`} placeholder={key} /></label>)}</div></details> : null}
      </form>

      <p className="form-status" aria-live="polite">{message}</p>
      <div className="source-list">
        {!initialSources.length ? <div className="surface empty-state">尚无信息来源</div> : initialSources.map((source) => (
          <article className="surface source-row" key={source.id}>
            <i className={`source-health source-health-${source.lastStatus}`} aria-hidden="true" />
            <div className="source-identity"><span>{typeLabels[source.type]}</span><strong>{source.name}</strong><small>{source.type === "x-account" ? `@${source.locator}` : source.locator}</small>{source.lastError ? <em>{source.lastError}</em> : null}</div>
            <div className="source-actions">
              <button disabled={Boolean(busy)} onClick={() => act(source, "test")} type="button">测试</button>
              <button disabled={Boolean(busy)} onClick={() => act(source, "toggle")} type="button">{source.enabled ? "停用" : "启用"}</button>
              <button className="danger-link" disabled={Boolean(busy)} onClick={() => act(source, "delete")} type="button">删除</button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

async function request(url: string, init: RequestInit) {
  const response = await fetch(url, init);
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "操作失败");
  return result;
}
