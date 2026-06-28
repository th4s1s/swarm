import { db } from '../db/index.js';
import { newId, nowIso } from '../lib/util.js';

export interface RunRow {
  id: string;
  session_id: string;
  phase: string | null;
  mode: string | null;
  custom_prompt: string | null;
  composed_prompt: string | null;
  status: 'queued' | 'running' | 'done' | 'error' | 'canceled';
  queue_pos: number;
  pid: number | null;
  claude_session_id: string | null;
  started_at: string | null;
  ended_at: string | null;
  exit_code: number | null;
  is_error: number | null;
  total_cost_usd: number | null;
  usage_json: string | null;
  event_log_path: string | null;
  created_at: string;
}

export interface NewRun {
  id?: string;
  sessionId: string;
  phase: string | null;
  mode: string | null;
  customPrompt: string | null;
  composedPrompt: string;
  eventLogPath: string;
  queuePos: number;
}

export function insertRun(r: NewRun): RunRow {
  const id = r.id ?? newId();
  db()
    .prepare(
      `INSERT INTO runs (id, session_id, phase, mode, custom_prompt, composed_prompt, status, queue_pos, event_log_path, created_at)
       VALUES (@id, @session_id, @phase, @mode, @custom_prompt, @composed_prompt, 'queued', @queue_pos, @event_log_path, @created_at)`,
    )
    .run({
      id,
      session_id: r.sessionId,
      phase: r.phase,
      mode: r.mode,
      custom_prompt: r.customPrompt,
      composed_prompt: r.composedPrompt,
      queue_pos: r.queuePos,
      event_log_path: r.eventLogPath,
      created_at: nowIso(),
    });
  return getRunById(id)!;
}

export const getRunById = (id: string): RunRow | undefined =>
  db().prepare('SELECT * FROM runs WHERE id = ?').get(id) as RunRow | undefined;

export const listBySession = (sessionId: string): RunRow[] =>
  db().prepare('SELECT * FROM runs WHERE session_id = ? ORDER BY queue_pos, created_at').all(sessionId) as RunRow[];

export const nextQueuedForSession = (sessionId: string): RunRow | undefined =>
  db()
    .prepare(`SELECT * FROM runs WHERE session_id = ? AND status = 'queued' ORDER BY queue_pos LIMIT 1`)
    .get(sessionId) as RunRow | undefined;

export const countRunningForSession = (sessionId: string): number =>
  (db().prepare(`SELECT COUNT(*) c FROM runs WHERE session_id = ? AND status = 'running'`).get(sessionId) as { c: number }).c;

export const countRunningGlobal = (): number =>
  (db().prepare(`SELECT COUNT(*) c FROM runs WHERE status = 'running'`).get() as { c: number }).c;

export const sessionsWithQueued = (): string[] =>
  (db().prepare(`SELECT DISTINCT session_id FROM runs WHERE status = 'queued'`).all() as { session_id: string }[]).map(
    (r) => r.session_id,
  );

export function maxQueuePos(sessionId: string): number {
  const r = db().prepare('SELECT MAX(queue_pos) m FROM runs WHERE session_id = ?').get(sessionId) as { m: number | null };
  return r.m ?? 0;
}

export function minQueuedPos(sessionId: string): number | null {
  const r = db()
    .prepare(`SELECT MIN(queue_pos) m FROM runs WHERE session_id = ? AND status = 'queued'`)
    .get(sessionId) as { m: number | null };
  return r.m;
}

export function updateRun(
  id: string,
  fields: Partial<
    Pick<
      RunRow,
      | 'status'
      | 'pid'
      | 'claude_session_id'
      | 'started_at'
      | 'ended_at'
      | 'exit_code'
      | 'is_error'
      | 'total_cost_usd'
      | 'usage_json'
    >
  >,
): void {
  const keys = Object.keys(fields);
  if (keys.length === 0) return;
  const sets = keys.map((k) => `${k} = @${k}`).join(', ');
  db().prepare(`UPDATE runs SET ${sets} WHERE id = @id`).run({ ...fields, id });
}

/** Mark any 'running' runs as 'error' (called on boot to reconcile orphans). */
export function reconcileOrphans(): number {
  const res = db()
    .prepare(`UPDATE runs SET status = 'error', is_error = 1, ended_at = ? WHERE status = 'running'`)
    .run(nowIso());
  return res.changes;
}

export function deleteQueuedRun(id: string): boolean {
  const res = db().prepare(`DELETE FROM runs WHERE id = ? AND status = 'queued'`).run(id);
  return res.changes > 0;
}

export { newId };
