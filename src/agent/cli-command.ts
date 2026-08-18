import type { CreatorDesk } from "@/core/creator-desk";

export interface AgentCliResult {
  exitCode: number;
  body: Record<string, unknown>;
}

export async function executeAgentCommand(
  args: string[],
  desk: Pick<CreatorDesk, "submit" | "inspect">,
  now = new Date(),
): Promise<AgentCliResult> {
  const command = args[0] ?? "help";

  if (command === "run-due") {
    const receipt = await desk.submit({
      commandId: `cli-poll-${now.toISOString()}`,
      command: { type: "process_due_follow_up" },
    });
    return {
      exitCode: 0,
      body: {
        ok: true,
        command,
        outcome:
          receipt.operationId === "daily-follow-up-idle"
            ? "idle"
            : "completed",
        receipt,
      },
    };
  }

  if (command === "status" || command === "validate") {
    const dashboard = await desk.inspect({ view: "dashboard" });
    const scheduler = dashboard.systemStatus.scheduler;
    const status = {
      database: dashboard.systemStatus.database,
      mind: dashboard.systemStatus.mind,
      scheduler:
        scheduler.state === "enabled"
          ? {
              state: scheduler.state,
              label: scheduler.label,
              mode: scheduler.mode,
              platform: scheduler.platform,
              runState: scheduler.runState,
              nextRunAt: scheduler.nextRunAt,
              lastRunAt: scheduler.lastRunAt,
              lastOutcome: scheduler.lastOutcome,
              lastError: scheduler.lastError,
            }
          : scheduler,
    };
    const ready =
      status.database.state === "ready" &&
      status.mind.state === "connected" &&
      status.scheduler.state === "enabled";
    return {
      exitCode: command === "validate" && !ready ? 2 : 0,
      body: { ok: command === "status" || ready, command, ready, status },
    };
  }

  return {
    exitCode: command === "help" || command === "--help" || command === "-h" ? 0 : 2,
    body: {
      ok: command === "help" || command === "--help" || command === "-h",
      command,
      usage: "x-news-agent <run-due|status|validate>",
      ...(command === "help" || command === "--help" || command === "-h"
        ? {}
        : { error: `未知命令：${command}` }),
    },
  };
}

export function classifyAgentError(error: unknown) {
  const message = error instanceof Error ? error.message : "Agent 运行失败";
  if (/未知记忆|安全校验|数据损坏/.test(message)) return { exitCode: 20, message };
  if (/API Key|密钥|尚未配置|请先连接|配置参数/.test(message)) {
    return { exitCode: 2, message };
  }
  return { exitCode: 10, message };
}
