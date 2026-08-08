import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

import type {
  ContentProposal,
  CreatorProfile,
  CreatorProfileStore,
  DailyFollowUpJob,
  LearningStore,
  LearningUpdate,
  PublicationLink,
  PublicationStore,
  ProposalStore,
  RadarRun,
  SchedulerStore,
  WorkspaceStore,
} from "@/core/creator-desk";

export function createSqliteHealth(databasePath: string) {
  return {
    async check(): Promise<{ ready: boolean; detail?: string }> {
      let database: DatabaseSync | undefined;
      try {
        if (databasePath !== ":memory:") {
          mkdirSync(dirname(databasePath), { recursive: true });
        }

        database = new DatabaseSync(databasePath);
        database.prepare("SELECT 1 AS healthy").get();
        return { ready: true };
      } catch (error) {
        return {
          ready: false,
          detail:
            error instanceof Error ? error.message : "SQLite 健康检查失败",
        };
      } finally {
        database?.close();
      }
    },
  };
}

export function createSqliteWorkspaceStore(
  databasePath: string,
): WorkspaceStore &
  CreatorProfileStore &
  ProposalStore &
  PublicationStore &
  LearningStore &
  SchedulerStore {
  if (databasePath !== ":memory:") {
    mkdirSync(dirname(databasePath), { recursive: true });
  }
  const database = new DatabaseSync(databasePath);
  database.exec(`
    CREATE TABLE IF NOT EXISTS radar_runs (
      operation_id TEXT PRIMARY KEY,
      command_id TEXT NOT NULL UNIQUE,
      generated_at TEXT NOT NULL,
      mode TEXT NOT NULL CHECK (mode = 'demo'),
      focus TEXT,
      signals_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS creator_profile (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      positioning TEXT NOT NULL,
      audience TEXT NOT NULL,
      voice TEXT NOT NULL,
      version INTEGER NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS workspace_commands (
      command_id TEXT PRIMARY KEY,
      operation_id TEXT NOT NULL,
      action TEXT NOT NULL,
      profile_version INTEGER
    );

    CREATE TABLE IF NOT EXISTS proposals (
      operation_id TEXT PRIMARY KEY,
      command_id TEXT NOT NULL UNIQUE,
      generated_at TEXT NOT NULL,
      proposal_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS proposal_reviews (
      command_id TEXT PRIMARY KEY,
      operation_id TEXT NOT NULL,
      proposal_id TEXT NOT NULL,
      decided_at TEXT NOT NULL,
      review_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS publications (
      operation_id TEXT PRIMARY KEY,
      command_id TEXT NOT NULL UNIQUE,
      proposal_id TEXT NOT NULL UNIQUE,
      linked_at TEXT NOT NULL,
      publication_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS learning_updates (
      operation_id TEXT PRIMARY KEY,
      command_id TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      learning_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS learning_actions (
      command_id TEXT PRIMARY KEY,
      operation_id TEXT NOT NULL,
      learning_id TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      result_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS daily_follow_up_job (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      job_json TEXT NOT NULL
    )
  `);

  const read = (row: unknown): RadarRun | undefined => {
    if (!row) return undefined;
    const value = row as Record<string, string | null>;
    const saved = JSON.parse(value.signals_json as string) as
      | RadarRun["signals"]
      | Pick<
          RadarRun,
          | "signals"
          | "trigger"
          | "decisionMode"
          | "mindDecision"
          | "mode"
          | "warnings"
        >;
    const details: Pick<RadarRun, "signals"> &
      Partial<
        Pick<
          RadarRun,
          "trigger" | "decisionMode" | "mindDecision" | "mode" | "warnings"
        >
      > = Array.isArray(saved) ? { signals: saved } : saved;
    return {
      operationId: value.operation_id as string,
      commandId: value.command_id as string,
      generatedAt: value.generated_at as string,
      trigger: details.trigger,
      mode: details.mode ?? "demo",
      decisionMode: details.decisionMode,
      mindDecision: details.mindDecision,
      focus: value.focus ?? undefined,
      signals: details.signals,
      warnings: details.warnings,
    };
  };

  const readCreatorProfile = (row: unknown): CreatorProfile | undefined => {
    if (!row) return undefined;
    const value = row as Record<string, string | number>;
    return {
      positioning: value.positioning as string,
      audience: value.audience as string,
      voice: value.voice as string,
      version: value.version as number,
      updatedAt: value.updated_at as string,
    };
  };

  const readProposal = (row: unknown): ContentProposal | undefined => {
    if (!row) return undefined;
    const value = row as Record<string, string>;
    return JSON.parse(value.proposal_json) as ContentProposal;
  };

  const readPublication = (row: unknown): PublicationLink | undefined => {
    if (!row) return undefined;
    const value = row as Record<string, string>;
    return JSON.parse(value.publication_json) as PublicationLink;
  };

  const readLearning = (row: unknown): LearningUpdate | undefined => {
    if (!row) return undefined;
    const value = row as Record<string, string>;
    return JSON.parse(value.learning_json) as LearningUpdate;
  };

  const readDailyFollowUp = (row: unknown): DailyFollowUpJob | undefined => {
    if (!row) return undefined;
    const value = row as Record<string, string>;
    return JSON.parse(value.job_json) as DailyFollowUpJob;
  };

  return {
    async findRadarRunByCommandId(commandId) {
      return read(
        database
          .prepare("SELECT * FROM radar_runs WHERE command_id = ?")
          .get(commandId),
      );
    },

    async saveRadarRun(run) {
      database
        .prepare(`
          INSERT INTO radar_runs (
            operation_id, command_id, generated_at, mode, focus, signals_json
          ) VALUES (?, ?, ?, ?, ?, ?)
        `)
        .run(
          run.operationId,
          run.commandId,
          run.generatedAt,
          // 旧数据库的 mode 列只允许 demo；真实模式保存在版本化 JSON 中。
          "demo",
          run.focus ?? null,
          JSON.stringify({
            signals: run.signals,
            trigger: run.trigger,
            decisionMode: run.decisionMode,
            mindDecision: run.mindDecision,
            mode: run.mode,
            warnings: run.warnings,
          }),
        );
    },

    async getLatestRadarRun() {
      return read(
        database
          .prepare("SELECT * FROM radar_runs ORDER BY generated_at DESC LIMIT 1")
          .get(),
      );
    },

    async getCreatorProfile() {
      return readCreatorProfile(
        database.prepare("SELECT * FROM creator_profile WHERE id = 1").get(),
      );
    },

    async saveCreatorProfile(input) {
      let inTransaction = false;
      try {
        database.exec("BEGIN IMMEDIATE");
        inTransaction = true;

        const processed = database
          .prepare(
            "SELECT operation_id FROM workspace_commands WHERE command_id = ?",
          )
          .get(input.commandId) as { operation_id: string } | undefined;
        if (processed) {
          const profile = readCreatorProfile(
            database.prepare("SELECT * FROM creator_profile WHERE id = 1").get(),
          );
          if (!profile) throw new Error("重复命令缺少创作者档案");
          database.exec("COMMIT");
          inTransaction = false;
          return {
            operationId: processed.operation_id,
            profile,
            disposition: "duplicate" as const,
          };
        }

        const current = readCreatorProfile(
          database.prepare("SELECT * FROM creator_profile WHERE id = 1").get(),
        );
        if ((current?.version ?? 0) !== input.expectedVersion) {
          throw new Error("创作者档案已被更新，请刷新后重试");
        }

        const nextVersion = input.expectedVersion + 1;
        database
          .prepare(`
            INSERT INTO creator_profile (
              id, positioning, audience, voice, version, updated_at
            ) VALUES (1, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              positioning = excluded.positioning,
              audience = excluded.audience,
              voice = excluded.voice,
              version = excluded.version,
              updated_at = excluded.updated_at
          `)
          .run(
            input.profile.positioning,
            input.profile.audience,
            input.profile.voice,
            nextVersion,
            input.updatedAt,
          );
        database
          .prepare(`
            INSERT INTO workspace_commands (
              command_id, operation_id, action, profile_version
            ) VALUES (?, ?, 'update_profile', ?)
          `)
          .run(input.commandId, input.operationId, nextVersion);

        database.exec("COMMIT");
        inTransaction = false;
        return {
          operationId: input.operationId,
          profile: {
            ...input.profile,
            version: nextVersion,
            updatedAt: input.updatedAt,
          },
          disposition: "accepted" as const,
        };
      } catch (error) {
        if (inTransaction) database.exec("ROLLBACK");
        throw error;
      }
    },

    async findProposalByCommandId(commandId) {
      return readProposal(
        database
          .prepare("SELECT proposal_json FROM proposals WHERE command_id = ?")
          .get(commandId),
      );
    },

    async saveProposal(proposal) {
      database
        .prepare(`
          INSERT INTO proposals (
            operation_id, command_id, generated_at, proposal_json
          ) VALUES (?, ?, ?, ?)
        `)
        .run(
          proposal.operationId,
          proposal.commandId,
          proposal.generatedAt,
          JSON.stringify(proposal),
        );
    },

    async getLatestProposal() {
      return readProposal(
        database
          .prepare(
            "SELECT proposal_json FROM proposals ORDER BY generated_at DESC LIMIT 1",
          )
          .get(),
      );
    },

    async reviewProposal(input) {
      let inTransaction = false;
      try {
        database.exec("BEGIN IMMEDIATE");
        inTransaction = true;

        const processed = database
          .prepare(
            "SELECT operation_id, proposal_id FROM proposal_reviews WHERE command_id = ?",
          )
          .get(input.commandId) as
          | { operation_id: string; proposal_id: string }
          | undefined;
        if (processed) {
          const existing = readProposal(
            database
              .prepare(
                "SELECT proposal_json FROM proposals WHERE operation_id = ?",
              )
              .get(processed.proposal_id),
          );
          if (!existing) throw new Error("重复审核命令缺少内容建议");
          database.exec("COMMIT");
          inTransaction = false;
          return {
            operationId: processed.operation_id,
            proposal: existing,
            disposition: "duplicate" as const,
          };
        }

        const current = readProposal(
          database
            .prepare(
              "SELECT proposal_json FROM proposals WHERE operation_id = ?",
            )
            .get(input.proposalId),
        );
        if (!current) throw new Error("内容建议不存在");
        if (current.version !== input.expectedVersion) {
          throw new Error("内容建议已更新，请刷新后重试");
        }
        if (current.status !== "awaiting_review") {
          throw new Error("当前内容建议不再等待审核");
        }

        const status =
          input.decision === "approve"
            ? "approved_unpublished"
            : input.decision === "request_changes"
              ? "needs_changes"
              : "rejected";
        const proposal: ContentProposal = {
          ...current,
          version: current.version + 1,
          status,
          review: {
            decision: input.decision,
            reason: input.reason,
            decidedAt: input.decidedAt,
            reviewedVersion: input.expectedVersion,
          },
        };
        database
          .prepare(
            "UPDATE proposals SET proposal_json = ? WHERE operation_id = ?",
          )
          .run(JSON.stringify(proposal), input.proposalId);
        database
          .prepare(`
            INSERT INTO proposal_reviews (
              command_id, operation_id, proposal_id, decided_at, review_json
            ) VALUES (?, ?, ?, ?, ?)
          `)
          .run(
            input.commandId,
            input.operationId,
            input.proposalId,
            input.decidedAt,
            JSON.stringify(proposal.review),
          );

        database.exec("COMMIT");
        inTransaction = false;
        return {
          operationId: input.operationId,
          proposal,
          disposition: "accepted" as const,
        };
      } catch (error) {
        if (inTransaction) database.exec("ROLLBACK");
        throw error;
      }
    },

    async linkPublication(input) {
      let inTransaction = false;
      try {
        database.exec("BEGIN IMMEDIATE");
        inTransaction = true;

        const duplicate = readPublication(
          database
            .prepare(
              "SELECT publication_json FROM publications WHERE command_id = ?",
            )
            .get(input.publication.commandId),
        );
        if (duplicate) {
          database.exec("COMMIT");
          inTransaction = false;
          return {
            operationId: duplicate.operationId,
            publication: duplicate,
            disposition: "duplicate" as const,
          };
        }

        const proposal = readProposal(
          database
            .prepare(
              "SELECT proposal_json FROM proposals WHERE operation_id = ?",
            )
            .get(input.publication.proposalId),
        );
        if (!proposal) throw new Error("内容建议不存在");
        if (proposal.version !== input.expectedProposalVersion) {
          throw new Error("内容建议已更新，请刷新后重试");
        }
        if (proposal.status !== "approved_unpublished") {
          throw new Error("只有已批准未发布的内容建议才能关联发布结果");
        }
        if (input.publication.mode === "real" && proposal.synthetic) {
          throw new Error("演示内容不能标记为真实发布结果");
        }

        database
          .prepare(`
            INSERT INTO publications (
              operation_id, command_id, proposal_id, linked_at, publication_json
            ) VALUES (?, ?, ?, ?, ?)
          `)
          .run(
            input.publication.operationId,
            input.publication.commandId,
            input.publication.proposalId,
            input.publication.linkedAt,
            JSON.stringify(input.publication),
          );
        database.exec("COMMIT");
        inTransaction = false;
        return {
          operationId: input.publication.operationId,
          publication: input.publication,
          disposition: "accepted" as const,
        };
      } catch (error) {
        if (inTransaction) database.exec("ROLLBACK");
        throw error;
      }
    },

    async getLatestPublication() {
      return readPublication(
        database
          .prepare(
            "SELECT publication_json FROM publications ORDER BY linked_at DESC LIMIT 1",
          )
          .get(),
      );
    },

    async findLearningByCommandId(commandId) {
      return readLearning(
        database
          .prepare(
            "SELECT learning_json FROM learning_updates WHERE command_id = ?",
          )
          .get(commandId),
      );
    },

    async saveLearning(update) {
      database
        .prepare(`
          INSERT INTO learning_updates (
            operation_id, command_id, created_at, learning_json
          ) VALUES (?, ?, ?, ?)
        `)
        .run(
          update.operationId,
          update.commandId,
          update.createdAt,
          JSON.stringify(update),
        );
    },

    async updateLearning(input) {
      let inTransaction = false;
      try {
        database.exec("BEGIN IMMEDIATE");
        inTransaction = true;

        const previousAction = database
          .prepare(
            "SELECT operation_id, result_json FROM learning_actions WHERE command_id = ?",
          )
          .get(input.commandId) as
          | { operation_id: string; result_json: string }
          | undefined;
        if (previousAction) {
          database.exec("COMMIT");
          inTransaction = false;
          return {
            operationId: previousAction.operation_id,
            update: JSON.parse(previousAction.result_json) as LearningUpdate,
            disposition: "duplicate" as const,
          };
        }

        const current = readLearning(
          database
            .prepare(
              "SELECT learning_json FROM learning_updates WHERE operation_id = ?",
            )
            .get(input.learningId),
        );
        if (!current) {
          throw new Error("找不到这条学习更新");
        }
        if (current.version !== input.expectedVersion) {
          throw new Error("学习更新已变化，请刷新后重试");
        }
        if (current.status === "deleted") {
          throw new Error("这条学习记忆已删除");
        }
        if (input.action === "edit" && !input.memoryText?.trim()) {
          throw new Error("编辑学习记忆时必须提供新内容");
        }

        const updated: LearningUpdate = {
          ...current,
          version: current.version + 1,
          status: input.action === "delete" ? "deleted" : "accepted",
          memoryText:
            input.action === "edit"
              ? input.memoryText!.trim()
              : current.memoryText,
        };
        database
          .prepare(
            "UPDATE learning_updates SET learning_json = ? WHERE operation_id = ?",
          )
          .run(JSON.stringify(updated), current.operationId);
        database
          .prepare(`
            INSERT INTO learning_actions (
              command_id, operation_id, learning_id, updated_at, result_json
            ) VALUES (?, ?, ?, ?, ?)
          `)
          .run(
            input.commandId,
            input.operationId,
            current.operationId,
            input.updatedAt,
            JSON.stringify(updated),
          );
        database.exec("COMMIT");
        inTransaction = false;
        return {
          operationId: input.operationId,
          update: updated,
          disposition: "accepted" as const,
        };
      } catch (error) {
        if (inTransaction) database.exec("ROLLBACK");
        throw error;
      }
    },

    async getLatestLearning() {
      return readLearning(
        database
          .prepare(
            "SELECT learning_json FROM learning_updates ORDER BY created_at DESC LIMIT 1",
          )
          .get(),
      );
    },

    async getDailyFollowUp() {
      return readDailyFollowUp(
        database
          .prepare("SELECT job_json FROM daily_follow_up_job WHERE id = 1")
          .get(),
      );
    },

    async configureDailyFollowUp(input) {
      let inTransaction = false;
      try {
        database.exec("BEGIN IMMEDIATE");
        inTransaction = true;
        const processed = database
          .prepare(
            "SELECT operation_id FROM workspace_commands WHERE command_id = ?",
          )
          .get(input.commandId) as { operation_id: string } | undefined;
        if (processed) {
          const job = readDailyFollowUp(
            database
              .prepare("SELECT job_json FROM daily_follow_up_job WHERE id = 1")
              .get(),
          );
          if (!job) throw new Error("重复命令缺少每日跟进任务");
          database.exec("COMMIT");
          inTransaction = false;
          return {
            operationId: processed.operation_id,
            job,
            disposition: "duplicate" as const,
          };
        }

        const job: DailyFollowUpJob = {
          operationId: input.operationId,
          enabled: input.enabled,
          mode: input.mode,
          runState: "idle",
          nextRunAt: input.enabled ? input.now : undefined,
          updatedAt: input.now,
        };
        database
          .prepare(`
            INSERT INTO daily_follow_up_job (id, job_json) VALUES (1, ?)
            ON CONFLICT(id) DO UPDATE SET job_json = excluded.job_json
          `)
          .run(JSON.stringify(job));
        database
          .prepare(`
            INSERT INTO workspace_commands (
              command_id, operation_id, action, profile_version
            ) VALUES (?, ?, 'configure_daily_follow_up', NULL)
          `)
          .run(input.commandId, input.operationId);
        database.exec("COMMIT");
        inTransaction = false;
        return {
          operationId: input.operationId,
          job,
          disposition: "accepted" as const,
        };
      } catch (error) {
        if (inTransaction) database.exec("ROLLBACK");
        throw error;
      }
    },

    async claimDueDailyFollowUp(input) {
      let inTransaction = false;
      try {
        database.exec("BEGIN IMMEDIATE");
        inTransaction = true;
        const current = readDailyFollowUp(
          database
            .prepare("SELECT job_json FROM daily_follow_up_job WHERE id = 1")
            .get(),
        );
        if (
          !current?.enabled ||
          !current.nextRunAt ||
          current.nextRunAt > input.now ||
          current.runState === "running"
        ) {
          database.exec("COMMIT");
          inTransaction = false;
          return undefined;
        }
        const scheduledFor = current.nextRunAt;
        const job: DailyFollowUpJob = {
          ...current,
          runState: "running",
          lastError: undefined,
          updatedAt: input.now,
        };
        database
          .prepare("UPDATE daily_follow_up_job SET job_json = ? WHERE id = 1")
          .run(JSON.stringify(job));
        database.exec("COMMIT");
        inTransaction = false;
        return { job, scheduledFor };
      } catch (error) {
        if (inTransaction) database.exec("ROLLBACK");
        throw error;
      }
    },

    async completeDailyFollowUp(input) {
      const current = readDailyFollowUp(
        database
          .prepare("SELECT job_json FROM daily_follow_up_job WHERE id = 1")
          .get(),
      );
      if (!current) throw new Error("找不到每日跟进任务");
      const job: DailyFollowUpJob = {
        ...current,
        runState: "idle",
        nextRunAt: input.nextRunAt,
        lastRunAt: input.completedAt,
        lastRadarOperationId: input.radarOperationId,
        lastError: undefined,
        updatedAt: input.completedAt,
      };
      database
        .prepare("UPDATE daily_follow_up_job SET job_json = ? WHERE id = 1")
        .run(JSON.stringify(job));
    },

    async failDailyFollowUp(input) {
      const current = readDailyFollowUp(
        database
          .prepare("SELECT job_json FROM daily_follow_up_job WHERE id = 1")
          .get(),
      );
      if (!current) throw new Error("找不到每日跟进任务");
      const job: DailyFollowUpJob = {
        ...current,
        runState: "failed",
        nextRunAt: input.nextRunAt,
        lastError: input.error,
        updatedAt: input.failedAt,
      };
      database
        .prepare("UPDATE daily_follow_up_job SET job_json = ? WHERE id = 1")
        .run(JSON.stringify(job));
    },
  };
}
