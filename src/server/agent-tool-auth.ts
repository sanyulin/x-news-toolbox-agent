export function authorizeAgentTool(request: Request) {
  if (process.env.NODE_ENV !== "production") return true;
  const secret = process.env.CREATOR_MIND_CRON_SECRET?.trim();
  return Boolean(secret && request.headers.get("authorization") === `Bearer ${secret}`);
}
