import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

export type SourceType = "rss" | "atom" | "json" | "rsshub" | "x-account";
export type SourceStatus = "unchecked" | "ready" | "error";

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

export function resolveDatabasePath(value?: string, cwd = process.cwd()) {
  return value?.trim() || join(cwd, "data", "creator-mind.sqlite");
}

export function createWorkspaceDataStore(
  databasePath = resolveDatabasePath(process.env.CREATOR_MIND_DATABASE_PATH),
) {
  return {
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
          .prepare("SELECT * FROM style_profiles WHERE status = 'active' ORDER BY activated_at DESC LIMIT 1")
          .get();
        return row ? readStyleProfile(row) : undefined;
      });
    },
  };
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
