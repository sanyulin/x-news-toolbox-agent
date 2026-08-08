import { TwitterApi } from "twitter-api-v2";

export interface XPostSample {
  id: string;
  text: string;
  createdAt?: string;
  handle: string;
}

export function normalizeXHandle(value: string) {
  return value.trim().replace(/^https?:\/\/(?:www\.)?x\.com\//i, "").replace(/^@/, "").split(/[/?#]/)[0];
}

export async function inspectXAccount(bearerToken: string, rawHandle: string) {
  if (!bearerToken.trim()) throw new Error("请先在接口设置中填写 X Bearer Token");
  const handle = normalizeXHandle(rawHandle);
  if (!/^[A-Za-z0-9_]{1,15}$/.test(handle)) throw new Error("X 账号格式无效");
  try {
    const result = await new TwitterApi(bearerToken).readOnly.v2.userByUsername(handle);
    if (!result.data) throw new Error("X 账号不存在或不可访问");
    return { id: result.data.id, handle: result.data.username, name: result.data.name };
  } catch (error) {
    throw classifyXError(error);
  }
}

export async function readXPosts(
  bearerToken: string,
  rawHandle: string,
  options: { limit?: number; includeReplies?: boolean } = {},
): Promise<XPostSample[]> {
  const account = await inspectXAccount(bearerToken, rawHandle);
  const limit = Math.min(100, Math.max(5, options.limit ?? 100));
  try {
    const paginator = await new TwitterApi(bearerToken).readOnly.v2.userTimeline(account.id, {
      max_results: limit,
      exclude: options.includeReplies ? ["retweets"] : ["retweets", "replies"],
      "tweet.fields": ["created_at", "lang"],
    });
    return paginator.tweets.slice(0, limit).flatMap((post) => {
      const text = post.text?.trim();
      if (!text || /^https?:\/\/\S+$/.test(text) || text.length < 12) return [];
      return [{
        id: post.id,
        text,
        createdAt: post.created_at,
        handle: account.handle,
      }];
    });
  } catch (error) {
    throw classifyXError(error);
  }
}

function classifyXError(error: unknown) {
  const value = error as { code?: number; data?: { title?: string; detail?: string } };
  if (value.code === 401 || value.code === 403) return new Error("X API 权限不足或 Bearer Token 无效");
  if (value.code === 404) return new Error("X 账号不存在或不可访问");
  if (value.code === 429) return new Error("X API 已达到速率限制，请稍后重试");
  const detail = value.data?.detail || value.data?.title;
  return new Error(detail || (error instanceof Error ? error.message : "X API 暂时不可用"));
}
