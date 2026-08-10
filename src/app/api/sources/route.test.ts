import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { resolvesToPublicAddressMock } = vi.hoisted(() => ({
  resolvesToPublicAddressMock: vi.fn(async () => true),
}));

vi.mock("@/server/network-address", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/network-address")>()),
  resolvesToPublicAddress: resolvesToPublicAddressMock,
}));

import { loadRuntimeConfig } from "@/server/runtime-config";
import { createWorkspaceDataStore } from "@/server/workspace-data";
import { POST } from "./route";

const suffix = crypto.randomUUID();
const configPath = join(tmpdir(), `creator-mind-source-config-${suffix}.json`);
const databasePath = join(tmpdir(), `creator-mind-source-data-${suffix}.sqlite`);

describe("POST /api/sources", () => {
  beforeEach(() => {
    process.env.CREATOR_MIND_RUNTIME_CONFIG_PATH = configPath;
    process.env.CREATOR_MIND_DATABASE_PATH = databasePath;
  });

  afterEach(() => {
    delete process.env.CREATOR_MIND_RUNTIME_CONFIG_PATH;
    delete process.env.CREATOR_MIND_DATABASE_PATH;
    if (existsSync(configPath)) rmSync(configPath);
    if (existsSync(databasePath)) rmSync(databasePath);
  });

  it("保存 JSON API 凭证，但不通过来源响应或数据库记录泄露", async () => {
    const response = await POST(new Request("http://localhost/api/sources", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "json",
        name: "受保护 API",
        locator: "https://example.com/api/posts",
        enabled: true,
        authType: "api-key",
        credential: "source-secret",
      }),
    }));

    const body = await response.json() as { source: { id: string } };
    expect(response.status).toBe(201);
    expect(JSON.stringify(body)).not.toContain("source-secret");
    expect(loadRuntimeConfig(configPath).sourceCredentials?.[body.source.id]).toEqual({
      type: "api-key",
      secret: "source-secret",
    });
    expect(JSON.stringify(createWorkspaceDataStore(databasePath).listSources())).not.toContain("source-secret");
  });

  it("X 来源只保存一份全局 Bearer Token，且响应不返回密钥", async () => {
    const response = await POST(new Request("http://localhost/api/sources", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "x-account",
        name: "OpenAI",
        locator: "@openai",
        enabled: true,
        xBearerToken: "x-secret",
      }),
    }));

    expect(response.status).toBe(201);
    expect(JSON.stringify(await response.json())).not.toContain("x-secret");
    expect(loadRuntimeConfig(configPath).xBearerToken).toBe("x-secret");
  });
});
