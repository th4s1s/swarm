import { join, relative, resolve, isAbsolute } from 'node:path';
import { config } from '../config.js';

/** Project/session names are used for directory creation — keep them dir-safe. */
export const PROJECT_NAME_RE = /^[A-Za-z0-9_-]+$/;

const RESERVED_NAMES = new Set(['.', '..', 'con', 'prn', 'aux', 'nul']);

export class InvalidNameError extends Error {}

export function assertValidProjectName(name: string): void {
  if (typeof name !== 'string' || name.length === 0 || name.length > 100) {
    throw new InvalidNameError('project name must be 1-100 characters');
  }
  if (!PROJECT_NAME_RE.test(name)) {
    throw new InvalidNameError('project name may only contain letters, digits, "-" and "_"');
  }
  if (RESERVED_NAMES.has(name.toLowerCase())) {
    throw new InvalidNameError(`"${name}" is a reserved name`);
  }
}

// --- Project source tree (audited repo) ---
export const projectDir = (name: string): string => join(config.projectsDir, name);

// --- Audit home + per-session workspace (outside the project tree) ---
export const auditHome = (name: string): string => join(config.auditsDir, name);
export const auditDir = (name: string, sessionName: string): string =>
  join(auditHome(name), sessionName);
export const auditDbPath = (name: string, sessionName: string): string =>
  join(auditDir(name, sessionName), 'audit.db');
export const resumeNotePath = (name: string, sessionName: string): string =>
  join(auditDir(name, sessionName), `${name}-audit-resume.md`);
export const liveInstanceNotePath = (name: string): string =>
  join(auditHome(name), `${name}-live-instance.md`);

// --- App-private artifacts inside the audit workspace ---
export const appStatePath = (name: string, sessionName: string): string =>
  join(auditDir(name, sessionName), '.app', 'state.json');
export const runEventLogPath = (name: string, sessionName: string, runId: string): string =>
  join(auditDir(name, sessionName), '.app', 'runs', `${runId}.jsonl`);

// --- Reports produced by the skill ---
export const consolidatedReportPath = (name: string, sessionName: string): string =>
  join(auditDir(name, sessionName), 'report.md');
export const vulnReportPath = (name: string, sessionName: string, findingId: string): string =>
  join(auditDir(name, sessionName), 'artifacts', `${findingId}-vuln-report.md`);

/**
 * True if `child` resolves to a path inside `parent` (or equal to it).
 * Used to defeat zip-slip / path-traversal during extraction.
 */
export function isPathInside(parent: string, child: string): boolean {
  const rel = relative(resolve(parent), resolve(child));
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}
