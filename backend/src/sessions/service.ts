import Database from 'better-sqlite3';
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { db } from '../db/index.js';
import { config } from '../config.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { effective } from '../lib/settings.js';
import { auditTimestamp } from '../lib/util.js';
import {
  appStatePath,
  auditDbPath,
  auditDir,
  consolidatedReportPath,
  resumeNotePath,
} from '../lib/paths.js';
import { readAuditSnapshot, type AuditSnapshot } from '../lib/auditdb.js';
import { getProjectById, type ProjectRow } from '../projects/repo.js';
import {
  deleteSession,
  getSessionById,
  insertSession,
  listChildren,
  updateSession,
  type SessionRow,
} from './repo.js';

export interface SessionConfig {
  mode: string; // full | source
  permissionMode: string; // bypassPermissions | acceptEdits | plan | default
  model: string | null;
  effort: string | null; // low | medium | high | xhigh | max | null (model default)
  workflows: boolean | null; // true = ultracode (Workflow tool / gateless); pair with effort=xhigh
  thinking: boolean | null; // true=on, false=off, null=model/effort default
  thinkingTokens: number | null; // budget when thinking is on (MAX_THINKING_TOKENS)
  [k: string]: unknown;
}

export const DEFAULT_THINKING_TOKENS = 10_000;

function parseBoolNull(v: string): boolean | null {
  if (v === 'true' || v === '1' || v === 'on') return true;
  if (v === 'false' || v === '0' || v === 'off') return false;
  return null;
}

export function defaultConfig(): SessionConfig {
  const thinking = parseBoolNull(effective('default_thinking', config.defaultThinking));
  const tokensRaw = effective('default_thinking_tokens', String(config.defaultThinkingTokens));
  return {
    mode: effective('default_mode', config.defaultMode),
    permissionMode: effective('default_permission_mode', config.defaultPermissionMode),
    model: effective('default_model', config.defaultModel) || null,
    effort: effective('default_effort', config.defaultEffort) || null,
    workflows: parseBoolNull(effective('default_workflows', config.defaultWorkflows)),
    thinking,
    thinkingTokens: Number(tokensRaw) || DEFAULT_THINKING_TOKENS,
  };
}

export function parseConfig(json: string): SessionConfig {
  try {
    return { ...defaultConfig(), ...(JSON.parse(json) as object) };
  } catch {
    return defaultConfig();
  }
}

/** Create the audit workspace (idempotent) and an empty audit.db so reads work pre-run. */
export function ensureWorkspace(projectName: string, sessionName: string): void {
  const dir = auditDir(projectName, sessionName);
  for (const sub of ['files', 'artifacts', 'archived-poc']) {
    mkdirSync(join(dir, sub), { recursive: true });
  }
  mkdirSync(join(dir, '.app', 'runs'), { recursive: true });
  const dbp = auditDbPath(projectName, sessionName);
  if (!existsSync(dbp)) new Database(dbp).close(); // touch -> valid empty sqlite file
}

function mustProject(projectId: string): ProjectRow {
  const p = getProjectById(projectId);
  if (!p) throw notFound('project not found');
  return p;
}

export function mustSession(id: string): SessionRow {
  const s = getSessionById(id);
  if (!s) throw notFound('session not found');
  return s;
}

export function createSession(
  projectId: string,
  input: { title: string; description?: string | null; config?: Partial<SessionConfig> },
): SessionRow {
  const project = mustProject(projectId);
  if (!input.title) throw badRequest('session title is required');
  const sessionName = `audit-${auditTimestamp()}`;
  ensureWorkspace(project.name, sessionName);
  const cfg = { ...defaultConfig(), ...(input.config ?? {}) };
  return insertSession({
    projectId: project.id,
    title: input.title,
    sessionName,
    description: input.description ?? null,
    configJson: JSON.stringify(cfg),
  });
}

/**
 * Fork an existing session: the child shares the parent's workspace/audit.db so
 * findings/groups are identical across the audit session. It differs in its own
 * claude_session_id (minted at first run via --fork-session), its own stream, and
 * its own config. Forks are not shown in project properties (only roots are).
 */
export function forkSession(
  parentId: string,
  input: { title: string; description?: string | null; findingId?: string | null; config?: Partial<SessionConfig> },
): SessionRow {
  const parent = mustSession(parentId);
  if (parent.is_fork) throw badRequest('cannot fork a fork; fork the root session');
  if (!parent.claude_session_id) {
    throw conflict('parent has no claude session yet — run at least one phase before forking');
  }
  if (!input.title) throw badRequest('fork title is required');
  const cfg = { ...parseConfig(parent.config_json), ...(input.config ?? {}) };
  return insertSession({
    projectId: parent.project_id,
    title: input.title,
    sessionName: parent.session_name, // shared workspace
    description: input.description ?? null,
    parentSessionId: parent.id,
    isFork: true,
    forkFindingId: input.findingId ?? null,
    configJson: JSON.stringify(cfg),
  });
}

function readFileOrNull(p: string): string | null {
  return existsSync(p) ? readFileSync(p, 'utf8') : null;
}

function readAppState(projectName: string, sessionName: string): unknown {
  const p = appStatePath(projectName, sessionName);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

interface ActiveRun {
  id: string;
  phase: string | null;
  mode: string | null;
  status: string;
  queue_pos: number;
  started_at: string | null;
}

function activeRuns(sessionId: string): ActiveRun[] {
  return db()
    .prepare(
      `SELECT id, phase, mode, status, queue_pos, started_at FROM runs
       WHERE session_id = ? AND status IN ('queued','running') ORDER BY queue_pos`,
    )
    .all(sessionId) as ActiveRun[];
}

export interface VulnReportFile {
  finding_id: string;
  file: string;
  markdown: string;
}

export interface SessionReport {
  consolidated: string | null;
  reports: VulnReportFile[];
  /** For a fork: the report matching its target finding, if produced. */
  focused: VulnReportFile | null;
}

export function getReport(id: string): SessionReport {
  const s = mustSession(id);
  const project = mustProject(s.project_id);
  const dir = auditDir(project.name, s.session_name);
  const artDir = join(dir, 'artifacts');
  const reports: VulnReportFile[] = [];
  if (existsSync(artDir)) {
    for (const f of readdirSync(artDir)) {
      if (f.endsWith('-vuln-report.md')) {
        reports.push({
          finding_id: f.replace(/-vuln-report\.md$/, ''),
          file: join('artifacts', f),
          markdown: readFileSync(join(artDir, f), 'utf8'),
        });
      }
    }
  }
  const consolidated = readFileOrNull(consolidatedReportPath(project.name, s.session_name));
  let focused: VulnReportFile | null = null;
  if (s.fork_finding_id) {
    // The skill may name the report by the original id (G2-F1) or the final id (F-1).
    const snap = readAuditSnapshot(auditDbPath(project.name, s.session_name));
    const finalId = snap.findings.find((f) => f.id === s.fork_finding_id)?.final_id ?? null;
    focused =
      reports.find((r) => r.finding_id === s.fork_finding_id || (finalId && r.finding_id === finalId)) ?? null;
  }
  return { consolidated, reports, focused };
}

export interface SessionDetail {
  id: string;
  project: { id: string; name: string; title: string };
  title: string;
  session_name: string;
  claude_session_id: string | null;
  description: string | null;
  parent_session_id: string | null;
  is_fork: boolean;
  fork_finding_id: string | null;
  config: SessionConfig;
  status: string;
  created_at: string;
  updated_at: string;
  audit_dir: string;
  resume_note: string | null;
  app_state: unknown;
  audit: AuditSnapshot;
  active_runs: ActiveRun[];
  child_sessions: {
    id: string;
    title: string;
    session_name: string;
    claude_session_id: string | null;
    status: string;
    fork_finding_id: string | null;
  }[];
}

export function getDetail(id: string): SessionDetail {
  const s = mustSession(id);
  const project = mustProject(s.project_id);
  const children = listChildren(s.id).map((c) => ({
    id: c.id,
    title: c.title,
    session_name: c.session_name,
    claude_session_id: c.claude_session_id,
    status: c.status,
    fork_finding_id: c.fork_finding_id,
  }));
  return {
    id: s.id,
    project: { id: project.id, name: project.name, title: project.title },
    title: s.title,
    session_name: s.session_name,
    claude_session_id: s.claude_session_id,
    description: s.description,
    parent_session_id: s.parent_session_id,
    is_fork: Boolean(s.is_fork),
    fork_finding_id: s.fork_finding_id,
    config: parseConfig(s.config_json),
    status: s.status,
    created_at: s.created_at,
    updated_at: s.updated_at,
    audit_dir: auditDir(project.name, s.session_name),
    resume_note: readFileOrNull(resumeNotePath(project.name, s.session_name)),
    app_state: readAppState(project.name, s.session_name),
    audit: readAuditSnapshot(auditDbPath(project.name, s.session_name)),
    active_runs: activeRuns(s.id),
    child_sessions: children,
  };
}

export function getFindings(id: string): AuditSnapshot {
  const s = mustSession(id);
  const project = mustProject(s.project_id);
  return readAuditSnapshot(auditDbPath(project.name, s.session_name));
}

export function updateMeta(
  id: string,
  fields: { title?: string; description?: string | null; config?: Partial<SessionConfig> },
): SessionDetail {
  const s = mustSession(id);
  const patch: Parameters<typeof updateSession>[1] = {};
  if (fields.title !== undefined) patch.title = fields.title;
  if (fields.description !== undefined) patch.description = fields.description;
  if (fields.config !== undefined) {
    patch.config_json = JSON.stringify({ ...parseConfig(s.config_json), ...fields.config });
  }
  updateSession(s.id, patch);
  return getDetail(id);
}

export function remove(id: string): void {
  const s = mustSession(id);
  const running = db()
    .prepare(`SELECT COUNT(*) c FROM runs WHERE session_id = ? AND status = 'running'`)
    .get(s.id) as { c: number };
  if (running.c > 0) throw conflict('cannot delete: a run is still active for this session');
  deleteSession(s.id); // cascades child sessions + runs
}
