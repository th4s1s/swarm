import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import AdmZip from 'adm-zip';
import Database from 'better-sqlite3';
import { assertValidProjectName, isPathInside, InvalidNameError } from '../src/lib/paths.js';
import { composePrompt } from '../src/runner/prompt.js';
import { extractZipBuffer, ZipSlipError } from '../src/lib/zip.js';
import { readAuditSnapshot } from '../src/lib/auditdb.js';
import { buildClaudeArgs } from '../src/lib/claude.js';
import { AppError } from '../src/lib/errors.js';

describe('project name validation', () => {
  it('accepts alphanumeric, dash, underscore', () => {
    for (const n of ['foo', 'foo-bar', 'foo_bar_1', 'A1', 'my-Proj_2']) {
      expect(() => assertValidProjectName(n)).not.toThrow();
    }
  });
  it('rejects traversal, slashes, empty, reserved', () => {
    for (const n of ['', '..', '.', 'a/b', 'a b', 'a.b', '../x', 'foo/../bar', 'a'.repeat(101)]) {
      expect(() => assertValidProjectName(n)).toThrow(InvalidNameError);
    }
  });
});

describe('isPathInside', () => {
  it('detects containment and escapes', () => {
    expect(isPathInside('/a/b', '/a/b/c')).toBe(true);
    expect(isPathInside('/a/b', '/a/b')).toBe(true);
    expect(isPathInside('/a/b', '/a/b/../c')).toBe(false);
    expect(isPathInside('/a/b', '/a')).toBe(false);
    expect(isPathInside('/a/b', '/etc/passwd')).toBe(false);
  });
});

describe('composePrompt', () => {
  it('maps phases to slash commands', () => {
    expect(composePrompt({ phase: 'recon' }).prompt).toBe('/vibehack:recon');
    expect(composePrompt({ phase: 'fpcheck' }).prompt).toBe('/vibehack:fpcheck');
  });
  it('maps modes', () => {
    expect(composePrompt({ mode: 'full' }).prompt).toBe('/vibehack');
    expect(composePrompt({ mode: 'source' }).prompt).toBe('/vibehack:source');
  });
  it('verify requires a findingId', () => {
    expect(() => composePrompt({ phase: 'verify' })).toThrow(AppError);
    expect(composePrompt({ phase: 'verify', findingId: 'F-1' }).prompt).toBe('/vibehack:verify F-1');
  });
  it('appends custom prompt and supports custom-only', () => {
    expect(composePrompt({ phase: 'audit', customPrompt: 'focus on auth' }).prompt).toBe(
      '/vibehack:audit\n\nfocus on auth',
    );
    expect(composePrompt({ customPrompt: 'just this' }).prompt).toBe('just this');
  });
  it('throws when nothing is provided', () => {
    expect(() => composePrompt({})).toThrow(AppError);
  });
  it('phase takes precedence over mode', () => {
    expect(composePrompt({ phase: 'recon', mode: 'full' }).phase).toBe('recon');
  });
});

describe('zip extraction', () => {
  it('extracts a clean zip', () => {
    const dir = mkdtempSync(join(tmpdir(), 'vh-zip-'));
    try {
      const z = new AdmZip();
      z.addFile('readme.md', Buffer.from('# hi'));
      z.addFile('src/main.py', Buffer.from('print(1)'));
      const n = extractZipBuffer(z.toBuffer(), dir);
      expect(n).toBe(2);
      expect(existsSync(join(dir, 'readme.md'))).toBe(true);
      expect(readFileSync(join(dir, 'src/main.py'), 'utf8')).toBe('print(1)');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it('rejects zip-slip entries and writes nothing', () => {
    // A genuinely malicious zip whose first entry name is "../escape.txt"
    // (adm-zip's addFile sanitizes such names, so this is pre-built bytes).
    const EVIL_ZIP_B64 =
      'UEsDBBQAAAAAALRN3Fx+UwTZBQAAAAUAAAANAAAALi4vZXNjYXBlLnR4dHB3bmVkUEsDBBQAAAAAALRN3FySVKm+BAAAAAQAAAAGAAAAb2sudHh0ZmluZVBLAQIUAxQAAAAAALRN3Fx+UwTZBQAAAAUAAAANAAAAAAAAAAAAAACAAQAAAAAuLi9lc2NhcGUudHh0UEsBAhQDFAAAAAAAtE3cXJJUqb4EAAAABAAAAAYAAAAAAAAAAAAAAIABMAAAAG9rLnR4dFBLBQYAAAAAAgACAG8AAABYAAAAAAA=';
    const dir = mkdtempSync(join(tmpdir(), 'vh-zip-'));
    try {
      expect(() => extractZipBuffer(Buffer.from(EVIL_ZIP_B64, 'base64'), dir)).toThrow(ZipSlipError);
      expect(existsSync(join(dir, '..', 'escape.txt'))).toBe(false);
      // Pre-validation means nothing is written, not even the benign entry.
      expect(existsSync(join(dir, 'ok.txt'))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('buildClaudeArgs', () => {
  const base = { prompt: 'hi', cwd: '/x' };
  it('passes a valid effort level', () => {
    expect(buildClaudeArgs({ ...base, effort: 'high' })).toContain('--effort');
    const a = buildClaudeArgs({ ...base, effort: 'xhigh' });
    expect(a[a.indexOf('--effort') + 1]).toBe('xhigh');
  });
  it('omits effort when null or invalid', () => {
    expect(buildClaudeArgs({ ...base, effort: null })).not.toContain('--effort');
    expect(buildClaudeArgs({ ...base, effort: 'bogus' })).not.toContain('--effort');
  });
  it('maps ultracode to --effort xhigh', () => {
    const a = buildClaudeArgs({ ...base, effort: 'ultracode' });
    expect(a[a.indexOf('--effort') + 1]).toBe('xhigh');
  });
  it('appends a system prompt when provided', () => {
    const a = buildClaudeArgs({ ...base, appendSystemPrompt: 'ultracode is on' });
    expect(a[a.indexOf('--append-system-prompt') + 1]).toBe('ultracode is on');
  });
  it('sets session/resume/fork and permission/model flags', () => {
    const a = buildClaudeArgs({ ...base, resume: 'sid1', fork: true, permissionMode: 'bypassPermissions', model: 'claude-opus-4-8' });
    expect(a).toEqual(expect.arrayContaining(['--resume', 'sid1', '--fork-session', '--permission-mode', 'bypassPermissions', '--model', 'claude-opus-4-8']));
  });
});

describe('audit.db reader', () => {
  it('returns unavailable for a missing db', () => {
    const snap = readAuditSnapshot('/nonexistent/audit.db');
    expect(snap.available).toBe(false);
    expect(snap.findings).toEqual([]);
  });
  it('reads groups, findings joined with verdicts', () => {
    const dir = mkdtempSync(join(tmpdir(), 'vh-adb-'));
    const dbp = join(dir, 'audit.db');
    try {
      const d = new Database(dbp);
      d.exec(`
        CREATE TABLE vh_feature_groups(id TEXT PRIMARY KEY,name TEXT,description TEXT,status TEXT);
        INSERT INTO vh_feature_groups VALUES('G1','Auth','x','audited');
        CREATE TABLE vh_findings(id TEXT PRIMARY KEY,group_id TEXT,title TEXT,severity TEXT,confidence INT,cwe TEXT,location TEXT,verified TEXT);
        INSERT INTO vh_findings VALUES('G1-F1','G1','Bug','MEDIUM',9,'CWE-1','f.c:1','source-only');
        CREATE TABLE vh_fp_verdicts(finding_id TEXT PRIMARY KEY,verdict TEXT,final_severity TEXT,final_id TEXT);
        INSERT INTO vh_fp_verdicts VALUES('G1-F1','TRUE_POSITIVE','HIGH','F-1');
      `);
      d.close();
      const snap = readAuditSnapshot(dbp);
      expect(snap.available).toBe(true);
      expect(snap.counts).toEqual({ groups: 1, findings: 1, true_positives: 1 });
      const f = snap.findings[0]!;
      expect(f.final_id).toBe('F-1');
      expect(f.severity).toBe('HIGH'); // final severity overrides original
      expect(f.verdict).toBe('TRUE_POSITIVE');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it('tolerates a db with no audit tables yet', () => {
    const dir = mkdtempSync(join(tmpdir(), 'vh-adb-'));
    const dbp = join(dir, 'audit.db');
    try {
      new Database(dbp).close(); // empty db (pre-run)
      const snap = readAuditSnapshot(dbp);
      expect(snap.available).toBe(true);
      expect(snap.counts.findings).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
