import { describe, expect, it } from "vitest";

import type { RadarSignal } from "@/core/creator-desk";
import { buildRadarRetryPatch, readRadarCollectionCheckpoint } from "@/server/radar-job-runner";
import type { RadarJobRecord } from "@/server/workspace-data";

const signal: RadarSignal = {
  id: "signal-1",
  title: "真实候选",
  summary: "已完成采集的候选不会因 Mind 超时再次抓取。",
  sourceName: "Source",
  sourceUrl: "https://example.com/item",
  canonicalUrl: "https://example.com/item",
  publishedAt: "2026-08-13T00:00:00.000Z",
  relevanceScore: 8,
  synthetic: false,
};

function failedJob(patch: Partial<RadarJobRecord> = {}): RadarJobRecord {
  return {
    id: "run-1",
    commandId: "command-1",
    sourceIds: ["source-1"],
    stage: "failed",
    status: "failed",
    message: "Mind 超时",
    error: "Request timed out",
    runStage: "failed_retryable",
    createdAt: "2026-08-13T00:00:00.000Z",
    updatedAt: "2026-08-13T00:01:00.000Z",
    ...patch,
  };
}

describe("radar checkpoint recovery", () => {
  it("reuses collected candidates and marks the retry as replay", () => {
    const job = failedJob({ collectedSignals: [signal], collectionWarnings: ["一个次要来源失败"] });

    expect(readRadarCollectionCheckpoint(job)).toEqual({ signals: [signal], mode: "live", warnings: ["一个次要来源失败"] });
    expect(buildRadarRetryPatch(job, "2026-08-13T00:02:00.000Z")).toMatchObject({
      stage: "mind",
      runStage: "ranking",
      executionMode: "replay",
      retryCount: 1,
    });
  });

  it("starts collection again only when no checkpoint exists", () => {
    expect(readRadarCollectionCheckpoint(failedJob())).toBeUndefined();
    expect(buildRadarRetryPatch(failedJob(), "2026-08-13T00:02:00.000Z")).toMatchObject({
      stage: "queued",
      runStage: "collecting",
      executionMode: "live",
    });
  });

  it("resumes a failed platform draft without returning to collection", () => {
    expect(buildRadarRetryPatch(failedJob({
      nextResumeStage: "drafting",
      proposalId: "proposal-1",
      platform: "xiaohongshu",
      platformMode: "mind",
      evidenceVersion: "evidence-v1",
      collectedSignals: [signal],
    }), "2026-08-13T00:02:00.000Z")).toMatchObject({
      stage: "mind",
      runStage: "drafting",
      executionMode: "replay",
      message: "从草稿 checkpoint 继续平台生成",
    });
  });
});
