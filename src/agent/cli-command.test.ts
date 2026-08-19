import { describe, expect, it, vi } from "vitest";

import type { CreatorDesk } from "@/core/creator-desk";

import { classifyAgentError, executeAgentCommand } from "./cli-command";

function fakeDesk(
  overrides: Partial<Pick<CreatorDesk, "submit" | "inspect">> = {},
): Pick<CreatorDesk, "submit" | "inspect"> {
  return {
    submit: vi.fn(async () => ({
      operationId: "run-1",
      commandId: "command-1",
      disposition: "accepted" as const,
      status: "completed" as const,
    })),
    inspect: vi.fn(async () => ({
      systemStatus: {
        database: { state: "ready" as const, label: "数据库已就绪" as const },
        mind: {
          state: "connected" as const,
          label: "Minds 已连接" as const,
          mindId: "mind-1",
          mindName: "Creator Mind",
        },
        x: { state: "not_configured" as const, label: "X 未连接" as const },
        demo: { state: "ready" as const, label: "演示模式可用" as const },
        scheduler: {
          state: "enabled" as const,
          label: "真实每日跟进已启用",
          mode: "real" as const,
          platform: "xiaohongshu" as const,
          runState: "idle" as const,
        },
      },
      memories: [],
      competitionProof: {
        readyForJudging: false,
        generatedAt: "2026-08-18T02:00:00.000Z",
        selection: { status: "missing" as const, label: "", detail: "" },
        expression: { status: "missing" as const, label: "", detail: "" },
        learning: { status: "missing" as const, label: "", detail: "" },
        autonomy: { status: "missing" as const, label: "", detail: "" },
        memoryCausality: { status: "missing" as const, label: "", detail: "" },
      },
    })),
    ...overrides,
  };
}

describe("独立 Agent CLI", () => {
  it("运行到期任务并输出可审计回执", async () => {
    const desk = fakeDesk();
    const result = await executeAgentCommand(
      ["run-due"],
      desk,
      new Date("2026-08-18T02:00:00.000Z"),
    );

    expect(result.exitCode).toBe(0);
    expect(result.body.outcome).toBe("completed");
    expect(desk.submit).toHaveBeenCalledWith({
      commandId: "cli-poll-2026-08-18T02:00:00.000Z",
      command: { type: "process_due_follow_up" },
    });
  });

  it("没有到期任务时正常退出", async () => {
    const desk = fakeDesk({
      submit: vi.fn(async () => ({
        operationId: "daily-follow-up-idle",
        commandId: "idle",
        disposition: "duplicate" as const,
        status: "completed" as const,
      })),
    });

    const result = await executeAgentCommand(["run-due"], desk);
    expect(result).toMatchObject({ exitCode: 0, body: { ok: true, outcome: "idle" } });
  });

  it("Mind 跳过时在 CLI 输出原因和已筛选数量", async () => {
    const base = await fakeDesk().inspect({ view: "dashboard" });
    const desk = fakeDesk({
      inspect: vi.fn(async () => ({
        ...base,
        systemStatus: {
          ...base.systemStatus,
          scheduler: {
            state: "enabled" as const,
            label: "真实每日跟进已启用",
            mode: "real" as const,
            platform: "xiaohongshu" as const,
            runState: "idle" as const,
            lastOutcome: "skipped" as const,
            lastCandidateCount: 10,
            lastPriorityCount: 3,
            nextRunAt: "2026-08-19T02:00:00.000Z",
            lastPlan: {
              decisionId: "skip-1",
              mindId: "mind-1",
              mindName: "Creator Mind",
              conversationAlias: "creator-main",
              action: "skip" as const,
              focus: "AI 行业热点",
              reason: "五条候选均不适合今天发布。",
              requestedDraftCount: 0,
              usedMemoryIds: [],
              memoryInfluence: "未使用长期记忆。",
              memoryConflicts: [],
            },
          },
        },
      })),
    });

    const result = await executeAgentCommand(["run-due"], desk);
    expect(result.body).toMatchObject({
      outcome: "skipped",
      candidateCount: 10,
      priorityCount: 3,
      message: "Mind 已筛选 10 条候选，保留 3 条优先项，本轮跳过：五条候选均不适合今天发布。",
    });
  });

  it("配置未完成时 validate 返回配置错误", async () => {
    const readyDesk = fakeDesk();
    const readyDashboard = await readyDesk.inspect({ view: "dashboard" });
    const desk = fakeDesk({
      inspect: vi.fn(async () => ({
        ...readyDashboard,
        systemStatus: {
          ...readyDashboard.systemStatus,
          mind: {
            state: "not_configured" as const,
            label: "Minds 未连接" as const,
            guidance: "配置 API Key",
          },
        },
      })),
    });

    const result = await executeAgentCommand(["validate"], desk);
    expect(result).toMatchObject({ exitCode: 2, body: { ok: false, ready: false } });
  });

  it("状态输出不包含 Mind 计划正文", async () => {
    const desk = fakeDesk();
    const result = await executeAgentCommand(["status"], desk);
    const scheduler = (result.body.status as { scheduler: Record<string, unknown> }).scheduler;

    expect(scheduler).not.toHaveProperty("lastPlan");
  });

  it("为配置、临时和安全错误返回稳定退出码", () => {
    expect(classifyAgentError(new Error("API Key 尚未配置")).exitCode).toBe(2);
    expect(classifyAgentError(new Error("Mind 请求超时")).exitCode).toBe(10);
    expect(classifyAgentError(new Error("未知记忆 ID")).exitCode).toBe(20);
  });
});
