import { createMindsMindAuthority } from "@/adapters/minds-mind-authority";
import { createRecordedMindAuthority } from "@/adapters/recorded-mind-authority";
import { createConfiguredSignalSource } from "@/adapters/live-signal-source";
import {
  createSqliteHealth,
  createSqliteWorkspaceStore,
} from "@/adapters/sqlite-health";
import { createCreatorDesk } from "@/core/creator-desk";
import type { SignalSource } from "@/core/creator-desk";
import { getEffectiveRuntimeConfig, sourceCredentialHeaders } from "@/server/runtime-config";
import { createRadarSignalSource } from "@/server/radar-signal-source";
import { createWorkspaceDataStore, resolveDatabasePath, type SourceRecord } from "@/server/workspace-data";

export { resolveDatabasePath } from "@/server/workspace-data";

const databasePath = resolveDatabasePath(process.env.CREATOR_MIND_DATABASE_PATH);
const workspaceStore = createSqliteWorkspaceStore(databasePath);

const demoSignalSource = {
  async collect({ focus, asOf }: { focus?: string; asOf: string }) {
    const topic = focus?.trim() || "AI 与商业增长";
    return [
      {
        id: "demo-agent-economy",
        title: `${topic}：企业开始从试验转向结果核算`,
        summary:
          "值得关注的不是又一个工具发布，而是团队开始用收入、成本和交付周期衡量 Agent。",
        sourceName: "演示行业观察",
        sourceUrl: "https://example.com/demo/agent-economy",
        canonicalUrl: "https://example.com/demo/agent-economy",
        publishedAt: asOf,
        relevanceScore: 0.94,
        synthetic: true,
      },
      {
        id: "demo-creator-trust",
        title: "专业创作者的竞争正在从产量转向可信度",
        summary:
          "内容变多之后，展示来源、承认未知和持续表达同一领域判断，可能比追逐所有热点更有价值。",
        sourceName: "演示创作者通讯",
        sourceUrl: "https://example.com/demo/creator-trust",
        canonicalUrl: "https://example.com/demo/creator-trust",
        publishedAt: asOf,
        relevanceScore: 0.88,
        synthetic: true,
      },
      {
        id: "demo-bilingual-voice",
        title: "双语内容不应只是逐句翻译",
        summary:
          "同一事实在中文与英文语境中需要不同的开场、例子和节奏，但核心主张必须一致。",
        sourceName: "演示内容实验室",
        sourceUrl: "https://example.com/demo/bilingual-voice",
        canonicalUrl: "https://example.com/demo/bilingual-voice",
        publishedAt: asOf,
        relevanceScore: 0.81,
        synthetic: true,
      },
      {
        id: "demo-unverified-growth",
        title: "未经交叉核验的 AI 产品增长传闻",
        summary: "单一演示来源声称某款 AI 产品在短期内快速增长",
        sourceName: "演示传闻来源",
        sourceUrl: "https://example.com/demo/unverified-growth",
        canonicalUrl: "https://example.com/demo/unverified-growth",
        publishedAt: asOf,
        relevanceScore: 0.68,
        synthetic: true,
        evidenceStatus: "unknown" as const,
      },
    ];
  },
};

export function createAppMindAuthority() {
  const runtimeConfig = getEffectiveRuntimeConfig();
  return createMindsMindAuthority({
    builderApiKey: runtimeConfig.builderApiKey,
    preferredMindId: runtimeConfig.mindId,
    conversationAlias: runtimeConfig.conversationAlias,
  });
}

export function createAppDesk({ sourceUrl, sources, signalSource }: { sourceUrl?: string; sources?: SourceRecord[]; signalSource?: SignalSource } = {}) {
  const runtimeConfig = getEffectiveRuntimeConfig();
  const xBearerToken = runtimeConfig.xBearerToken;
  const dataStore = createWorkspaceDataStore(databasePath);
  dataStore.ensureDefaultSource(runtimeConfig.defaultSourceUrl);
  const selectedSources = sources ?? dataStore.getSources();
  const configuredSources = selectedSources.length
    ? selectedSources
        .filter((source) => source.type !== "x-account")
        .map((source) => ({
          name: source.name,
          url: source.locator,
          mapping: source.mapping,
          headers: sourceCredentialHeaders(runtimeConfig, source.id),
        }))
    : parseRssFeeds(process.env.CREATOR_MIND_RSS_FEEDS);
  const activeRssFeeds = sourceUrl
    ? [{ name: new URL(sourceUrl).hostname, url: sourceUrl }]
    : configuredSources;
  const xAccounts = selectedSources
    .filter((source) => source.type === "x-account")
    .map((source) => source.locator);
  const activeStyle = dataStore.getActiveStyleProfile();
  const profileStore = activeStyle
    ? {
        async getCreatorProfile() {
          const profile = await workspaceStore.getCreatorProfile();
          return {
            positioning: profile?.positioning ?? "聚焦科技、AI 与商业的可信内容",
            audience: profile?.audience ?? "希望快速理解行业变化的创作者与专业读者",
            voice: [
              activeStyle.intensity === "light" ? "轻度参考" : "中等参考",
              activeStyle.features.summary,
              `节奏：${activeStyle.features.sentenceRhythm}`,
              `结构：${activeStyle.features.argumentStructure}`,
              `禁止：${activeStyle.features.avoid.join("；")}；不得复制参考账号独特原句或冒充本人`,
            ].join("。 "),
            version: profile?.version ?? 0,
            updatedAt: activeStyle.activatedAt ?? activeStyle.generatedAt,
          };
        },
        saveCreatorProfile: workspaceStore.saveCreatorProfile,
      }
    : workspaceStore;
  return createCreatorDesk({
    database: createSqliteHealth(databasePath),
    mind: createAppMindAuthority(),
    demoMind: createRecordedMindAuthority(),
    workspaceStore,
    profileStore,
    proposalStore: workspaceStore,
    publicationStore: workspaceStore,
    learningStore: workspaceStore,
    schedulerStore: workspaceStore,
    signalSource: signalSource ?? (runtimeConfig.horizon?.enabled
      ? createRadarSignalSource({ sources: selectedSources })
      : createConfiguredSignalSource({
      demoSource: demoSignalSource,
      rssFeeds: activeRssFeeds,
      xBearerToken,
      xQuery: runtimeConfig.xQuery,
      xAccounts,
      fallbackToDemo: false,
      })),
    xConfigured: Boolean(xBearerToken?.trim()),
  });
}

function parseRssFeeds(value?: string) {
  return (value ?? "")
    .split(",")
    .flatMap((entry) => {
      const [name, url] = entry.split("|").map((part) => part.trim());
      if (!name || !url) return [];
      try {
        new URL(url);
        return [{ name, url }];
      } catch {
        return [];
      }
    });
}
