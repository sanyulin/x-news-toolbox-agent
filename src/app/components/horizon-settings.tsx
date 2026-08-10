"use client";

import { FormEvent, useState } from "react";

import type { PublicRuntimeConfig } from "@/server/runtime-config";

const providerLabels = {
  deepseek: "DeepSeek",
  openai: "OpenAI / 兼容接口",
  anthropic: "Anthropic Claude",
  gemini: "Google Gemini",
  doubao: "豆包",
  ali: "阿里云通义",
  minimax: "MiniMax",
  azure: "Azure OpenAI",
  ollama: "本机 Ollama",
} as const;

export function HorizonSettings({ initialConfig, workerReady }: { initialConfig: PublicRuntimeConfig["horizon"]; workerReady: boolean }) {
  const [provider, setProvider] = useState(initialConfig.provider ?? "deepseek");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    setFailed(false);
    const form = new FormData(event.currentTarget);
    try {
      await request("/api/settings/horizon", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          enabled: form.get("enabled") === "on",
          provider,
          apiKey: form.get("apiKey"),
          baseUrl: form.get("baseUrl"),
          azureEndpoint: form.get("azureEndpoint"),
          hours: Number(form.get("hours")),
          threshold: Number(form.get("threshold")),
          hackerNews: form.get("hackerNews") === "on",
          ossInsight: form.get("ossInsight") === "on",
          enrich: form.get("enrich") === "on",
        }),
      });
      if (!workerReady) {
        setMessage("Horizon 配置已保存，Worker 尚未安装");
      } else {
        const result = await request("/api/horizon/validate", { method: "POST" });
        const sources = result.result?.enabledSources?.length ? `：${result.result.enabledSources.join("、")}` : "";
        setMessage(`Horizon 已保存并连接${sources}`);
      }
    } catch (error) {
      setFailed(true);
      setMessage(error instanceof Error ? error.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  return <form className="connection-form" onSubmit={save}>
    <div className="profile-heading"><h2>Horizon 雷达</h2><span className={workerReady ? "state state-ready" : "state"}>{workerReady ? "Worker 已就绪" : "Worker 未安装"}</span></div>
    <div className="connection-fields">
      <label className="field"><span>AI 服务商</span><select name="provider" onChange={(event) => setProvider(event.target.value as typeof provider)} value={provider}>{Object.entries(providerLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      {provider !== "ollama" ? <label className="field"><span>AI API Key</span><input autoComplete="off" name="apiKey" placeholder={initialConfig.apiKeyConfigured ? "已配置，留空不修改" : "输入 API Key"} required={!initialConfig.apiKeyConfigured} type="password" /></label> : null}
    </div>
    <label className="check-field"><input defaultChecked={initialConfig.enabled} name="enabled" type="checkbox" /><span>启用 Horizon 雷达</span></label>
    <details className="advanced-settings">
      <summary>采集设置</summary>
      <div className="connection-fields">
        <label className="field"><span>{provider === "ollama" ? "Ollama 地址" : "Base URL（可选）"}</span><input defaultValue={initialConfig.baseUrl ?? ""} name="baseUrl" placeholder={provider === "ollama" ? "http://localhost:11434/v1" : "留空使用官方地址"} /></label>
        {provider === "azure" ? <label className="field"><span>Azure Endpoint</span><input defaultValue={initialConfig.azureEndpoint ?? ""} name="azureEndpoint" placeholder="https://resource.openai.azure.com" required /></label> : null}
        <label className="field"><span>扫描时间范围（小时）</span><input defaultValue={initialConfig.hours} max={168} min={1} name="hours" type="number" /></label>
        <label className="field"><span>筛选阈值（0–10）</span><input defaultValue={initialConfig.threshold} max={10} min={0} name="threshold" step="0.5" type="number" /></label>
      </div>
      <div className="horizon-options">
        <label><input defaultChecked={initialConfig.hackerNews} name="hackerNews" type="checkbox" />Hacker News</label>
        <label><input defaultChecked={initialConfig.ossInsight} name="ossInsight" type="checkbox" />OSS Insight</label>
        <label><input defaultChecked={initialConfig.enrich} name="enrich" type="checkbox" />补充背景信息</label>
      </div>
    </details>
    <div className="profile-actions">
      <p className={failed ? "profile-message profile-message-error" : "profile-message"} aria-live="polite">{message}</p>
      <button className="button button-secondary" disabled={saving} type="submit">{saving ? "正在保存…" : workerReady ? "保存并验证" : "保存 Horizon"}</button>
    </div>
  </form>;
}

async function request(url: string, init: RequestInit) {
  const response = await fetch(url, init);
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "操作失败");
  return result;
}
