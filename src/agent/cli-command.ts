import type { CreatorDesk } from "@/core/creator-desk";

export interface AgentCliResult {
  exitCode: number;
  body: Record<string, unknown>;
}

export interface AgentRuntimeChecks {
  horizonConfigured: boolean;
  horizonRuntimeReady: boolean;
  enabledSourceCount: number;
  readySourceCount: number;
}

export async function executeAgentCommand(
  args: string[],
  desk: Pick<CreatorDesk, "submit" | "inspect">,
  now = new Date(),
  runtimeChecks?: AgentRuntimeChecks,
): Promise<AgentCliResult> {
  const command = args[0] ?? "help";

  if (command === "run-due") {
    const receipt = await desk.submit({
      commandId: `cli-poll-${now.toISOString()}`,
      command: { type: "process_due_follow_up" },
    });
    const dashboard = await desk.inspect({ view: "dashboard" });
    const scheduler = dashboard.systemStatus.scheduler;
    const skipped =
      receipt.operationId !== "daily-follow-up-idle" &&
      scheduler.state === "enabled" &&
      scheduler.lastOutcome === "skipped";
    const candidateCount =
      scheduler.state === "enabled" ? scheduler.lastCandidateCount ?? 0 : 0;
    const priorityCount =
      scheduler.state === "enabled" ? scheduler.lastPriorityCount ?? 0 : 0;
    const skipReason =
      scheduler.state === "enabled" ? scheduler.lastPlan?.reason : undefined;
    return {
      exitCode: 0,
      body: {
        ok: true,
        command,
        outcome:
          receipt.operationId === "daily-follow-up-idle"
            ? "idle"
            : skipped
              ? "skipped"
              : "completed",
        ...(skipped
          ? {
              candidateCount,
              priorityCount,
              message: `Mind 已筛选 ${candidateCount} 条候选，保留 ${priorityCount} 条优先项，本轮跳过：${skipReason ?? "没有适合生成文案的内容。"}`,
            }
          : {}),
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
              lastAttemptAt: scheduler.lastAttemptAt,
              lastRunAt: scheduler.lastRunAt,
              lastOutcome: scheduler.lastOutcome,
              lastError: scheduler.lastError,
            }
          : scheduler,
    };
    const blockers = [
      ...(status.database.state === "ready" ? [] : ["数据库未就绪"]),
      ...(status.mind.state === "connected" ? [] : ["核心 Mind 未连接"]),
      ...(dashboard.creatorProfile ? [] : ["创作者档案未配置"]),
      ...(status.scheduler.state === "enabled" ? [] : ["每日自动任务未启用"]),
      ...(status.scheduler.state === "enabled" && status.scheduler.runState === "failed"
        ? [`最近自动任务失败：${status.scheduler.lastError ?? "未知错误"}`]
        : []),
      ...(runtimeChecks && !runtimeChecks.horizonConfigured ? ["Horizon AI 未配置"] : []),
      ...(runtimeChecks && !runtimeChecks.horizonRuntimeReady ? ["Horizon Worker 未安装或版本不匹配"] : []),
      ...(runtimeChecks && runtimeChecks.enabledSourceCount === 0 ? ["没有启用的信息来源"] : []),
      ...(runtimeChecks && runtimeChecks.readySourceCount === 0 ? ["没有通过连接测试的信息来源"] : []),
    ];
    const ready = blockers.length === 0;
    return {
      exitCode: command === "validate" && !ready ? 2 : 0,
      body: { ok: command === "status" || ready, command, ready, blockers, runtimeChecks, status },
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

export function notificationForAgentResult(result: AgentCliResult) {
  if (result.body.command !== "run-due" || result.body.outcome === "idle") return undefined;
  if (result.body.outcome === "skipped") return String(result.body.message ?? "Mind 已完成筛选，本轮没有生成文案。");
  return "自动任务已完成，请打开审核箱查看结果。";
}
