import { readAccessToken } from '../lib/anthropicUsage.js';

/**
 * Selectable Claude models for the run/session/default pickers, queried LIVE from Claude so new
 * releases appear without a code change. Ids are `claude --model` values: '' means "use the account
 * default", the short aliases (`opus`/`sonnet`/`haiku`/`fable`) always resolve to the latest release
 * of that tier, and a full id pins one version.
 *
 * Source: `GET https://api.anthropic.com/v1/models` with the Claude Code OAuth token (the same
 * credential the quota panel uses). The `claude` CLI has no list-models command. Results are cached
 * (the lineup changes rarely); if the call fails we serve the last good list, else a static fallback,
 * so the picker never breaks when offline.
 */
export interface ModelOption {
  id: string;
  label: string;
}

const MODELS_URL = 'https://api.anthropic.com/v1/models?limit=100';
const API_VERSION = '2023-06-01';
const CACHE_TTL_MS = 3_600_000; // 1h
const FAILURE_RETRY_MS = 60_000; // don't hammer a failing/offline endpoint

/** Tier aliases, in the order they should appear. Only offered if the live list has that tier. */
const TIERS = ['opus', 'sonnet', 'fable', 'haiku'] as const;

const DEFAULT_OPTION: ModelOption = { id: '', label: 'Default (account setting)' };

/** Used only when the API has never answered (fresh boot while offline). */
const FALLBACK: ModelOption[] = [
  DEFAULT_OPTION,
  { id: 'opus', label: 'opus (latest Opus)' },
  { id: 'sonnet', label: 'sonnet (latest Sonnet)' },
  { id: 'fable', label: 'fable (latest Fable)' },
  { id: 'haiku', label: 'haiku (latest Haiku)' },
];

interface ApiModel {
  id: string;
  display_name?: string;
  created_at?: string;
}

let cache: { at: number; models: ModelOption[] } | null = null;
let nextAttempt = 0;

function tierOf(id: string): (typeof TIERS)[number] | null {
  for (const t of TIERS) if (id.startsWith(`claude-${t}`)) return t;
  return null;
}

/** Build the picker list: account default, then tier aliases (newest of each), then every concrete id. */
function toOptions(apiModels: ApiModel[]): ModelOption[] {
  // The API returns newest-first; keep that order so "first seen per tier" is the latest release.
  const newestByTier = new Map<string, ApiModel>();
  for (const m of apiModels) {
    const t = tierOf(m.id);
    if (t && !newestByTier.has(t)) newestByTier.set(t, m);
  }

  const aliases: ModelOption[] = [];
  for (const t of TIERS) {
    const newest = newestByTier.get(t);
    if (newest) aliases.push({ id: t, label: `${t} (latest: ${newest.display_name ?? newest.id})` });
  }

  const concrete = apiModels.map((m) => ({
    id: m.id,
    label: m.display_name ? `${m.display_name} (${m.id})` : m.id,
  }));

  return [DEFAULT_OPTION, ...aliases, ...concrete];
}

async function fetchModels(): Promise<ModelOption[] | null> {
  const token = readAccessToken();
  if (!token) return null;
  try {
    const res = await fetch(MODELS_URL, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'anthropic-beta': 'oauth-2025-04-20',
        'anthropic-version': API_VERSION,
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { data?: ApiModel[] };
    const list = (body.data ?? []).filter((m) => typeof m.id === 'string' && m.id);
    return list.length ? toOptions(list) : null;
  } catch {
    return null; // offline / DNS / timeout - callers fall back
  }
}

/**
 * The model list for the pickers. Serves cache while fresh, otherwise refreshes; on failure keeps
 * serving the last good list (or the static fallback) and retries later. Never throws.
 */
export async function getModels(): Promise<ModelOption[]> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_TTL_MS) return cache.models;
  if (now < nextAttempt) return cache?.models ?? FALLBACK;

  const fresh = await fetchModels();
  if (fresh) {
    cache = { at: now, models: fresh };
    nextAttempt = 0;
    return fresh;
  }
  nextAttempt = now + FAILURE_RETRY_MS;
  return cache?.models ?? FALLBACK;
}
