/**
 * Mirror of the backend `composePrompt` (backend/src/runner/prompt.ts) used to preview
 * the exact prompt that will be sent to the agent before a run is enqueued.
 */
export function composePreview(input: {
  phase?: string | null;
  mode?: string | null;
  findingId?: string | null;
  customPrompt?: string | null;
  compact?: boolean;
}): string {
  const custom = (input.customPrompt ?? '').trim();
  if (input.compact) return custom ? `/compact ${custom}` : '/compact';
  let head = '';
  if (input.phase) {
    head =
      input.phase === 'verify' && input.findingId
        ? `/vibehack:verify ${input.findingId}`
        : `/vibehack:${input.phase}`;
  } else if (input.mode) {
    head = input.mode === 'source' ? '/vibehack:source' : '/vibehack';
  }
  if (head && custom) return `${head}\n\n${custom}`;
  return head || custom;
}
