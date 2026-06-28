import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Backend project root (the `backend/` dir), regardless of cwd. */
export const BACKEND_ROOT = resolve(__dirname, '..');
export const DATA_DIR = join(BACKEND_ROOT, 'data');

function env(key: string, fallback: string): string {
  const v = process.env[key];
  return v === undefined || v === '' ? fallback : v;
}
function envInt(key: string, fallback: number): number {
  const v = process.env[key];
  if (v === undefined || v === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function ensureDataDir(): void {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

/**
 * JWT signing secret. Prefer env; otherwise generate once and persist under
 * data/.jwt-secret so cookies survive restarts. Never commit data/.
 */
function resolveJwtSecret(): string {
  const fromEnv = process.env.JWT_SECRET;
  if (fromEnv && fromEnv.length >= 16) return fromEnv;
  ensureDataDir();
  const secretFile = join(DATA_DIR, '.jwt-secret');
  if (existsSync(secretFile)) return readFileSync(secretFile, 'utf8').trim();
  const secret = randomBytes(48).toString('hex');
  writeFileSync(secretFile, secret, { mode: 0o600 });
  return secret;
}

ensureDataDir();

export const config = {
  host: env('HOST', '127.0.0.1'),
  port: envInt('PORT', 8787),
  logLevel: env('LOG_LEVEL', 'info'),

  adminUser: env('ADMIN_USER', 'admin'),
  adminPass: env('ADMIN_PASS', 'vibhackiscool'),
  jwtSecret: resolveJwtSecret(),
  sessionTtl: envInt('SESSION_TTL', 86_400),

  corsOrigin: env('CORS_ORIGIN', 'http://localhost:5173'),

  projectsDir: env('PROJECTS_DIR', '/vibe/hack/projects'),
  auditsDir: env('AUDITS_DIR', '/vibe/hack/audits'),
  skillDir: env('SKILL_DIR', '/vibe/hack/skill'),

  claudeBin: env('CLAUDE_BIN', 'claude'),
  defaultModel: env('DEFAULT_MODEL', ''),
  defaultPermissionMode: env('DEFAULT_PERMISSION_MODE', 'bypassPermissions'),
  defaultMode: env('DEFAULT_MODE', 'full'),
  defaultEffort: env('DEFAULT_EFFORT', ''), // '' = model default (low|medium|high|xhigh|max)
  defaultWorkflows: env('DEFAULT_WORKFLOWS', ''), // '' = default; 'on'|'off' (ultracode = xhigh + on)
  defaultThinking: env('DEFAULT_THINKING', ''), // '' = model default; 'on'|'off' to force
  defaultThinkingTokens: envInt('DEFAULT_THINKING_TOKENS', 10_000),
  maxConcurrentRuns: envInt('MAX_CONCURRENT_RUNS', 2),

  resourceSampleMs: envInt('RESOURCE_SAMPLE_MS', 5_000),

  appDbPath: env('APP_DB_PATH', join(DATA_DIR, 'app.db')),
} as const;

export type AppConfig = typeof config;
