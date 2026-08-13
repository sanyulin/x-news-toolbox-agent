"use client";

import { FormEvent, useState } from "react";

export function CreatorTestForm() {
  const [message, setMessage] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setMessage("保存中…");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/creator-tests", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ participant: form.get("participant"), round: Number(form.get("round")), platform: form.get("platform"), baselineMinutes: Number(form.get("baselineMinutes")), assistedMinutes: Number(form.get("assistedMinutes")), mindRecommendationUseful: form.get("mindRecommendationUseful") === "yes", adopted: form.get("adopted") === "on", modificationReason: form.get("modificationReason") || undefined, platformFit: Number(form.get("platformFit")), memoryImprovement: form.get("memoryImprovement") || undefined }) });
    const result = await response.json();
    if (!response.ok) return setMessage(result.error || "保存失败");
    window.location.reload();
  }
  return <form className="surface creator-test-form" onSubmit={submit}><h3>记录真实创作者测试</h3><label><span>参与者代号</span><input name="participant" required /></label><label><span>轮次</span><select name="round"><option value="1">第一轮</option><option value="2">第二轮</option></select></label><label><span>平台</span><select name="platform"><option value="x">X</option><option value="xiaohongshu">小红书</option></select></label><label><span>原流程耗时（分钟）</span><input min="1" name="baselineMinutes" required type="number" /></label><label><span>使用后耗时（分钟）</span><input min="1" name="assistedMinutes" required type="number" /></label><label><span>Mind 推荐是否有用</span><select name="mindRecommendationUseful"><option value="yes">有用</option><option value="no">无用</option></select></label><label><span>平台适配评分</span><select name="platformFit"><option value="5">5</option><option value="4">4</option><option value="3">3</option><option value="2">2</option><option value="1">1</option></select></label><label className="field-wide"><span>修改原因</span><input name="modificationReason" /></label><label className="field-wide"><span>Mind 记住后改善了什么</span><input name="memoryImprovement" /></label><label className="authorization-check field-wide"><input name="adopted" type="checkbox" /><span>内容已采用或进入发布准备</span></label><button className="button button-primary" type="submit">保存真实记录</button><p>{message}</p></form>;
}
