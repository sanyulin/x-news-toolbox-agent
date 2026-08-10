import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { getDefaultEnvironment, StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

import type { SignalCollection } from "@/core/creator-desk";
import { createHorizonConfig, HORIZON_COMMIT, mapHorizonItems } from "@/server/horizon-contract";
import type { HorizonRuntimeConfig } from "@/server/runtime-config";
import type { SourceRecord } from "@/server/workspace-data";

export type HorizonStage = "validating" | "fetching" | "scoring" | "filtering" | "enriching" | "reading";

export interface HorizonToolClient {
  call(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>>;
  diagnostics(): string[];
  close(): Promise<void>;
}

interface HorizonRuntimeManifest {
  commit: string;
  command: string;
  args?: string[];
  cwd: string;
  horizonPath: string;
}

export async function collectHorizonSignals({
  settings,
  sources,
  client,
  configPath = horizonConfigPath(),
  progress = () => undefined,
}: {
  settings: HorizonRuntimeConfig;
  sources: SourceRecord[];
  client?: HorizonToolClient;
  configPath?: string;
  progress?: (stage: HorizonStage) => void | Promise<void>;
}): Promise<SignalCollection> {
  if (!settings.enabled) throw new Error("Horizon 雷达尚未启用");
  if (settings.provider !== "ollama" && !settings.apiKey) throw new Error("请先配置 Horizon AI API Key");

  saveHorizonConfig(createHorizonConfig(settings, sources), configPath);
  const worker = client ?? await createHorizonMcpClient(settings);
  try {
    await progress("validating");
    const validation = await worker.call("hz_validate_config", {
      config_path: configPath,
      check_env: true,
    });
    const missing = readStringArray(validation.missing_env);
    if (missing.length) throw new Error(`Horizon 缺少运行密钥：${missing.join("、")}`);

    await progress("fetching");
    const fetched = await worker.call("hz_fetch_items", { hours: settings.hours, config_path: configPath });
    const runId = readString(fetched.run_id);
    if (!runId) throw new Error("Horizon 没有返回运行 ID");

    await progress("scoring");
    await worker.call("hz_score_items", { run_id: runId, config_path: configPath });
    await progress("filtering");
    await worker.call("hz_filter_items", {
      run_id: runId,
      threshold: settings.threshold,
      topic_dedup: true,
      config_path: configPath,
    });

    let stage = "filtered";
    if (settings.enrich) {
      await progress("enriching");
      await worker.call("hz_enrich_items", { run_id: runId, source_stage: stage, config_path: configPath });
      stage = "enriched";
    }

    await progress("reading");
    const result = await worker.call("hz_get_run_stage", { run_id: runId, stage, max_items: 20 });
    const signals = mapHorizonItems(Array.isArray(result.items) ? result.items : []);
    if (!signals.length) throw new Error("Horizon 没有筛选出真实内容");
    return {
      mode: "live",
      signals,
      warnings: [...readStringArray(validation.warnings), ...worker.diagnostics()],
    };
  } finally {
    await worker.close();
  }
}

export async function validateHorizonSettings(settings: HorizonRuntimeConfig, sources: SourceRecord[]) {
  saveHorizonConfig(createHorizonConfig(settings, sources), horizonConfigPath());
  const worker = await createHorizonMcpClient(settings);
  try {
    const data = await worker.call("hz_validate_config", { config_path: horizonConfigPath(), check_env: true });
    const missingEnv = readStringArray(data.missing_env);
    if (!missingEnv.length) await probeHorizonAi(settings);
    return {
      missingEnv,
      warnings: [...readStringArray(data.warnings), ...worker.diagnostics()],
      enabledSources: readStringArray(data.enabled_sources),
      ai: isRecord(data.ai) ? {
        provider: readString(data.ai.provider),
        model: readString(data.ai.model),
      } : undefined,
    };
  } finally {
    await worker.close();
  }
}

export function horizonConfigPath() {
  return process.env.HORIZON_CONFIG_PATH?.trim() || join(process.cwd(), "data", "horizon", "config.json");
}

export function horizonRuntimeReady() {
  try {
    readHorizonRuntimeManifest();
    return true;
  } catch {
    return false;
  }
}

export async function createHorizonMcpClient(settings: HorizonRuntimeConfig): Promise<HorizonToolClient> {
  const manifest = readHorizonRuntimeManifest();
  const diagnostics: string[] = [];
  const transport = new StdioClientTransport({
    command: manifest.command,
    args: manifest.args,
    cwd: manifest.cwd,
    env: {
      ...getDefaultEnvironment(),
      HORIZON_PATH: manifest.horizonPath,
      HORIZON_AI_API_KEY: settings.apiKey || "ollama",
      ...(settings.azureEndpoint ? { HORIZON_AZURE_ENDPOINT: settings.azureEndpoint } : {}),
    },
    stderr: "pipe",
  });
  transport.stderr?.on("data", (chunk) => {
    const line = redact(String(chunk));
    if (/(warning|error|failed|429)/i.test(line)) diagnostics.push(line.slice(0, 500));
  });
  const client = new Client({ name: "x-news-toolbox", version: "0.1.0" });
  await client.connect(transport);

  return {
    async call(name, args) {
      const response = await client.callTool(
        { name, arguments: args },
        undefined,
        { timeout: horizonToolTimeout(name), maxTotalTimeout: horizonToolTimeout(name) },
      );
      if (response.isError) throw new Error(readToolError(response.content));
      const payload = readToolPayload(response);
      if (payload.ok === false) {
        const error = isRecord(payload.error) ? payload.error : undefined;
        throw new Error(readString(error?.message) || `Horizon 工具 ${name} 运行失败`);
      }
      return isRecord(payload.data) ? payload.data : payload;
    },
    diagnostics: () => [...new Set(diagnostics)],
    close: () => client.close(),
  };
}

export function horizonToolTimeout(name: string) {
  return name === "hz_score_items" || name === "hz_enrich_items" ? 300_000 : 120_000;
}

export async function probeHorizonAi(
  settings: HorizonRuntimeConfig,
  fetcher: typeof fetch = fetch,
) {
  if (!settings.provider || !settings.model) throw new Error("Horizon AI 配置不完整");
  if (settings.provider !== "ollama" && !settings.apiKey) throw new Error("请先配置 Horizon AI API Key");
  const request = aiProbeRequest(settings);
  const response = await fetcher(request.url, {
    method: "POST",
    headers: request.headers,
    body: JSON.stringify(request.body),
    signal: AbortSignal.timeout(20_000),
  });
  if (response.ok) return;
  const payload = await response.json().catch(() => undefined) as Record<string, unknown> | undefined;
  const remoteError = isRecord(payload?.error) ? readString(payload.error.message) : readString(payload?.message);
  throw new Error(`AI 模型验证失败（HTTP ${response.status}）${remoteError ? `：${redact(remoteError).slice(0, 240)}` : ""}`);
}

function aiProbeRequest(settings: HorizonRuntimeConfig): { url: string; headers: Record<string, string>; body: unknown } {
  const provider = settings.provider!;
  const model = settings.model!;
  const apiKey = settings.apiKey ?? "";
  if (provider === "anthropic") return {
    url: `${(settings.baseUrl || "https://api.anthropic.com").replace(/\/$/, "")}/v1/messages`,
    headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: { model, max_tokens: 1, messages: [{ role: "user", content: "Reply OK" }] },
  };
  if (provider === "gemini") return {
    url: `${(settings.baseUrl || "https://generativelanguage.googleapis.com").replace(/\/$/, "")}/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    headers: { "content-type": "application/json" },
    body: { contents: [{ parts: [{ text: "Reply OK" }] }], generationConfig: { maxOutputTokens: 1 } },
  };
  if (provider === "azure") return {
    url: `${settings.azureEndpoint!.replace(/\/$/, "")}/openai/deployments/${encodeURIComponent(model)}/chat/completions?api-version=2024-10-21`,
    headers: { "content-type": "application/json", "api-key": apiKey },
    body: { messages: [{ role: "user", content: "Reply OK" }], max_tokens: 1 },
  };
  const baseUrl = settings.baseUrl || ({
    openai: "https://api.openai.com/v1",
    deepseek: "https://api.deepseek.com",
    doubao: "https://ark.cn-beijing.volces.com/api/v3",
    ali: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    minimax: "https://api.minimax.io/v1",
    ollama: "http://localhost:11434/v1",
  } as Partial<Record<NonNullable<HorizonRuntimeConfig["provider"]>, string>>)[provider];
  return {
    url: `${baseUrl!.replace(/\/$/, "")}/chat/completions`,
    headers: { "content-type": "application/json", ...(provider === "ollama" ? {} : { authorization: `Bearer ${apiKey}` }) },
    body: { model, messages: [{ role: "user", content: "Reply OK" }], max_tokens: 1 },
  };
}

function saveHorizonConfig(config: unknown, path: string) {
  mkdirSync(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  renameSync(temporaryPath, path);
}

function readHorizonRuntimeManifest(): HorizonRuntimeManifest {
  const candidates = [
    process.env.HORIZON_RUNTIME_MANIFEST?.trim(),
    join(process.cwd(), ".runtime", "horizon.json"),
    join(process.cwd(), "runtime", "horizon", "manifest.json"),
  ].filter(Boolean) as string[];
  const path = candidates.find(existsSync);
  if (!path) throw new Error("Horizon Worker 尚未安装，请先运行构建脚本");
  const raw = JSON.parse(readFileSync(path, "utf8").replace(/^\uFEFF/, "")) as Record<string, unknown>;
  if (raw.commit !== HORIZON_COMMIT) throw new Error("Horizon Worker 版本与已审计版本不一致");
  const base = dirname(path);
  const command = resolveManifestPath(base, raw.command);
  const cwd = resolveManifestPath(base, raw.cwd);
  const horizonPath = resolveManifestPath(base, raw.horizonPath);
  if (!existsSync(command) || !existsSync(cwd) || !existsSync(horizonPath)) throw new Error("Horizon Worker 安装不完整");
  return {
    commit: HORIZON_COMMIT,
    command,
    cwd,
    horizonPath,
    args: Array.isArray(raw.args) ? raw.args.filter((item): item is string => typeof item === "string") : undefined,
  };
}

function resolveManifestPath(base: string, value: unknown) {
  if (typeof value !== "string" || !value.trim()) throw new Error("Horizon Worker manifest 无效");
  return isAbsolute(value) ? value : resolve(base, value);
}

function readToolPayload(response: Record<string, unknown>) {
  if (isRecord(response.structuredContent)) return response.structuredContent;
  const content = Array.isArray(response.content) ? response.content : [];
  for (const item of content) {
    if (!isRecord(item) || item.type !== "text" || typeof item.text !== "string") continue;
    try {
      const parsed = JSON.parse(item.text) as unknown;
      if (isRecord(parsed)) return parsed;
    } catch {
      // Keep looking for a structured result.
    }
  }
  throw new Error("Horizon 返回了无法识别的结果");
}

function readToolError(content: unknown) {
  if (!Array.isArray(content)) return "Horizon Worker 运行失败";
  return content.flatMap((item) => isRecord(item) && typeof item.text === "string" ? [item.text] : []).join("；") || "Horizon Worker 运行失败";
}

function redact(value: string) {
  return value
    .replace(/(authorization|api[_-]?key|token)\s*[:=]\s*\S+/gi, "$1=[已隐藏]")
    .replace(/[A-Za-z]:\\[^\r\n]+/g, "[本机路径]")
    .replace(/\s+/g, " ")
    .trim();
}

function readString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function readStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
