"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import type { CreatorProfile } from "@/core/creator-desk";

type EditableProfile = Pick<
  CreatorProfile,
  "positioning" | "audience" | "voice" | "boundaries"
>;

const emptyProfile: EditableProfile = {
  positioning: "",
  audience: "",
  voice: "",
  boundaries: "不伪造事实，不冒充亲身体验，不推断敏感属性，不自动发布",
};

export function CreatorProfileForm({
  initialProfile,
}: {
  initialProfile?: CreatorProfile;
}) {
  const router = useRouter();
  const [profile, setProfile] = useState<EditableProfile>(
    initialProfile ?? emptyProfile,
  );
  const [version, setVersion] = useState(initialProfile?.version ?? 0);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);

  function update(field: keyof EditableProfile, value: string) {
    setProfile((current) => ({ ...current, [field]: value }));
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    setFailed(false);
    try {
      const response = await fetch("/api/profile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          commandId: crypto.randomUUID(),
          expectedVersion: version,
          ...profile,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "创作者档案保存失败");
      setVersion(result.receipt.profile.version);
      setMessage("已保存");
      router.refresh();
    } catch (error) {
      setFailed(true);
      setMessage(error instanceof Error ? error.message : "创作者档案保存失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="profile-form" onSubmit={save}>
      <div className="profile-heading">
        <h2>创作者基线</h2>
        <span>{version ? `版本 ${version}` : "尚未保存"}</span>
      </div>

      <div className="profile-fields">
        <label>
          <span>内容定位</span>
          <textarea
            maxLength={240}
            minLength={4}
            onChange={(event) => update("positioning", event.target.value)}
            placeholder="例如：用普通人能听懂的方式解释 AI 商业化"
            required
            rows={3}
            value={profile.positioning}
          />
        </label>
        <label>
          <span>目标受众</span>
          <textarea
            maxLength={240}
            minLength={4}
            onChange={(event) => update("audience", event.target.value)}
            placeholder="例如：正在寻找 AI 落地方法的创业者和产品负责人"
            required
            rows={3}
            value={profile.audience}
          />
        </label>
        <label>
          <span>表达方式</span>
          <textarea
            maxLength={160}
            minLength={2}
            onChange={(event) => update("voice", event.target.value)}
            placeholder="例如：克制、清楚、证据优先"
            required
            rows={3}
            value={profile.voice}
          />
        </label>
        <label>
          <span>内容禁区</span>
          <textarea
            maxLength={400}
            minLength={2}
            onChange={(event) => update("boundaries", event.target.value)}
            placeholder="例如：不编造数据，不冒充亲身体验，不讨论未核实传闻"
            required
            rows={3}
            value={profile.boundaries ?? ""}
          />
        </label>
      </div>

      <div className="profile-actions">
        <p
          aria-live="polite"
          className={failed ? "profile-message profile-message-error" : "profile-message"}
        >
          {message}
        </p>
        <button className="button button-secondary" disabled={saving} type="submit">
          {saving ? "正在保存…" : "保存设置"}
        </button>
      </div>
    </form>
  );
}
