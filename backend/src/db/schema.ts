/**
 * app.db schema (better-sqlite3). All statements are idempotent so init() can
 * run on every boot. The per-audit `audit.db` (written by the claude skill) is
 * a SEPARATE database opened read-only elsewhere - never created here.
 */
export const SCHEMA_SQL = /* sql */ `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS projects (
  id                 TEXT PRIMARY KEY,
  title              TEXT NOT NULL,
  name               TEXT NOT NULL UNIQUE,
  description        TEXT,
  source_type        TEXT NOT NULL CHECK (source_type IN ('git','zip')),
  git_url            TEXT,
  git_default_branch TEXT,
  current_ref        TEXT,
  current_commit     TEXT,
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_sessions (
  id                 TEXT PRIMARY KEY,
  project_id         TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title              TEXT NOT NULL,
  session_name       TEXT NOT NULL,            -- 'audit-<ts>' dir; forks share their parent's
  claude_session_id  TEXT,                     -- captured from the stream init event
  description        TEXT,
  parent_session_id  TEXT REFERENCES audit_sessions(id) ON DELETE CASCADE,
  is_fork            INTEGER NOT NULL DEFAULT 0,
  fork_finding_id    TEXT,                      -- for verify forks: the finding this fork targets
  config_json        TEXT NOT NULL DEFAULT '{}',
  status             TEXT NOT NULL DEFAULT 'idle',  -- idle|running|error|done
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_project ON audit_sessions(project_id);
CREATE INDEX IF NOT EXISTS idx_sessions_parent  ON audit_sessions(parent_session_id);

CREATE TABLE IF NOT EXISTS runs (
  id                 TEXT PRIMARY KEY,
  session_id         TEXT NOT NULL REFERENCES audit_sessions(id) ON DELETE CASCADE,
  phase              TEXT,                      -- recon|deploy|audit|fpcheck|verify|report|null
  mode               TEXT,                      -- full|source|null
  custom_prompt      TEXT,
  composed_prompt    TEXT,                      -- the exact prompt sent to claude
  status             TEXT NOT NULL DEFAULT 'queued', -- queued|running|done|error|canceled
  queue_pos          INTEGER NOT NULL,
  pid                INTEGER,
  claude_session_id  TEXT,
  started_at         TEXT,
  ended_at           TEXT,
  exit_code          INTEGER,
  is_error           INTEGER,
  total_cost_usd     REAL,
  usage_json         TEXT,
  event_log_path     TEXT,
  created_at         TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_runs_session_status ON runs(session_id, status);
CREATE INDEX IF NOT EXISTS idx_runs_session_queue  ON runs(session_id, queue_pos);

CREATE TABLE IF NOT EXISTS app_config (
  key        TEXT PRIMARY KEY,
  value      TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS resource_samples (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  ts         TEXT NOT NULL,
  scope      TEXT NOT NULL,        -- 'system' or a container id/name
  cpu        REAL,
  mem        REAL,
  net_in     REAL,
  net_out    REAL,
  disk_read  REAL,
  disk_write REAL
);
CREATE INDEX IF NOT EXISTS idx_samples_ts ON resource_samples(ts);
`;
