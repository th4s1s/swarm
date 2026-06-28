import { db } from '../db/index.js';
import { newId, nowIso } from '../lib/util.js';

export interface SessionRow {
  id: string;
  project_id: string;
  title: string;
  session_name: string;
  claude_session_id: string | null;
  description: string | null;
  parent_session_id: string | null;
  is_fork: number;
  fork_finding_id: string | null;
  config_json: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface NewSession {
  projectId: string;
  title: string;
  sessionName: string;
  description?: string | null;
  parentSessionId?: string | null;
  isFork?: boolean;
  forkFindingId?: string | null;
  configJson?: string;
}

export function insertSession(s: NewSession): SessionRow {
  const id = newId();
  const ts = nowIso();
  db()
    .prepare(
      `INSERT INTO audit_sessions
       (id, project_id, title, session_name, claude_session_id, description,
        parent_session_id, is_fork, fork_finding_id, config_json, status, created_at, updated_at)
       VALUES (@id, @project_id, @title, @session_name, NULL, @description,
        @parent_session_id, @is_fork, @fork_finding_id, @config_json, 'idle', @created_at, @updated_at)`,
    )
    .run({
      id,
      project_id: s.projectId,
      title: s.title,
      session_name: s.sessionName,
      description: s.description ?? null,
      parent_session_id: s.parentSessionId ?? null,
      is_fork: s.isFork ? 1 : 0,
      fork_finding_id: s.forkFindingId ?? null,
      config_json: s.configJson ?? '{}',
      created_at: ts,
      updated_at: ts,
    });
  return getSessionById(id)!;
}

export const getSessionById = (id: string): SessionRow | undefined =>
  db().prepare('SELECT * FROM audit_sessions WHERE id = ?').get(id) as SessionRow | undefined;

export const listChildren = (parentId: string): SessionRow[] =>
  db()
    .prepare('SELECT * FROM audit_sessions WHERE parent_session_id = ? ORDER BY created_at ASC')
    .all(parentId) as SessionRow[];

/** Every session sharing a workspace: the root plus all forks (and forks of forks). */
export const listFamily = (projectId: string, sessionName: string): SessionRow[] =>
  db()
    .prepare(
      'SELECT * FROM audit_sessions WHERE project_id = ? AND session_name = ? ORDER BY created_at ASC',
    )
    .all(projectId, sessionName) as SessionRow[];

export function updateSession(
  id: string,
  fields: Partial<Pick<SessionRow, 'title' | 'description' | 'config_json' | 'status' | 'claude_session_id'>>,
): void {
  const allowed = ['title', 'description', 'config_json', 'status', 'claude_session_id'] as const;
  const sets: string[] = [];
  const params: Record<string, unknown> = { id, updated_at: nowIso() };
  for (const k of allowed) {
    if (k in fields && fields[k] !== undefined) {
      sets.push(`${k} = @${k}`);
      params[k] = fields[k];
    }
  }
  if (sets.length === 0) return;
  db()
    .prepare(`UPDATE audit_sessions SET ${sets.join(', ')}, updated_at = @updated_at WHERE id = @id`)
    .run(params);
}

export const deleteSession = (id: string): void => {
  db().prepare('DELETE FROM audit_sessions WHERE id = ?').run(id);
};
