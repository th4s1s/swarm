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
  // Populated only for pay-as-you-go windows (null for subscription windows).
  limitDollars?: number | null;
  usedDollars?: number | null;
  remainingDollars?: number | null;
}

/** A money amount in minor units (dollars = amountMinor / 10**exponent). */
export interface Money {
  amountMinor: number;
  currency: string;
  exponent: number;
}

/** The `spend` block from the usage endpoint: monthly dollar spend / credit balance. */
export interface SpendInfo {
  enabled: boolean;
  used: Money | null;
  limit: Money | null;
  balance: Money | null;
  cap: Money | null;
  percent: number | null;
  severity: string | null; // normal | warning | critical
  disabledReason: string | null;
  canPurchaseCredits: boolean;
  disclaimer: string | null;
}

/** The `extra_usage` block: the usage-credits / monthly view. */
export interface ExtraUsageInfo {
  isEnabled: boolean;
  monthlyLimit: number | null;
  usedCredits: number | null;
  utilization: number | null; // percent
  currency: string | null;
  decimalPlaces: number | null;
  disabledReason: string | null;
}

export interface QuotaResult {
  account: AccountInfo;
  plan: string;
  quotas: Record<string, QuotaWindow>;
  spend: SpendInfo | null;
  extraUsage: ExtraUsageInfo | null;
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

function num(o: Record<string, unknown>, k: string): number | null {
  return typeof o[k] === 'number' ? (o[k] as number) : null;
}

function toWindow(w: Record<string, unknown>): QuotaWindow {
  const used = typeof w['utilization'] === 'number' ? (w['utilization'] as number) : 0;
  return {
    used,
    remaining: Math.max(0, 100 - used),
    resetsAt: parseReset(w['resets_at']),
    limitDollars: num(w, 'limit_dollars'),
    usedDollars: num(w, 'used_dollars'),
    remainingDollars: num(w, 'remaining_dollars'),
  };
}

function toMoney(x: unknown): Money | null {
  if (!x || typeof x !== 'object') return null;
  const o = x as Record<string, unknown>;
  if (typeof o['amount_minor'] !== 'number') return null;
  return {
    amountMinor: o['amount_minor'] as number,
    currency: typeof o['currency'] === 'string' ? (o['currency'] as string) : 'USD',
    exponent: typeof o['exponent'] === 'number' ? (o['exponent'] as number) : 2,
  };
}

function toSpend(x: unknown): SpendInfo | null {
  if (!x || typeof x !== 'object') return null;
  const o = x as Record<string, unknown>;
  return {
    enabled: o['enabled'] === true,
    used: toMoney(o['used']),
    limit: toMoney(o['limit']),
    balance: toMoney(o['balance']),
    cap: toMoney(o['cap']),
    percent: num(o, 'percent'),
    severity: typeof o['severity'] === 'string' ? (o['severity'] as string) : null,
    disabledReason: typeof o['disabled_reason'] === 'string' ? (o['disabled_reason'] as string) : null,
    canPurchaseCredits: o['can_purchase_credits'] === true,
    disclaimer: typeof o['disclaimer'] === 'string' ? (o['disclaimer'] as string) : null,
  };
}

function toExtraUsage(x: unknown): ExtraUsageInfo | null {
  if (!x || typeof x !== 'object') return null;
  const o = x as Record<string, unknown>;
  return {
    isEnabled: o['is_enabled'] === true,
    monthlyLimit: num(o, 'monthly_limit'),
    usedCredits: num(o, 'used_credits'),
    utilization: num(o, 'utilization'),
    currency: typeof o['currency'] === 'string' ? (o['currency'] as string) : null,
    decimalPlaces: num(o, 'decimal_places'),
    disabledReason: typeof o['disabled_reason'] === 'string' ? (o['disabled_reason'] as string) : null,
  };
}

function hasUtil(w: unknown): w is Record<string, unknown> {
  return !!w && typeof w === 'object' && typeof (w as Record<string, unknown>)['utilization'] === 'number';
}

/** Fetch the OAuth usage windows (5h session / 7d weekly / per-model) plus the monthly spend /
 * usage-credit block. Both the windows and the spend block come from the same endpoint. */
export async function getQuota(): Promise<QuotaResult> {
  const account = readAccount();
  const empty = (plan: string, error?: string): QuotaResult => ({
    account,
    plan,
    quotas: {},
    spend: null,
    extraUsage: null,
    ...(error ? { error } : {}),
  });

  const token = readAccessToken();
  if (!token) return empty('unknown', 'no Claude OAuth token found (~/.claude/.credentials.json)');
  if (Date.now() < cooldownUntil) {
    return empty('Claude Code', 'usage endpoint cooling down after rate limit; try again shortly');
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
      return empty('Claude Code', 'rate limited (429) by the usage endpoint');
    }
    if (!res.ok) return empty('Claude Code', `usage endpoint returned ${res.status}`);

    const data = (await res.json()) as Record<string, unknown>;
    const quotas: Record<string, QuotaWindow> = {};
    if (hasUtil(data['five_hour'])) quotas['session_5h'] = toWindow(data['five_hour'] as Record<string, unknown>);
    if (hasUtil(data['seven_day'])) quotas['weekly_7d'] = toWindow(data['seven_day'] as Record<string, unknown>);
    for (const [k, v] of Object.entries(data)) {
      if (k.startsWith('seven_day_') && k !== 'seven_day' && hasUtil(v)) {
        quotas[`weekly_${k.replace('seven_day_', '')}`] = toWindow(v as Record<string, unknown>);
      }
    }
    return {
      account,
      plan: 'Claude Code',
      quotas,
      spend: toSpend(data['spend']),
      extraUsage: toExtraUsage(data['extra_usage']),
    };
  } catch (e) {
    return empty('Claude Code', (e as Error).message);
  }
}
