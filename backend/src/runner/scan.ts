import Database from 'better-sqlite3';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { BACKEND_ROOT } from '../config.js';
import { auditDbPath, auditDir, projectDir } from '../lib/paths.js';
import { run } from '../lib/exec.js';
import { newId } from '../lib/util.js';

/**
 * Deterministic baseline scan: run the self-contained scanners over a project's source and record their
 * hits as LEADS in `vh_scanner_hits`. Runs app-side (zero LLM tokens); the recon phase reads the results.
 * Everything here is best-effort - a missing tool, a timeout, or a parse error logs and continues; this
 * must never throw into the runner. Tools are invoked by absolute path inside ./tools (never on PATH).
 */

const TOOLS_DIR = resolve(BACKEND_ROOT, '..', 'tools');
const SEMGREP = join(TOOLS_DIR, 'semgrep', 'venv', 'bin', 'semgrep');
const GITLEAKS = join(TOOLS_DIR, 'bin', 'gitleaks');

/** High-signal community security pack. Tunable; kept broad since hits are advisory leads. */
const SEMGREP_RULESET = 'p/security-audit';
const SCAN_TIMEOUT_MS = 300_000;

export interface ScanResult {
  hits: number;
  tools: string[];
}

type Logger = (msg: string) => void;

interface SarifResult {
  ruleId?: string;
  level?: string;
  message?: { text?: string };
  locations?: {
    physicalLocation?: {
      artifactLocation?: { uri?: string };
      region?: { startLine?: number; endLine?: number };
    };
  }[];
}

interface HitRow {
  tool: string;
  ruleId: string;
  severity: string;
  file: string;
  line: number | null;
  endLine: number | null;
  message: string;
  fingerprint: string;
  raw: string;
}

function parseSarif(path: string): SarifResult[] {
  if (!existsSync(path)) return [];
  try {
    const doc = JSON.parse(readFileSync(path, 'utf8')) as { runs?: { results?: SarifResult[] }[] };
    return (doc.runs ?? []).flatMap((r) => r.results ?? []);
  } catch {
    return [];
  }
}

function relFile(uri: string, projRoot: string): string {
  let f = uri || '';
  if (f.startsWith('file://')) f = f.slice('file://'.length);
  if (f.startsWith(projRoot + '/')) return f.slice(projRoot.length + 1);
  if (f.startsWith('/')) {
    try {
      return relative(projRoot, f);
    } catch {
      return f;
    }
  }
  return f.startsWith('./') ? f.slice(2) : f;
}

function toRows(tool: string, results: SarifResult[], projRoot: string): HitRow[] {
  return results.map((r) => {
    const loc = r.locations?.[0]?.physicalLocation;
    const file = relFile(loc?.artifactLocation?.uri ?? '', projRoot);
    const line = loc?.region?.startLine ?? null;
    const endLine = loc?.region?.endLine ?? null;
    const ruleId = r.ruleId ?? '';
    const message = r.message?.text ?? '';
    const severity = r.level ?? 'warning';
    const fingerprint = createHash('sha1').update(`${tool}|${ruleId}|${file}|${line}|${message}`).digest('hex');
    return { tool, ruleId, severity, file, line, endLine, message, fingerprint, raw: JSON.stringify(r) };
  });
}

function insertHits(dbPath: string, rows: HitRow[]): number {
  if (rows.length === 0) return 0;
  let db: Database.Database | null = null;
  try {
    db = new Database(dbPath);
    const stmt = db.prepare(
      `INSERT OR IGNORE INTO vh_scanner_hits
         (id, tool, rule_id, severity, file, line, end_line, message, status, fingerprint, raw)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, ?)`,
    );
    const insertMany = db.transaction((rs: HitRow[]) => {
      let n = 0;
      for (const r of rs) {
        n += stmt.run(newId(), r.tool, r.ruleId, r.severity, r.file, r.line, r.endLine, r.message, r.fingerprint, r.raw).changes;
      }
      return n;
    });
    return insertMany(rows);
  } catch {
    return 0;
  } finally {
    db?.close();
  }
}

/** Run one scanner (best-effort). Scanners exit non-zero when they find things, so a thrown
 * CommandError is expected - the SARIF file is the signal, not the exit code. */
async function runScanner(cmd: string, args: string[], cwd: string, log?: Logger): Promise<void> {
  try {
    await run(cmd, args, { cwd, timeoutMs: SCAN_TIMEOUT_MS });
  } catch (err) {
    log?.(`scanner ${cmd.split('/').pop()} exited non-zero or timed out (expected on findings): ${(err as Error).message}`);
  }
}

/**
 * Scan the project once per session (guarded by a sentinel). Returns null if already scanned.
 * Records leads with group_id NULL - recon Step 4.5 buckets them to feature groups later.
 */
export async function runBaselineScan(projectName: string, sessionName: string, log?: Logger): Promise<ScanResult | null> {
  const proj = projectDir(projectName);
  const scanDir = join(auditDir(projectName, sessionName), '.app', 'scan');
  const sentinel = join(scanDir, '.done');
  if (existsSync(sentinel)) return null; // once per session
  mkdirSync(scanDir, { recursive: true });

  const dbPath = auditDbPath(projectName, sessionName);
  const tools: string[] = [];
  let hits = 0;

  if (existsSync(SEMGREP)) {
    const out = join(scanDir, 'semgrep.sarif');
    await runScanner(
      SEMGREP,
      ['--config', SEMGREP_RULESET, '--sarif', '-o', out, '--metrics=off', '--timeout', '60', '--max-target-bytes', '1000000', '--jobs', '4', '.'],
      proj,
      log,
    );
    hits += insertHits(dbPath, toRows('semgrep', parseSarif(out), proj));
    tools.push('semgrep');
  } else {
    log?.(`semgrep not installed at ${SEMGREP}; skipping (run scripts/install-tools.sh)`);
  }

  if (existsSync(GITLEAKS)) {
    const out = join(scanDir, 'gitleaks.sarif');
    await runScanner(
      GITLEAKS,
      ['detect', '--source', '.', '--no-git', '--report-format', 'sarif', '--report-path', out, '--exit-code', '0'],
      proj,
      log,
    );
    hits += insertHits(dbPath, toRows('gitleaks', parseSarif(out), proj));
    tools.push('gitleaks');
  } else {
    log?.(`gitleaks not installed at ${GITLEAKS}; skipping (run scripts/install-tools.sh)`);
  }

  writeFileSync(sentinel, JSON.stringify({ at: new Date().toISOString(), hits, tools }));
  return { hits, tools };
}
