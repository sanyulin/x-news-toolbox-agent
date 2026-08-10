import { existsSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { createWorkspaceDataStore, type StyleProfileRecord } from "@/server/workspace-data";

const databasePath = join(tmpdir(), `x-news-toolbox-workspace-${process.pid}.sqlite`);

afterEach(() => {
  if (existsSync(databasePath)) unlinkSync(databasePath);
});

describe("workspace data store", () => {
  it("saves, toggles and deletes multiple sources", () => {
    const store = createWorkspaceDataStore(databasePath);
    const first = store.saveSource({ id: "source-1", type: "rss", name: "RSS", locator: "https://example.com/feed.xml", enabled: true, lastStatus: "unchecked" });
    store.saveSource({ id: "source-2", type: "json", name: "API", locator: "https://example.com/api", enabled: true, lastStatus: "unchecked" });

    expect(store.listSources()).toHaveLength(2);
    expect(store.updateSource(first.id, { enabled: false })?.enabled).toBe(false);
    expect(store.getSources()).toHaveLength(1);
    expect(store.deleteSource("source-2")).toBe(true);
  });

  it("keeps one active style profile without storing raw posts", () => {
    const store = createWorkspaceDataStore(databasePath);
    const profile = (id: string, version: number): StyleProfileRecord => ({
      id,
      handles: ["creator"],
      sampleCount: 20,
      postIds: ["post-1"],
      sampleHash: "hash",
      intensity: "medium",
      status: "draft",
      version,
      generatedAt: new Date().toISOString(),
      features: {
        summary: "专业简洁",
        sentenceRhythm: "短句",
        openingPatterns: ["结论先行"],
        argumentStructure: "主张后跟证据",
        evidenceStyle: "引用来源",
        vocabulary: "克制",
        punctuationAndEmoji: "少量标点",
        callsToAction: "开放问题",
        avoid: ["不要复制原句"],
        confidence: "high",
      },
    });
    store.saveStyleProfile(profile("style-1", 1));
    store.saveStyleProfile(profile("style-2", 2));
    store.activateStyleProfile("style-1");
    store.activateStyleProfile("style-2");

    expect(store.getActiveStyleProfile()?.id).toBe("style-2");
    expect(store.listStyleProfiles().filter((item) => item.status === "active")).toHaveLength(1);
    expect(store.listStyleProfiles()[0]).not.toHaveProperty("posts");
  });

  it("persists radar job progress across page refreshes", () => {
    const store = createWorkspaceDataStore(databasePath);
    store.saveRadarJob({
      id: "job-1",
      commandId: "command-1",
      sourceIds: ["source-1"],
      stage: "queued",
      status: "running",
      message: "等待运行",
      createdAt: "2026-08-10T00:00:00.000Z",
      updatedAt: "2026-08-10T00:00:00.000Z",
    });
    store.updateRadarJob("job-1", { stage: "scoring", message: "AI 评分中" });

    expect(createWorkspaceDataStore(databasePath).getLatestRadarJob()).toMatchObject({
      id: "job-1",
      stage: "scoring",
      status: "running",
      message: "AI 评分中",
    });
  });
});
