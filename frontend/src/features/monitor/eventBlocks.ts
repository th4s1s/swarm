import type { ContentBlock, StreamEvent } from '@/lib/types';

export type Block =
  | { id: number; kind: 'banner'; model?: string; tools?: number; cwd?: string }
  | { id: number; kind: 'user'; text: string }
  | { id: number; kind: 'assistant'; text: string }
  | { id: number; kind: 'thinking'; text: string }
  | { id: number; kind: 'tool'; name: string; summary: string; variant: 'task' | 'workflow' | 'generic' }
  | { id: number; kind: 'command'; command: string }
  | { id: number; kind: 'file_edit'; path: string; summary: string }
  | { id: number; kind: 'tool_result'; text: string; isError: boolean }
  | { id: number; kind: 'result'; cost: number | null; durationMs: number | null; tokens: number | null; numTurns: number | null; isError: boolean }
  | { id: number; kind: 'note'; text: string; tone: 'muted' | 'error' };

type DistributiveOmit<T, K extends keyof never> = T extends unknown ? Omit<T, K> : never;
type NewBlock = DistributiveOmit<Block, 'id'>;

function asText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((c) => (typeof c === 'string' ? c : typeof c?.text === 'string' ? c.text : ''))
      .join('')
      .trim();
  }
  if (content && typeof content === 'object' && 'text' in content) return String((content as { text: unknown }).text);
  return content == null ? '' : JSON.stringify(content);
}

function summarizeInput(input: Record<string, unknown> | undefined): string {
  if (!input) return '';
  const keys = ['description', 'prompt', 'pattern', 'query', 'path', 'file_path', 'url', 'command'];
  for (const k of keys) {
    if (typeof input[k] === 'string' && input[k]) return truncate(String(input[k]), 120);
  }
  const s = JSON.stringify(input);
  return truncate(s, 120);
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + '…' : s;
}

const FILE_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit', 'Update']);

/** Build ordered terminal blocks from complete stream-json events (ignores partial deltas). */
export function buildBlocks(events: StreamEvent[]): Block[] {
  const blocks: Block[] = [];
  let id = 0;
  const push = (b: NewBlock) => blocks.push({ id: id++, ...b } as Block);

  for (const e of events) {
    const t = e.type;
    if (t === 'system') {
      if (e.subtype === 'init') {
        push({ kind: 'banner', model: e.model, tools: e.tools?.length, cwd: e.cwd });
      }
      // hook_started / hook_response: skip (noise)
      continue;
    }
    if (t === 'stream_event' || t === 'rate_limit_event') continue;
    if (t === '_stderr') {
      push({ kind: 'note', tone: 'muted', text: String(e.text ?? '').trim() });
      continue;
    }
    if (t === '_error' || t === '_nonjson') {
      push({ kind: 'note', tone: t === '_error' ? 'error' : 'muted', text: String(e.text ?? '').trim() });
      continue;
    }
    if (t === 'result') {
      const usage = e.usage ?? {};
      const tokens =
        (usage.input_tokens ?? 0) +
        (usage.output_tokens ?? 0) +
        (usage.cache_creation_input_tokens ?? 0) +
        (usage.cache_read_input_tokens ?? 0);
      push({
        kind: 'result',
        cost: e.total_cost_usd ?? null,
        durationMs: e.duration_ms ?? null,
        tokens: tokens || null,
        numTurns: e.num_turns ?? null,
        isError: e.is_error === true,
      });
      continue;
    }
    if (t === 'assistant' || t === 'user') {
      const content = e.message?.content;
      if (!Array.isArray(content)) {
        const text = asText(content ?? e.message);
        if (text) push({ kind: t === 'assistant' ? 'assistant' : 'user', text });
        continue;
      }
      for (const block of content as ContentBlock[]) {
        if (block.type === 'text' && block.text?.trim()) {
          push({ kind: t === 'assistant' ? 'assistant' : 'user', text: block.text.trim() });
        } else if (block.type === 'thinking' && block.thinking?.trim()) {
          push({ kind: 'thinking', text: block.thinking.trim() });
        } else if (block.type === 'tool_use') {
          const name = block.name ?? 'tool';
          if (name === 'Bash' && typeof block.input?.command === 'string') {
            push({ kind: 'command', command: block.input.command });
          } else if (FILE_TOOLS.has(name)) {
            const path = String(block.input?.file_path ?? block.input?.path ?? '');
            push({ kind: 'file_edit', path, summary: name });
          } else {
            const variant = name === 'Workflow' ? 'workflow' : name === 'Task' || name === 'Explore' ? 'task' : 'generic';
            push({ kind: 'tool', name, summary: summarizeInput(block.input), variant });
          }
        } else if (block.type === 'tool_result') {
          push({ kind: 'tool_result', text: truncate(asText(block.content), 4000), isError: block.is_error === true });
        }
      }
    }
  }
  return blocks;
}
