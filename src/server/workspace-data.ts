import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { CREATOR_AGENT_CONTRACT_VERSION, type AgentGateResult } from "@/core/agent-contract";
import type { PlatformId, RadarSignal } from "@/core/creator-desk";

export type SourceType = "rss" | "atom" | "json" | "rsshub" | "x-account";
export type SourceStatus = "unchecked" | "ready" | "error";

export type RadarJobStage =
  | "queued"
  | "validating"
  | "fetching"
  | "scoring"
  | "filtering"
  | "enriching"
  | "reading"
  | "mind"
  | "completed"
  | "failed";

export type RunStage = "queued" | "collecting" | "ranking" | "researching" | "drafting" | "waiting_review" | "completed" | "failed_retryable" | "failed_terminal";

export interface RunCheckpoint {
  contractVersion?: string;
  stage: RunStage;
  startedAt: string;
  completedAt?: string;
  heartbeatAt: string;
  inputSnapshot?: RadarJobRecord["inputSnapshot"];
  evidenceVersion?: string;
  mindDecisionId?: string;
  usedMemoryIds?: string[];
  executionMode: "live" | "replay" | "demo";
  gateResults?: AgentGateResult[];
  error?: string;
}

export interface RadarJobRecord {
  contractVersion?: string;
  id: string;
  commandId: string;
  sourceIds: string[];
  focus?: string;
  stage: RadarJobStage;
  status: "running" | "completed" | "failed";
  message: string;
  createdAt: string;
  updatedAt: string;
  radarOperationId?: string;
  error?: string;
  retryCount?: number;
  collectedSignals?: RadarSignal[];
  collectionWarnings?: string[];
  runStage?: RunStage;
  inputSnapshot?: { sourceIds: string[]; focus?: string; proposalId?: string; platform?: PlatformId; evidenceVersion?: string; reviewDecision?: "approve" | "request_changes" | "reject" };
  heartbeatAt?: string;
  completedAt?: string;
  mindDecisionId?: string;
  usedMemoryIds?: string[];
  errorType?: "timeout" | "configuration" | "network" | "unknown";
  nextResumeStage?: "collecting" | "ranking" | "drafting";
  executionMode?: "live" | "replay" | "demo";
  proposalId?: string;
  platform?: PlatformId;
  platformMode?: "demo" | "mind";
  evidenceVersion?: string;
  platformDraftId?: string;
  checkpoints?: RunCheckpoint[];
  gateResults?: AgentGateResult[];
}

export interface SourceRecord {
  id: string;
  type: SourceType;
  name: string;
  locator: string;
  enabled: boolean;
  mapping?: Record<string, string>;
  lastStatus: SourceStatus;
  lastCheckedAt?: string;
  lastSuccessAt?: string;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
}

export interface StyleFeatures {
  summary: string;
  sentenceRhythm: string;
  openingPatterns: string[];
  argumentStructure: string;
  evidenceStyle: string;
  vocabulary: string;
  punctuationAndEmoji: string;
  callsToAction: string;
  avoid: string[];
  confidence: "low" | "medium" | "high";
}

export interface StyleProfileRecord {
  id: string;
  handles: string[];
  sampleCount: number;
  postIds: string[];
  sampleHash: string;
  features: StyleFeatures;
  intensity: "light" | "medium";
  status: "draft" | "active";
  version: number;
  generatedAt: string;
  activatedAt?: string;
}

export interface CreatorTestRecord {
  id: string;
  participant: string;
  round: 1 | 2;
  platform: "x" | "xiaohongshu";
  baselineMinutes: number;
  assistedMinutes: number;
  mindRecommendationUseful?: boolean;
  adopted: boolean;
  modificationReason?: string;
  platformFit: 1 | 2 | 3 | 4 | 5;
  memoryImprovement?: string;
  createdAt: string;
}

export function summarizeCreatorTests(records: CreatorTestRecord[]) {
  const participants = new Set(records.map((record) => record.participant));
  const completeParticipants = [...participants].filter((participant) => new Set(records.filter((record) => record.participant === participant).map((record) => record.round)).size === 2).length;
  const reductions = records.map((record) => ((record.baselineMinutes - record.assistedMinutes) / record.baselineMinutes) * 100).sort((a, b) => a - b);
  const middle = Math.floor(reductions.length / 2);
  const medianReduction = reductions.length === 0 ? 0 : reductions.length % 2 ? reductions[middle] : (reductions[middle - 1] + reductions[middle]) / 2;
  return {
    completeParticipants,
    medianReduction,
    recommendationUsefulRate: records.length ? (records.filter((record) => record.mindRecommendationUseful).length / records.length) * 100 : 0,
    adoptionRate: records.length ? (records.filter((record) => record.adopted).length / records.length) * 100 : 0,
    hasMemoryImprovement: records.some((record) => record.round === 2 && Boolean(record.memoryImprovement)),
  };
}

export function resolveDatabasePath(value?: string, cwd = process.cwd()) {
  return value?.trim() || join(cwd, "data", "creator-mind.sqlite");
}

export function createWorkspaceDataStore(
  databasePath = resolveDatabasePath(process.env.CREATOR_MIND_DATABASE_PATH),
) {
  return {
    getRadarJob(id: string): RadarJobRecord | undefined {
      return withDatabase(databasePath, (database) => {
        const row = database.prepare("SELECT job_json FROM radar_jobs WHERE id = ?").get(id) as { job_json: string } | undefined;
        return row ? JSON.parse(row.job_json) as RadarJobRecord : undefined;
      });
    },

    getLatestRadarJob(): RadarJobRecord | undefined {
      return withDatabase(databasePath, (database) => {
        const row = database.prepare("SELECT job_json FROM radar_jobs ORDER BY updated_at DESC, rowid DESC LIMIT 1").get() as { job_json: string } | undefined;
        return row ? JSON.parse(row.job_json) as RadarJobRecord : undefined;
      });
    },

    saveRadarJob(job: RadarJobRecord) {
      withDatabase(databasePath, (database) => {
        database.prepare(`
          INSERT INTO radar_jobs (id, command_id, status, updated_at, job_json)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            status = excluded.status,
            updated_at = excluded.updated_at,
            job_json = excluded.job_json
        `).run(job.id, job.commandId, job.status, job.updatedAt, JSON.stringify(job));
      });
      return job;
    },

    updateRadarJob(id: string, patch: Partial<Omit<RadarJobRecord, "id" | "commandId" | "createdAt">>) {
      const current = this.getRadarJob(id);
      if (!current) return undefined;
      const now = new Date().toISOString();
      const contractVersion = patch.contractVersion ?? current.contractVersion ?? CREATOR_AGENT_CONTRACT_VERSION;
      const gateResults = patch.gateResults
        ? mergeGateResults(current.gateResults ?? [], patch.gateResults)
        : current.gateResults;
      const checkpoints = [...(current.checkpoints ?? [])];
      if (patch.runStage) {
        const last = checkpoints.at(-1);
        if (!last || last.stage !== patch.runStage) {
          if (last && !last.completedAt) checkpoints[checkpoints.length - 1] = { ...last, completedAt: now, heartbeatAt: patch.heartbeatAt ?? now };
          const terminal = patch.runStage === "completed" || patch.runStage === "failed_retryable" || patch.runStage === "failed_terminal";
          checkpoints.push({ contractVersion, stage: patch.runStage, startedAt: now, completedAt: terminal ? patch.completedAt ?? now : undefined, heartbeatAt: patch.heartbeatAt ?? now, inputSnapshot: patch.inputSnapshot ?? current.inputSnapshot, evidenceVersion: patch.evidenceVersion ?? current.evidenceVersion, mindDecisionId: patch.mindDecisionId, usedMemoryIds: patch.usedMemoryIds, executionMode: patch.executionMode ?? current.executionMode ?? "live", gateResults, error: patch.error });
        } else {
          checkpoints[checkpoints.length - 1] = { ...last, contractVersion, completedAt: patch.completedAt ?? last.completedAt, heartbeatAt: patch.heartbeatAt ?? now, inputSnapshot: patch.inputSnapshot ?? last.inputSnapshot, evidenceVersion: patch.evidenceVersion ?? last.evidenceVersion, mindDecisionId: patch.mindDecisionId ?? last.mindDecisionId, usedMemoryIds: patch.usedMemoryIds ?? last.usedMemoryIds, executionMode: patch.executionMode ?? last.executionMode, gateResults, error: patch.error ?? last.error };
        }
      }
      return this.saveRadarJob({ ...current, ...patch, contractVersion, gateResults, checkpoints, updatedAt: now });
    },

    listCreatorTests(): CreatorTestRecord[] {
      return withDatabase(databasePath, (database) => database.prepare("SELECT record_json FROM creator_tests ORDER BY created_at DESC").all().map((row) => JSON.parse((row as { record_json: string }).record_json) as CreatorTestRecord));
    },

    saveCreatorTest(record: CreatorTestRecord) {
      withDatabase(databasePath, (database) => database.prepare("INSERT INTO creator_tests (id, participant, round, created_at, record_json) VALUES (?, ?, ?, ?, ?)").run(record.id, record.participant, record.round, record.createdAt, JSON.stringify(record)));
      return record;
    },

    listSources(): SourceRecord[] {
      return withDatabase(databasePath, (database) =>
        database
          .prepare("SELECT * FROM content_sources ORDER BY created_at ASC")
          .all()
          .map(readSource),
      );
    },

    getSources(ids?: string[]): SourceRecord[] {
      const sources = this.listSources();
      return ids?.length
        ? sources.filter((source) => ids.includes(source.id))
        : sources.filter((source) => source.enabled);
    },

    saveSource(input: Omit<SourceRecord, "createdAt" | "updatedAt">): SourceRecord {
      const now = new Date().toISOString();
      const existing = this.listSources().find((source) => source.id === input.id);
      const source: SourceRecord = {
        ...input,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      withDatabase(databasePath, (database) => {
        database
          .prepare(`
            INSERT INTO content_sources (
              id, type, name, locator, enabled, mapping_json,
              last_status, last_checked_at, last_success_at, last_error,
              created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              type = excluded.type,
              name = excluded.name,
              locator = excluded.locator,
              enabled = excluded.enabled,
              mapping_json = excluded.mapping_json,
              last_status = excluded.last_status,
              last_checked_at = excluded.last_checked_at,
              last_success_at = excluded.last_success_at,
              last_error = excluded.last_error,
              updated_at = excluded.updated_at
          `)
          .run(
            source.id,
            source.type,
            source.name,
            source.locator,
            source.enabled ? 1 : 0,
            source.mapping ? JSON.stringify(source.mapping) : null,
            source.lastStatus,
            source.lastCheckedAt ?? null,
            source.lastSuccessAt ?? null,
            source.lastError ?? null,
            source.createdAt,
            source.updatedAt,
          );
      });
      return source;
    },

    updateSource(
      id: string,
      patch: Partial<Pick<SourceRecord, "name" | "locator" | "enabled" | "mapping" | "lastStatus" | "lastCheckedAt" | "lastSuccessAt" | "lastError">>,
    ) {
      const current = this.listSources().find((source) => source.id === id);
      if (!current) return undefined;
      return this.saveSource({ ...current, ...patch });
    },

    deleteSource(id: string) {
      return withDatabase(databasePath, (database) =>
        database.prepare("DELETE FROM content_sources WHERE id = ?").run(id).changes > 0,
      );
    },

    ensureDefaultSource(url?: string) {
      if (!url || this.listSources().length) return;
      this.saveSource({
        id: crypto.randomUUID(),
        type: "rss",
        name: new URL(url).hostname,
        locator: url,
        enabled: true,
        lastStatus: "unchecked",
      });
    },

    listStyleProfiles(): StyleProfileRecord[] {
      return withDatabase(databasePath, (database) =>
        database
          .prepare("SELECT * FROM style_profiles ORDER BY generated_at DESC")
          .all()
          .map(readStyleProfile),
      );
    },

    saveStyleProfile(profile: StyleProfileRecord) {
      withDatabase(databasePath, (database) => {
        database
          .prepare(`
            INSERT INTO style_profiles (
              id, handles_json, sample_count, post_ids_json, sample_hash,
              features_json, intensity, status, version, generated_at, activated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `)
          .run(
            profile.id,
            JSON.stringify(profile.handles),
            profile.sampleCount,
            JSON.stringify(profile.postIds),
            profile.sampleHash,
            JSON.stringify(profile.features),
            profile.intensity,
            profile.status,
            profile.version,
            profile.generatedAt,
            profile.activatedAt ?? null,
          );
      });
      return profile;
    },

    activateStyleProfile(id: string) {
      return withDatabase(databasePath, (database) => {
        const row = database.prepare("SELECT * FROM style_profiles WHERE id = ?").get(id);
        if (!row) return undefined;
        const now = new Date().toISOString();
        database.exec("BEGIN IMMEDIATE");
        try {
          database.prepare("UPDATE style_profiles SET status = 'draft', activated_at = NULL WHERE status = 'active'").run();
          database
            .prepare("UPDATE style_profiles SET status = 'active', activated_at = ? WHERE id = ?")
            .run(now, id);
          database.exec("COMMIT");
        } catch (error) {
          database.exec("ROLLBACK");
          throw error;
        }
        return readStyleProfile(
          database.prepare("SELECT * FROM style_profiles WHERE id = ?").get(id),
        );
      });
    },

    getActiveStyleProfile() {
      return withDatabase(databasePath, (database) => {
        const row = database
          .prepare("SELECT * FROM style_profiles WHERE status = 'active' ORDER BY activated_at DESC, rowid DESC LIMIT 1")
          .get();
        return row ? readStyleProfile(row) : undefined;
      });
    },
  };
}

function mergeGateResults(current: AgentGateResult[], updates: AgentGateResult[]) {
  const merged = new Map(current.map((result) => [result.gate, result]));
  for (const result of updates) merged.set(result.gate, result);
  return [...merged.values()];
}

function withDatabase<T>(databasePath: string, action: (database: DatabaseSync) => T): T {
  if (databasePath !== ":memory:") mkdirSync(dirname(databasePath), { recursive: true });
  const database = new DatabaseSync(databasePath);
  try {
    database.exec(`
      CREATE TABLE IF NOT EXISTS content_sources (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        name TEXT NOT NULL,
        locator TEXT NOT NULL,
        enabled INTEGER NOT NULL,
        mapping_json TEXT,
        last_status TEXT NOT NULL,
        last_checked_at TEXT,
        last_success_at TEXT,
        last_error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(type, locator)
      );
      CREATE TABLE IF NOT EXISTS style_profiles (
        id TEXT PRIMARY KEY,
        handles_json TEXT NOT NULL,
        sample_count INTEGER NOT NULL,
        post_ids_json TEXT NOT NULL,
        sample_hash TEXT NOT NULL,
        features_json TEXT NOT NULL,
        intensity TEXT NOT NULL,
        status TEXT NOT NULL,
        version INTEGER NOT NULL,
        generated_at TEXT NOT NULL,
        activated_at TEXT
      );
      CREATE TABLE IF NOT EXISTS radar_jobs (
        id TEXT PRIMARY KEY,
        command_id TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        job_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS creator_tests (
        id TEXT PRIMARY KEY,
        participant TEXT NOT NULL,
        round INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        record_json TEXT NOT NULL,
        UNIQUE(participant, round)
      );
    `);
    return action(database);
  } finally {
    database.close();
  }
}

function readSource(row: unknown): SourceRecord {
  const value = row as Record<string, string | number | null>;
  return {
    id: value.id as string,
    type: value.type as SourceType,
    name: value.name as string,
    locator: value.locator as string,
    enabled: Boolean(value.enabled),
    mapping: value.mapping_json
      ? (JSON.parse(value.mapping_json as string) as Record<string, string>)
      : undefined,
    lastStatus: value.last_status as SourceStatus,
    lastCheckedAt: (value.last_checked_at as string | null) ?? undefined,
    lastSuccessAt: (value.last_success_at as string | null) ?? undefined,
    lastError: (value.last_error as string | null) ?? undefined,
    createdAt: value.created_at as string,
    updatedAt: value.updated_at as string,
  };
}

function readStyleProfile(row: unknown): StyleProfileRecord {
  const value = row as Record<string, string | number | null>;
  return {
    id: value.id as string,
    handles: JSON.parse(value.handles_json as string) as string[],
    sampleCount: value.sample_count as number,
    postIds: JSON.parse(value.post_ids_json as string) as string[],
    sampleHash: value.sample_hash as string,
    features: JSON.parse(value.features_json as string) as StyleFeatures,
    intensity: value.intensity as "light" | "medium",
    status: value.status as "draft" | "active",
    version: value.version as number,
    generatedAt: value.generated_at as string,
    activatedAt: (value.activated_at as string | null) ?? undefined,
  };
}
