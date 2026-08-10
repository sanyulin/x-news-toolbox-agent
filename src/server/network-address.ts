import { Resolver } from "node:dns/promises";

import ipaddr from "ipaddr.js";
import { EnvHttpProxyAgent, fetch as undiciFetch } from "undici";

export type AddressResolver = (hostname: string) => Promise<string[]>;

const DEFAULT_DNS_SERVERS = ["1.1.1.1", "8.8.8.8"];

export function isPublicHttpsUrl(value: string) {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      (url.port && url.port !== "443") ||
      hostname === "localhost" ||
      hostname.endsWith(".local")
    ) {
      return false;
    }
    return !ipaddr.isValid(hostname) || isPublicNetworkAddress(hostname);
  } catch {
    return false;
  }
}

export async function resolvesToPublicAddress(
  value: string,
  resolver: AddressResolver = resolveWithTrustedDns,
) {
  try {
    return (await resolvePublicAddresses(value, resolver)).length > 0;
  } catch {
    return false;
  }
}

export async function resolvePublicAddresses(
  value: string,
  resolver: AddressResolver = resolveWithTrustedDns,
) {
  if (!isPublicHttpsUrl(value)) throw new Error("来源必须是公网 HTTPS 地址");
  const hostname = new URL(value).hostname.replace(/^\[|\]$/g, "");
  const addresses = ipaddr.isValid(hostname) ? [hostname] : await resolver(hostname);
  const unique = [...new Set(addresses)];
  if (!unique.length || unique.some((address) => !isPublicNetworkAddress(address))) {
    throw new Error("来源域名未解析到安全的公网地址");
  }
  return unique;
}

export async function resolveWithTrustedDns(hostname: string) {
  const resolver = new Resolver();
  resolver.setServers(
    process.env.SAFE_FETCH_DNS_SERVERS?.split(",").map((value) => value.trim()).filter(Boolean) ??
      DEFAULT_DNS_SERVERS,
  );

  const timer = setTimeout(() => resolver.cancel(), 5_000);
  try {
    const results = await Promise.allSettled([
      resolver.resolve4(hostname),
      resolver.resolve6(hostname),
    ]);
    const addresses = results.flatMap((result) => result.status === "fulfilled" ? result.value : []);
    return addresses.length ? addresses : resolveWithTrustedDoh(hostname);
  } finally {
    clearTimeout(timer);
  }
}

async function resolveWithTrustedDoh(hostname: string) {
  const proxyConfigured = ["HTTPS_PROXY", "HTTP_PROXY", "ALL_PROXY", "https_proxy", "http_proxy", "all_proxy"]
    .some((name) => process.env[name]?.trim());
  const dispatcher = proxyConfigured ? new EnvHttpProxyAgent({ noProxy: "" }) : undefined;
  try {
    const answers = await Promise.all([1, 28].map(async (type) => {
      const endpoint = new URL(process.env.SAFE_FETCH_DOH_URL?.trim() || "https://dns.google/resolve");
      endpoint.search = new URLSearchParams({ name: hostname, type: String(type) }).toString();
      const response = await undiciFetch(endpoint, {
        dispatcher,
        headers: { accept: "application/dns-json" },
        redirect: "error",
        signal: AbortSignal.timeout(5_000),
      });
      if (!response.ok) return [];
      const payload = await response.json() as { Answer?: Array<{ type?: number; data?: string }> };
      return (payload.Answer ?? [])
        .filter((answer) => answer.type === type && typeof answer.data === "string" && ipaddr.isValid(answer.data))
        .map((answer) => answer.data!);
    }));
    return answers.flat();
  } finally {
    await dispatcher?.close();
  }
}

export function isPublicNetworkAddress(address: string) {
  try {
    const parsed = ipaddr.parse(address);
    if (parsed instanceof ipaddr.IPv6 && parsed.isIPv4MappedAddress()) {
      return parsed.toIPv4Address().range() === "unicast";
    }
    return parsed.range() === "unicast";
  } catch {
    return false;
  }
}
