import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { config } from '../config.js';

/** Estimated public pricing ($ per 1M tokens). Subscription has no per-call billing,
 *  so cost figures are ESTIMATES for relative comparison. */
interface Price {
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
}
const PRICING: Record<'opus' | 'sonnet' | 'haiku', Price> = {
  opus: { input: 15, output: 75, cacheWrite: 18.75, cacheRead: 1.5 },
  sonnet: { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 },
  haiku: { input: 0.8, output: 4, cacheWrite: 1.0, cacheRead: 0.08 },
};
function priceFor(model: string): Price {
  const m = model.toLowerCase();
  if (m.includes('opus')) return PRICING.opus;
  if (m.includes('haiku')) return PRICING.haiku;
  return PRICING.sonnet;
}

export interface TokenAgg {
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
  total: number;
  costUsd: number;
  messages: number;
}
function emptyAgg(): TokenAgg {
  return { input: 0, output: 0, cacheWrite: 0, cacheRead: 0, total: 0, costUsd: 0, messages: 0 };
}
function addUsage(agg: TokenAgg, u: Record<string, unknown>, model: string): void {
  const inp = Number(u['input_tokens'] ?? 0);
  const out = Number(u['output_tokens'] ?? 0);
  const cw = Number(u['cache_creation_input_tokens'] ?? 0);
  const cr = Number(u['cache_read_input_tokens'] ?? 0);
  const p = priceFor(model);
  agg.input += inp;
  agg.output += out;
  agg.cacheWrite += cw;
  agg.cacheRead += cr;
  agg.total += inp + out + cw + cr;
  agg.costUsd += (inp * p.input + out * p.output + cw * p.cacheWrite + cr * p.cacheRead) / 1e6;
  agg.messages += 1;
}

export interface UsageAggregate {
  total: TokenAgg;
  byModel: Record<string, TokenAgg>;
  byProject: Record<string, TokenAgg>;
  byDay: Record<string, TokenAgg>;
  byProjectSession: Record<string, Record<string, TokenAgg>>; // project -> sessionId -> agg
  generatedAt: string;
  pricingNote: string;
}

function projectOf(cwd: string | undefined): string | null {
  if (!cwd) return null;
  const prefix = config.projectsDir.endsWith('/') ? config.projectsDir : config.projectsDir + '/';
  if (cwd.startsWith(prefix)) return cwd.slice(prefix.length).split('/')[0] ?? null;
  return null;
}

function* walkJsonl(dir: string): Generator<string> {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    let st;
    try {
      st = statSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) yield* walkJsonl(p);
    else if (name.endsWith('.jsonl')) yield p;
  }
}

let cache: { at: number; data: UsageAggregate } | null = null;

export function getUsageAggregate(force = false): UsageAggregate {
  if (!force && cache && Date.now() - cache.at < 60_000) return cache.data;

  const total = emptyAgg();
  const byModel: Record<string, TokenAgg> = {};
  const byProject: Record<string, TokenAgg> = {};
  const byDay: Record<string, TokenAgg> = {};
  const byProjectSession: Record<string, Record<string, TokenAgg>> = {};
  const bump = (map: Record<string, TokenAgg>, key: string, u: Record<string, unknown>, model: string) => {
    (map[key] ??= emptyAgg()), addUsage(map[key]!, u, model);
  };

  const root = join(homedir(), '.claude', 'projects');
  for (const file of walkJsonl(root)) {
    let content: string;
    try {
      content = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    for (const line of content.split('\n')) {
      if (!line.includes('"usage"')) continue; // fast filter
      let o: Record<string, unknown>;
      try {
        o = JSON.parse(line) as Record<string, unknown>;
      } catch {
        continue;
      }
      const msg = o['message'] as Record<string, unknown> | undefined;
      const usage = msg?.['usage'] as Record<string, unknown> | undefined;
      if (!usage) continue;
      const model = typeof msg?.['model'] === 'string' ? (msg['model'] as string) : 'unknown';
      const cwd = typeof o['cwd'] === 'string' ? (o['cwd'] as string) : undefined;
      const sessionId = typeof o['sessionId'] === 'string' ? (o['sessionId'] as string) : 'unknown';
      const day = typeof o['timestamp'] === 'string' ? (o['timestamp'] as string).slice(0, 10) : 'unknown';

      addUsage(total, usage, model);
      bump(byModel, model, usage, model);
      bump(byDay, day, usage, model);
      const proj = projectOf(cwd) ?? 'other';
      bump(byProject, proj, usage, model);
      (byProjectSession[proj] ??= {});
      bump(byProjectSession[proj]!, sessionId, usage, model);
    }
  }

  const data: UsageAggregate = {
    total,
    byModel,
    byProject,
    byDay,
    byProjectSession,
    generatedAt: new Date().toISOString(),
    pricingNote: 'Cost is ESTIMATED from public per-token list prices; subscription plans are not billed per call.',
  };
  cache = { at: Date.now(), data };
  return data;
}
