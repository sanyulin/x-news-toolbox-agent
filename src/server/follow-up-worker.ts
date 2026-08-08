import { createAppDesk } from "@/server/create-app-desk";

let timer: NodeJS.Timeout | undefined;
let polling = false;

export async function processDueFollowUp() {
  if (polling) return;
  polling = true;
  try {
    return await createAppDesk().submit({
      commandId: `worker-poll-${new Date().toISOString()}`,
      command: { type: "process_due_follow_up" },
    });
  } finally {
    polling = false;
  }
}

export function startFollowUpWorker() {
  if (timer || process.env.NODE_ENV === "test") return;
  timer = setInterval(() => {
    void processDueFollowUp().catch(reportWorkerError);
  }, 60_000);
  timer.unref();
}

function reportWorkerError(error: unknown) {
  console.error(
    "每日自主跟进失败：",
    error instanceof Error ? error.message : "未知错误",
  );
}
