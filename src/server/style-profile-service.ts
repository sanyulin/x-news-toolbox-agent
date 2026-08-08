import { createHash } from "node:crypto";

import { createAppMindAuthority } from "@/server/create-app-desk";
import { getEffectiveRuntimeConfig } from "@/server/runtime-config";
import { createWorkspaceDataStore, type StyleProfileRecord } from "@/server/workspace-data";
import { normalizeXHandle, readXPosts } from "@/server/x-reader";

export async function scanStyleProfile(input: {
  handles: string[];
  sampleLimit: number;
  includeReplies: boolean;
  intensity: "light" | "medium";
}) {
  const handles = [...new Set(input.handles.map(normalizeXHandle).filter(Boolean))];
  if (!handles.length || handles.length > 3) throw new Error("请选择 1 至 3 个 X 账号");
  const bearerToken = getEffectiveRuntimeConfig().xBearerToken;
  if (!bearerToken) throw new Error("请先在接口设置中填写 X Bearer Token");

  const batches = await Promise.all(
    handles.map((handle) =>
      readXPosts(bearerToken, handle, {
        limit: input.sampleLimit,
        includeReplies: input.includeReplies,
      }),
    ),
  );
  const posts = batches.flat();
  if (posts.length < 5) throw new Error("有效样本不足 5 条，无法生成可靠风格档案");

  const features = await createAppMindAuthority().analyzeStyle({
    handles,
    posts: posts.map(({ text, createdAt }) => ({ text, createdAt })),
  });
  const store = createWorkspaceDataStore();
  const version = Math.max(0, ...store.listStyleProfiles().map((profile) => profile.version)) + 1;
  const profile: StyleProfileRecord = {
    id: crypto.randomUUID(),
    handles,
    sampleCount: posts.length,
    postIds: posts.map((post) => post.id),
    sampleHash: createHash("sha256")
      .update(posts.map((post) => `${post.id}:${post.text}`).join("\n"))
      .digest("hex"),
    features,
    intensity: input.intensity,
    status: "draft",
    version,
    generatedAt: new Date().toISOString(),
  };
  return store.saveStyleProfile(profile);
}

export function styleProfileVoice(profile?: StyleProfileRecord) {
  if (!profile) return undefined;
  const strength = profile.intensity === "light" ? "轻度参考" : "中等参考";
  return [
    `${strength} @${profile.handles.join("、@")}`,
    profile.features.summary,
    `节奏：${profile.features.sentenceRhythm}`,
    `结构：${profile.features.argumentStructure}`,
    `证据：${profile.features.evidenceStyle}`,
    `禁止：${profile.features.avoid.join("；")}；不得复制参考账号的独特原句或冒充本人`,
  ].join("。 ");
}
