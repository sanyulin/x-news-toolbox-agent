import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export interface RuntimeConfig {
  builderApiKey?: string;
  mindId?: string;
  xBearerToken?: string;
  xQuery?: string;
  conversationAlias?: string;
  defaultSourceUrl?: string;
  sourceCredentials?: Record<string, SourceCredential>;
  horizon?: HorizonRuntimeConfig;
}

export type HorizonProvider =
  | "openai"
  | "deepseek"
  | "anthropic"
  | "gemini"
  | "doubao"
  | "ali"
  | "minimax"
  | "azure"
  | "ollama";

const horizonDefaultModels: Record<HorizonProvider, string> = {
  openai: "gpt-4",
  deepseek: "deepseek-v4-flash",
  anthropic: "claude-3-5-sonnet-20241022",
  gemini: "gemini-1.5-flash",
  doubao: "doubao-pro-32k",
  ali: "qwen-plus",
  minimax: "MiniMax-M3",
  azure: "gpt-4",
  ollama: "llama3.1",
};

export function defaultHorizonModel(provider: HorizonProvider) {
  return horizonDefaultModels[provider];
}

export interface HorizonRuntimeConfig {
  enabled: boolean;
  provider?: HorizonProvider;
  model?: string;
  apiKey?: string;
  baseUrl?: string;
  azureEndpoint?: string;
  hours: number;
  threshold: number;
  hackerNews: boolean;
  ossInsight: boolean;
  enrich: boolean;
}

export interface SourceCredential {
  type: "bearer" | "api-key";
  secret: string;
}

export interface PublicRuntimeConfig {
  apiKeyConfigured: boolean;
  xApiKeyConfigured: boolean;
  mindId: string | null;
  conversationAlias: string;
  defaultSourceUrl: string | null;
  horizon: Omit<HorizonRuntimeConfig, "apiKey"> & { apiKeyConfigured: boolean };
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
      sourceCredentials: readSourceCredentials(value.sourceCredentials),
      horizon: readHorizonConfig(value.horizon),
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
    sourceCredentials: stored.sourceCredentials,
    horizon: stored.horizon,
  };
}

export function toPublicRuntimeConfig(config: RuntimeConfig): PublicRuntimeConfig {
  return {
    apiKeyConfigured: Boolean(config.builderApiKey),
    xApiKeyConfigured: Boolean(config.xBearerToken),
    mindId: config.mindId || null,
    conversationAlias: config.conversationAlias || "creator-main",
    defaultSourceUrl: config.defaultSourceUrl || null,
    horizon: publicHorizonConfig(config.horizon),
  };
}

function publicHorizonConfig(config?: HorizonRuntimeConfig): PublicRuntimeConfig["horizon"] {
  return {
    enabled: config?.enabled ?? false,
    provider: config?.provider,
    model: config?.model,
    baseUrl: config?.baseUrl,
    azureEndpoint: config?.azureEndpoint,
    hours: config?.hours ?? 24,
    threshold: config?.threshold ?? 7,
    hackerNews: config?.hackerNews ?? true,
    ossInsight: config?.ossInsight ?? false,
    enrich: config?.enrich ?? true,
    apiKeyConfigured: Boolean(config?.apiKey),
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

function readSourceCredentials(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const credentials = Object.entries(value).flatMap(([id, item]) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const record = item as Record<string, unknown>;
    const type = record.type;
    const secret = cleanString(record.secret);
    return (type === "bearer" || type === "api-key") && secret
      ? [[id, { type, secret }] as const]
      : [];
  });
  return credentials.length ? Object.fromEntries(credentials) : undefined;
}

function readHorizonConfig(value: unknown): HorizonRuntimeConfig | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const provider = isHorizonProvider(record.provider) ? record.provider : undefined;
  return {
    enabled: record.enabled === true,
    provider,
    model: provider ? defaultHorizonModel(provider) : undefined,
    apiKey: cleanString(record.apiKey),
    baseUrl: cleanString(record.baseUrl),
    azureEndpoint: cleanString(record.azureEndpoint),
    hours: boundedNumber(record.hours, 1, 168, 24),
    threshold: boundedNumber(record.threshold, 0, 10, 7),
    hackerNews: record.hackerNews !== false,
    ossInsight: record.ossInsight === true,
    enrich: record.enrich !== false,
  };
}

function isHorizonProvider(value: unknown): value is HorizonProvider {
  return ["openai", "deepseek", "anthropic", "gemini", "doubao", "ali", "minimax", "azure", "ollama"].includes(String(value));
}

function boundedNumber(value: unknown, minimum: number, maximum: number, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum
    ? value
    : fallback;
}

export function sourceCredentialHeaders(config: RuntimeConfig, sourceId: string): Record<string, string> | undefined {
  const credential = config.sourceCredentials?.[sourceId];
  if (!credential) return undefined;
  return credential.type === "bearer"
    ? { authorization: `Bearer ${credential.secret}` }
    : { "x-api-key": credential.secret };
}
