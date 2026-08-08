"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

interface ConnectionConfig {
  apiKeyConfigured: boolean;
  xApiKeyConfigured: boolean;
  mindId: string | null;
}

export function ConnectionSettings({ initialConfig }: { initialConfig: ConnectionConfig }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    setFailed(false);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);

    try {
      const response = await fetch("/api/config", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          builderApiKey: form.get("builderApiKey"),
          mindId: form.get("mindId"),
          xBearerToken: form.get("xBearerToken"),
          xQuery: form.get("xQuery"),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "连接配置保存失败");
      setMessage(`已连接 ${result.mind.name}`);
      formElement.reset();
      router.refresh();
    } catch (error) {
      setFailed(true);
      setMessage(error instanceof Error ? error.message : "连接配置保存失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="connection-form" onSubmit={save}>
      <div className="profile-heading">
        <h2>接口连接</h2>
        <span>密钥仅保存在本机</span>
      </div>

      <div className="connection-fields">
        <label className="field">
          <span>Mind API Key</span>
          <input
            autoComplete="off"
            name="builderApiKey"
            placeholder={initialConfig.apiKeyConfigured ? "已配置，留空不修改" : "输入 Builder API Key"}
            type="password"
          />
        </label>
        <label className="field">
          <span>Mind ID</span>
          <input
            defaultValue={initialConfig.mindId ?? ""}
            name="mindId"
            placeholder="留空则自动选择账号下第一个 Mind"
          />
        </label>
        <label className="field">
          <span>Twitter / X API Key</span>
          <input
            autoComplete="off"
            name="xBearerToken"
            placeholder={initialConfig.xApiKeyConfigured ? "已配置，留空不修改" : "输入 Bearer Token"}
            type="password"
          />
        </label>
        <label className="field">
          <span>Twitter 搜索词</span>
          <input name="xQuery" placeholder="例如：AI agents lang:zh -is:retweet" />
        </label>
      </div>

      <div className="profile-actions">
        <p className={failed ? "profile-message profile-message-error" : "profile-message"} aria-live="polite">
          {message}
        </p>
        <button className="button button-secondary" disabled={saving} type="submit">
          {saving ? "正在验证…" : "保存并验证 Mind"}
        </button>
      </div>
    </form>
  );
}
