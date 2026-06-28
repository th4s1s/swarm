import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const OAUTH_USAGE_URL = 'https://api.anthropic.com/api/oauth/usage';
const API_VERSION = '2023-06-01';
const OAUTH_429_COOLDOWN_MS = 180_000;

let cooldownUntil = 0;

function readJson(path: string): Record<string, unknown> | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export interface AccountInfo {
  email: string | null;
  organizationUuid: string | null;
  billingType: string | null;
  subscriptionType: string | null;
}

export function readAccount(): AccountInfo {
  const claudeJson = readJson(join(homedir(), '.claude.json'));
  const oauth = (claudeJson?.['oauthAccount'] ?? {}) as Record<string, unknown>;
  const creds = readJson(join(homedir(), '.claude', '.credentials.json'));
  const co = (creds?.['claudeAiOauth'] ?? {}) as Record<string, unknown>;
  return {
    email: typeof oauth['emailAddress'] === 'string' ? (oauth['emailAddress'] as string) : null,
    organizationUuid:
      typeof oauth['organizationUuid'] === 'string' ? (oauth['organizationUuid'] as string) : null,
    billingType: typeof oauth['billingType'] === 'string' ? (oauth['billingType'] as string) : null,
    subscriptionType:
      typeof co['subscriptionType'] === 'string' ? (co['subscriptionType'] as string) : null,
  };
}

function readAccessToken(): string | null {
  const creds = readJson(join(homedir(), '.claude', '.credentials.json'));
  const co = (creds?.['claudeAiOauth'] ?? {}) as Record<string, unknown>;
  return typeof co['accessToken'] === 'string' ? (co['accessToken'] as string) : null;
}

export interface QuotaWindow {
  used: number; // percent used (utilization)
  remaining: number; // percent remaining
  resetsAt: string | null;
}

export interface QuotaResult {
  account: AccountInfo;
  plan: string;
  quotas: Record<string, QuotaWindow>;
  extraUsage: unknown;
  error?: string;
}

function parseReset(v: unknown): string | null {
  if (typeof v === 'number') return new Date(v < 1e12 ? v * 1000 : v).toISOString();
  if (typeof v === 'string') {
    if (/^\d+$/.test(v)) {
      const n = Number(v);
      return new Date(n < 1e12 ? n * 1000 : n).toISOString();
    }
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  return null;
}

function toWindow(w: Record<string, unknown>): QuotaWindow {
  const used = typeof w['utilization'] === 'number' ? (w['utilization'] as number) : 0;
  return { used, remaining: Math.max(0, 100 - used), resetsAt: parseReset(w['resets_at']) };
}

function hasUtil(w: unknown): w is Record<string, unknown> {
  return !!w && typeof w === 'object' && typeof (w as Record<string, unknown>)['utilization'] === 'number';
}

/** Fetch the OAuth usage windows (5h session / 7d weekly / per-model). */
export async function getQuota(): Promise<QuotaResult> {
  const account = readAccount();
  const token = readAccessToken();
  if (!token) {
    return { account, plan: 'unknown', quotas: {}, extraUsage: null, error: 'no Claude OAuth token found (~/.claude/.credentials.json)' };
  }
  if (Date.now() < cooldownUntil) {
    return { account, plan: 'Claude Code', quotas: {}, extraUsage: null, error: 'usage endpoint cooling down after rate limit; try again shortly' };
  }
  try {
    const res = await fetch(OAUTH_USAGE_URL, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'anthropic-beta': 'oauth-2025-04-20',
        'anthropic-version': API_VERSION,
      },
    });
    if (res.status === 429) {
      cooldownUntil = Date.now() + OAUTH_429_COOLDOWN_MS;
      return { account, plan: 'Claude Code', quotas: {}, extraUsage: null, error: 'rate limited (429) by the usage endpoint' };
    }
    if (!res.ok) {
      return { account, plan: 'Claude Code', quotas: {}, extraUsage: null, error: `usage endpoint returned ${res.status}` };
    }
    const data = (await res.json()) as Record<string, unknown>;
    const quotas: Record<string, QuotaWindow> = {};
    if (hasUtil(data['five_hour'])) quotas['session_5h'] = toWindow(data['five_hour'] as Record<string, unknown>);
    if (hasUtil(data['seven_day'])) quotas['weekly_7d'] = toWindow(data['seven_day'] as Record<string, unknown>);
    for (const [k, v] of Object.entries(data)) {
      if (k.startsWith('seven_day_') && k !== 'seven_day' && hasUtil(v)) {
        quotas[`weekly_${k.replace('seven_day_', '')}`] = toWindow(v as Record<string, unknown>);
      }
    }
    return { account, plan: 'Claude Code', quotas, extraUsage: data['extra_usage'] ?? null };
  } catch (e) {
    return { account, plan: 'Claude Code', quotas: {}, extraUsage: null, error: (e as Error).message };
  }
}
