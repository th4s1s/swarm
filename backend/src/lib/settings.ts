import { db } from '../db/index.js';
import { nowIso } from './util.js';

/** Read a runtime-overridable setting from app_config (null if unset). */
export function getSetting(key: string): string | null {
  const row = db().prepare('SELECT value FROM app_config WHERE key = ?').get(key) as
    | { value: string | null }
    | undefined;
  return row ? row.value : null;
}

export function setSetting(key: string, value: string | null): void {
  db()
    .prepare(
      `INSERT INTO app_config (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    )
    .run(key, value, nowIso());
}

export function getAllSettings(): Record<string, string | null> {
  const rows = db().prepare('SELECT key, value FROM app_config').all() as {
    key: string;
    value: string | null;
  }[];
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

/** Effective value: app_config override if present, else the env-derived default. */
export function effective(key: string, fallback: string): string {
  const v = getSetting(key);
  return v === null || v === '' ? fallback : v;
}
