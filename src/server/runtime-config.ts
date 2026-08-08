import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export interface RuntimeConfig {
  builderApiKey?: string;
  mindId?: string;
  xBearerToken?: string;
  xQuery?: string;
  conversationAlias?: string;
  defaultSourceUrl?: string;
}

export interface PublicRuntimeConfig {
  apiKeyConfigured: boolean;
  xApiKeyConfigured: boolean;
  mindId: string | null;
  conversationAlias: string;
  defaultSourceUrl: string | null;
}

export function runtimeConfigPath() {
  return (
    process.env.CREATOR_MIND_RUNTIME_CONFIG_PATH?.trim() ||
    join(process.cwd(), "data", "runtime-config.json")
  );
}

export function loadRuntimeConfig(path = runtimeConfigPath()): RuntimeConfig {
  if (!existsSync(path)) return {};
  try {
    const value = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    return {
      builderApiKey: cleanString(value.builderApiKey),
      mindId: cleanString(value.mindId),
      xBearerToken: cleanString(value.xBearerToken),
      xQuery: cleanString(value.xQuery),
      conversationAlias: cleanString(value.conversationAlias),
      defaultSourceUrl: cleanString(value.defaultSourceUrl),
    };
  } catch {
    return {};
  }
}

export function saveRuntimeConfig(config: RuntimeConfig, path = runtimeConfigPath()) {
  mkdirSync(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  renameSync(temporaryPath, path);
}

export function getEffectiveRuntimeConfig(
  path = runtimeConfigPath(),
  environment: Record<string, string | undefined> = process.env,
): RuntimeConfig {
  const stored = loadRuntimeConfig(path);
  const portable = environment.CREATOR_MIND_PORTABLE === "1";
  return {
    builderApiKey: stored.builderApiKey || (!portable ? cleanString(environment.MINDS_BUILDER_API_KEY) : undefined),
    mindId: stored.mindId || (!portable ? cleanString(environment.MINDS_MIND_ID) : undefined),
    xBearerToken: stored.xBearerToken || (!portable ? cleanString(environment.X_BEARER_TOKEN) : undefined),
    xQuery: stored.xQuery || (!portable ? cleanString(environment.X_SEARCH_QUERY) : undefined),
    conversationAlias:
      stored.conversationAlias ||
      (!portable ? cleanString(environment.MINDS_CONVERSATION_ALIAS) : undefined) ||
      "creator-main",
    defaultSourceUrl:
      stored.defaultSourceUrl || (!portable ? firstEnvironmentSource(environment.CREATOR_MIND_RSS_FEEDS) : undefined),
  };
}

export function toPublicRuntimeConfig(config: RuntimeConfig): PublicRuntimeConfig {
  return {
    apiKeyConfigured: Boolean(config.builderApiKey),
    xApiKeyConfigured: Boolean(config.xBearerToken),
    mindId: config.mindId || null,
    conversationAlias: config.conversationAlias || "creator-main",
    defaultSourceUrl: config.defaultSourceUrl || null,
  };
}

export function getPublicRuntimeConfig(
  path = runtimeConfigPath(),
  environment: Record<string, string | undefined> = process.env,
) {
  return toPublicRuntimeConfig(getEffectiveRuntimeConfig(path, environment));
}

function cleanString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function firstEnvironmentSource(value?: string) {
  const url = value?.split(",")[0]?.split("|")[1]?.trim();
  if (!url) return undefined;
  try {
    return new URL(url).protocol === "https:" ? url : undefined;
  } catch {
    return undefined;
  }
}
