import { createRssSignalSource, createXAccountSignalSource } from "@/adapters/live-signal-source";
import type { RadarSignal, SignalCollection, SignalSource } from "@/core/creator-desk";
import { collectHorizonSignals, type HorizonStage } from "@/server/horizon-worker";
import { getEffectiveRuntimeConfig, sourceCredentialHeaders } from "@/server/runtime-config";
import type { SourceRecord } from "@/server/workspace-data";

export function createRadarSignalSource({
  sources,
  progress = () => undefined,
}: {
  sources: SourceRecord[];
  progress?: (stage: HorizonStage) => void | Promise<void>;
}): SignalSource {
  return { collect: () => collectRadarSignals(sources, progress) };
}

export async function collectRadarSignals(
  sources: SourceRecord[],
  progress: (stage: HorizonStage) => void | Promise<void> = () => undefined,
): Promise<SignalCollection> {
  const config = getEffectiveRuntimeConfig();
  const batches: SignalCollection[] = [];
  const warnings: string[] = [];

  if (config.horizon?.enabled) {
    const horizonSources = sources.filter((source) => ["rss", "atom", "rsshub"].includes(source.type));
    try {
      batches.push(await collectHorizonSignals({ settings: config.horizon, sources: horizonSources, progress }));
    } catch (error) {
      warnings.push(safeError(error));
    }
  }

  const jsonSources = sources.filter((source) => source.type === "json");
  if (jsonSources.length) {
    try {
      batches.push(await createRssSignalSource({
        feeds: jsonSources.map((source) => ({
          name: source.name,
          url: source.locator,
          mapping: source.mapping,
          headers: sourceCredentialHeaders(config, source.id),
        })),
      }).collect({ asOf: new Date().toISOString(), dataMode: "live_with_demo_fallback" }));
    } catch (error) {
      warnings.push(`JSON 来源读取失败：${safeError(error)}`);
    }
  }

  const xSources = sources.filter((source) => source.type === "x-account");
  if (xSources.length && !config.xBearerToken) warnings.push("X 来源已启用，但尚未配置 X Bearer Token");
  if (config.xBearerToken) {
    for (const source of xSources) {
      try {
        batches.push(await createXAccountSignalSource({
          bearerToken: config.xBearerToken,
          handle: source.locator,
        }).collect({ asOf: new Date().toISOString(), dataMode: "live_with_demo_fallback" }));
      } catch (error) {
        warnings.push(`X 来源「@${source.locator.replace(/^@/, "")}」读取失败：${safeError(error)}`);
      }
    }
  }

  const signals = uniqueSignals(batches.flatMap((batch) => batch.signals)).slice(0, 20);
  warnings.push(...batches.flatMap((batch) => batch.warnings));
  if (!signals.length) throw new Error(warnings.join("；") || "没有读取到真实内容");
  return { signals, mode: "live", warnings };
}

function uniqueSignals(signals: RadarSignal[]) {
  return [...new Map(signals.map((signal) => [signal.canonicalUrl, signal])).values()]
    .sort((left, right) => right.relevanceScore - left.relevanceScore);
}

function safeError(error: unknown) {
  const message = error instanceof Error ? error.message : "未知错误";
  return message
    .replace(/(authorization|api[_-]?key|token)\s*[:=]\s*\S+/gi, "$1=[已隐藏]")
    .replace(/[A-Za-z]:\\[^\r\n]+/g, "[本机路径]")
    .slice(0, 800);
}
