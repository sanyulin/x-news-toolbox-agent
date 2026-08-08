import { lookup } from "node:dns/promises";

export function isPublicHttpsUrl(value: string) {
  const url = new URL(value);
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (url.protocol !== "https:" || hostname === "localhost") return false;
  if (hostname.endsWith(".local") || hostname.includes(":")) return false;
  return isPublicNetworkAddress(hostname);
}

export async function resolvesToPublicAddress(value: string) {
  try {
    const addresses = await lookup(new URL(value).hostname, { all: true });
    return (
      addresses.length > 0 &&
      addresses.every(({ address }) => isPublicNetworkAddress(address))
    );
  } catch {
    return false;
  }
}

function isPublicNetworkAddress(address: string) {
  const normalized = address.toLowerCase();
  if (normalized.includes(":")) {
    const mappedIpv4 = normalized.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
    if (mappedIpv4) return isPublicNetworkAddress(mappedIpv4);
    return !(
      normalized === "::" ||
      normalized === "::1" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      /^fe[89ab]/.test(normalized)
    );
  }
  const octets = normalized.split(".").map(Number);
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part))) {
    return true;
  }
  const [first, second] = octets;
  return !(
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19)) ||
    first >= 224
  );
}
