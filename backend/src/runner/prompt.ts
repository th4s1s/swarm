import { badRequest } from '../lib/errors.js';

export const PHASES = ['recon', 'deploy', 'audit', 'fpcheck', 'verify', 'report'] as const;
export const MODES = ['full', 'source'] as const;
export type Phase = (typeof PHASES)[number];
export type Mode = (typeof MODES)[number];

export interface ComposeInput {
  phase?: string | null;
  mode?: string | null;
  customPrompt?: string | null;
  /** Required when phase === 'verify' (the finding to verify in this fork). */
  findingId?: string | null;
  /** Compact the resumed session's context (sends `/compact [instructions]`). */
  compact?: boolean | null;
}

const SLASH: Record<Phase, string> = {
  recon: '/vibehack:recon',
  deploy: '/vibehack:deploy',
  audit: '/vibehack:audit',
  fpcheck: '/vibehack:fpcheck',
  verify: '/vibehack:verify',
  report: '/vibehack:report',
};

/**
 * Build the prompt sent to claude. Phase takes precedence over mode (the UI offers
 * one of "6 phases or 2 modes"). Either can be combined with a free-text custom
 * prompt; if neither is set, the custom prompt is sent on its own.
 */
export function composePrompt(input: ComposeInput): {
  prompt: string;
  phase: Phase | null;
  mode: Mode | null;
} {
  const custom = (input.customPrompt ?? '').trim();

  // Compact is its own kind of run: send `/compact` (with optional inline instructions)
  // to the resumed session. It is not combined with a phase/mode.
  if (input.compact) {
    return { prompt: custom ? `/compact ${custom}` : '/compact', phase: null, mode: null };
  }

  let head = '';
  let phase: Phase | null = null;
  let mode: Mode | null = null;

  if (input.phase) {
    if (!(PHASES as readonly string[]).includes(input.phase)) {
      throw badRequest(`unknown phase "${input.phase}"`);
    }
    phase = input.phase as Phase;
    head = SLASH[phase];
    if (phase === 'verify') {
      if (!input.findingId) throw badRequest('verify requires a findingId');
      head += ` ${input.findingId}`;
    }
  } else if (input.mode) {
    if (!(MODES as readonly string[]).includes(input.mode)) {
      throw badRequest(`unknown mode "${input.mode}"`);
    }
    mode = input.mode as Mode;
    head = mode === 'full' ? '/vibehack' : '/vibehack:source';
  }

  if (!head && !custom) throw badRequest('a phase, a mode, or a custom prompt is required');

  const prompt = head && custom ? `${head}\n\n${custom}` : head || custom;
  return { prompt, phase, mode };
}
