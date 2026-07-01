/**
 * Selectable Claude models for the run/session/default pickers. Ids are the `claude --model`
 * values: '' means "use the account default", the short aliases (`opus`/`sonnet`/`haiku`) always
 * resolve to the latest release of that tier, and a full id can still be typed via the UI's
 * "Custom" escape hatch. Labels show the current concrete version for reference.
 *
 * The `claude` CLI has no list-models command and the app authenticates via OAuth (no API key),
 * so this curated list is the source of truth; update it when the model lineup changes.
 */
export interface ModelOption {
  id: string;
  label: string;
}

export const MODELS: ModelOption[] = [
  { id: '', label: 'Default (account setting)' },
  { id: 'opus', label: 'Opus 4.8 (claude-opus-4-8)' },
  { id: 'sonnet', label: 'Sonnet 4.6 (claude-sonnet-4-6)' },
  { id: 'haiku', label: 'Haiku 4.5 (claude-haiku-4-5-20251001)' },
];
