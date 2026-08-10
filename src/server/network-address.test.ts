import { describe, expect, it, vi } from "vitest";

import {
  isPublicNetworkAddress,
  resolvePublicAddresses,
  resolvesToPublicAddress,
} from "./network-address";

describe("public address validation", () => {
  it("通过独立解析器接受真实公网地址", async () => {
    const resolver = vi.fn().mockResolvedValue(["140.82.121.3", "2606:50c0:8000::154"]);

    await expect(
      resolvesToPublicAddress("https://github.com/openai/openai-python/releases.atom", resolver),
    ).resolves.toBe(true);
    expect(resolver).toHaveBeenCalledWith("github.com");
  });

  it("继续拒绝代理 fake-IP、私网和 IPv4-mapped 私网地址", async () => {
    for (const address of ["198.18.0.67", "127.0.0.1", "10.0.0.2", "::ffff:192.168.1.2", "2001:db8::1"]) {
      expect(isPublicNetworkAddress(address)).toBe(false);
    }

    await expect(
      resolvePublicAddresses("https://example.com/feed.xml", async () => ["198.18.0.67"]),
    ).rejects.toThrow("未解析到安全的公网地址");
  });
});
