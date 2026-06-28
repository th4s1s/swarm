import Database from 'better-sqlite3';
import { existsSync } from 'node:fs';

/**
 * Read-only access to a per-audit `audit.db` written by the vibehack skill.
 * Everything tolerates a missing file or not-yet-created tables (early phases).
 */
export interface AuditGroup {
  id: string;
  name: string;
  description: string | null;
  status: string | null;
}

export interface AuditFinding {
  id: string;
  final_id: string | null;
  group_id: string | null;
  title: string;
  severity: string | null; // final severity if the fpcheck verdict set one, else original
  confidence: number | null;
  cwe: string | null;
  location: string | null;
  verdict: string | null; // TRUE_POSITIVE | FALSE_POSITIVE | DUPLICATE | null
  verified: string | null; // source-only | live-poc | autorev-confirmed
}

export interface AuditSnapshot {
  available: boolean;
  groups: AuditGroup[];
  findings: AuditFinding[];
  counts: { groups: number; findings: number; true_positives: number };
}

function openRo(path: string): Database.Database | null {
  if (!existsSync(path)) return null;
  try {
    return new Database(path, { readonly: true, fileMustExist: true });
  } catch {
    return null;
  }
}

function tableExists(d: Database.Database, name: string): boolean {
  const row = d
    .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name = ?")
    .get(name);
  return Boolean(row);
}

function safeAll<T>(d: Database.Database, table: string, sql: string): T[] {
  if (!tableExists(d, table)) return [];
  try {
    return d.prepare(sql).all() as T[];
  } catch {
    return [];
  }
}

export function readAuditSnapshot(dbPath: string): AuditSnapshot {
  const d = openRo(dbPath);
  if (!d) {
    return { available: false, groups: [], findings: [], counts: { groups: 0, findings: 0, true_positives: 0 } };
  }
  try {
    const groups = safeAll<AuditGroup>(
      d,
      'vh_feature_groups',
      'SELECT id, name, description, status FROM vh_feature_groups ORDER BY id',
    );

    const hasVerdicts = tableExists(d, 'vh_fp_verdicts');
    const findingsSql = hasVerdicts
      ? `SELECT f.id            AS id,
                v.final_id       AS final_id,
                f.group_id       AS group_id,
                f.title          AS title,
                COALESCE(v.final_severity, f.severity) AS severity,
                f.confidence     AS confidence,
                f.cwe            AS cwe,
                f.location       AS location,
                v.verdict        AS verdict,
                f.verified       AS verified
         FROM vh_findings f
         LEFT JOIN vh_fp_verdicts v ON v.finding_id = f.id
         ORDER BY f.group_id, f.id`
      : `SELECT id, NULL AS final_id, group_id, title, severity,
                confidence, cwe, location, NULL AS verdict, verified
         FROM vh_findings ORDER BY group_id, id`;
    const findings = tableExists(d, 'vh_findings')
      ? (() => {
          try {
            return d.prepare(findingsSql).all() as AuditFinding[];
          } catch {
            return [] as AuditFinding[];
          }
        })()
      : [];

    const tp = findings.filter((f) => f.verdict === 'TRUE_POSITIVE').length;
    return {
      available: true,
      groups,
      findings,
      counts: { groups: groups.length, findings: findings.length, true_positives: tp },
    };
  } finally {
    d.close();
  }
}

/** TRUE_POSITIVE findings that still need live verification (the fork inventory). */
export function forkInventory(dbPath: string): AuditFinding[] {
  return readAuditSnapshot(dbPath).findings.filter((f) => f.verdict === 'TRUE_POSITIVE');
}
