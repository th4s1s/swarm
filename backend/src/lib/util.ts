import { randomUUID } from 'node:crypto';

export const newId = (): string => randomUUID();

export const nowIso = (): string => new Date().toISOString();

/** UTC timestamp matching the skill's `date -u +%Y%m%d-%H%M%S` format. */
export function auditTimestamp(d: Date = new Date()): string {
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return (
    `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}` +
    `-${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`
  );
}
