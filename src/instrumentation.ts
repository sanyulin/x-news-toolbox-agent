export async function register() {
  if (
    process.env.NEXT_RUNTIME === "nodejs" &&
    process.env.CREATOR_MIND_ENABLE_IN_PROCESS_SCHEDULER === "1"
  ) {
    const { startFollowUpWorker } = await import("@/server/follow-up-worker");
    startFollowUpWorker();
  }
}
