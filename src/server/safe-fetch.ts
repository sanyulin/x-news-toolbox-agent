import type { LookupFunction } from "node:net";

import { Agent, fetch as undiciFetch } from "undici";

import {
  type AddressResolver,
  resolvePublicAddresses,
} from "@/server/network-address";

type FetchWithDispatcher = (
  input: string | URL | Request,
  init: RequestInit & { dispatcher: Agent },
) => Promise<Response>;

export interface SafeFetchOptions {
  resolver?: AddressResolver;
  requester?: FetchWithDispatcher;
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export async function safeFetch(
  input: string | URL | Request,
  init: RequestInit = {},
  options: SafeFetchOptions = {},
): Promise<Response> {
  const method = (init.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
  if (method !== "GET" && method !== "HEAD") {
    throw new Error("安全来源请求仅支持 GET 或 HEAD");
  }

  const timeoutMs = options.timeoutMs ?? 12_000;
  const maxBytes = options.maxBytes ?? 5 * 1024 * 1024;
  const maxRedirects = options.maxRedirects ?? 3;
  const requester = options.requester ?? (undiciFetch as unknown as FetchWithDispatcher);
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const signal = init.signal
    ? AbortSignal.any([init.signal, timeoutSignal])
    : timeoutSignal;
  let current = new URL(input instanceof Request ? input.url : input);
  let headers = new Headers(init.headers ?? (input instanceof Request ? input.headers : undefined));
  headers.set("accept", headers.get("accept") ?? "application/json, application/atom+xml, application/rss+xml, application/xml, text/xml");
  headers.set("user-agent", headers.get("user-agent") ?? "X-News-Toolbox/0.1");

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
    const addresses = await resolvePublicAddresses(current.toString(), options.resolver);
    const agent = pinnedAgent(current.hostname, addresses, timeoutMs, maxBytes);
    let response: Response;
    try {
      response = await requester(current, {
        ...init,
        body: method === "GET" || method === "HEAD" ? undefined : init.body,
        dispatcher: agent,
        headers,
        method,
        redirect: "manual",
        signal,
      });

      if (REDIRECT_STATUSES.has(response.status)) {
        const location = response.headers.get("location");
        await response.body?.cancel();
        if (!location) throw new Error("来源返回了缺少地址的重定向");
        if (redirectCount === maxRedirects) throw new Error("来源重定向次数过多");
        const next = new URL(location, current);
        if (next.protocol !== "https:") throw new Error("来源重定向不能降级为 HTTP");
        if (next.origin !== current.origin) {
          headers = new Headers(headers);
          for (const name of ["authorization", "cookie", "proxy-authorization", "x-api-key"]) headers.delete(name);
        }
        current = next;
        continue;
      }

      const body = method === "HEAD" ? null : await readBoundedBody(response, maxBytes);
      return new Response(body, {
        headers: response.headers,
        status: response.status,
        statusText: response.statusText,
      });
    } catch (error) {
      if (signal.aborted || (error instanceof Error && ["AbortError", "TimeoutError"].includes(error.name))) {
        throw new Error("来源请求超时");
      }
      throw error;
    } finally {
      await agent.close();
    }
  }

  throw new Error("来源重定向次数过多");
}

function pinnedAgent(hostname: string, addresses: string[], timeoutMs: number, maxBytes: number) {
  let index = 0;
  const lookup: LookupFunction = (requestedHostname, options, callback) => {
    if (requestedHostname.toLowerCase() !== hostname.toLowerCase()) {
      callback(Object.assign(new Error("连接主机与已验证主机不一致"), { code: "ENOTFOUND" }), "", 0);
      return;
    }
    const address = addresses[index++ % addresses.length]!;
    const family = address.includes(":") ? 6 : 4;
    if (options.all) callback(null, [{ address, family }]);
    else callback(null, address, family);
  };
  return new Agent({
    connect: { lookup, timeout: Math.min(timeoutMs, 8_000) },
    bodyTimeout: timeoutMs,
    headersTimeout: timeoutMs,
    maxResponseSize: maxBytes,
  });
}

async function readBoundedBody(response: Response, maxBytes: number) {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await response.body?.cancel();
    throw new Error("来源响应内容过大");
  }
  if (!response.body) return null;

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > maxBytes) {
      await reader.cancel();
      throw new Error("来源响应内容过大");
    }
    chunks.push(value);
  }
  const body = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}
