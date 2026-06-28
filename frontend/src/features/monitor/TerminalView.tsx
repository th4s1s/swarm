import { useEffect, useMemo, useRef } from 'react';
import {
  AlertTriangle,
  Brain,
  CheckCircle2,
  ChevronRight,
  FileEdit,
  Network,
  Terminal,
  Workflow as WorkflowIcon,
  XCircle,
} from 'lucide-react';
import type { StreamEvent } from '@/lib/types';
import { usd, tokens as fmtTokens } from '@/lib/format';
import { buildBlocks, type Block } from './eventBlocks';

export function TerminalView({ events, running }: { events: StreamEvent[]; running: boolean }) {
  const blocks = useMemo(() => buildBlocks(events), [events]);
  const ref = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);

  useEffect(() => {
    const el = ref.current;
    if (el && atBottom.current) el.scrollTop = el.scrollHeight;
  }, [blocks.length]);

  return (
    <div
      ref={ref}
      onScroll={(e) => {
        const el = e.currentTarget;
        atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
      }}
      className="h-full overflow-y-auto bg-[#060908] p-4 font-mono text-[13px] leading-relaxed"
    >
      {blocks.length === 0 ? (
        <div className="text-muted">
          {running ? 'Waiting for output…' : 'No output yet. Pick a phase or type a prompt and Run.'}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {blocks.map((b) => (
            <BlockRow key={b.id} b={b} />
          ))}
          {running ? (
            <div className="flex items-center gap-2 text-primary">
              <span className="size-2 animate-pulse-glow rounded-full bg-primary" /> running…
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function BlockRow({ b }: { b: Block }) {
  switch (b.kind) {
    case 'banner':
      return (
        <div className="rounded-md border border-primary/30 bg-primary-dim/40 px-3 py-1.5 text-xs text-primary">
          ● session started · {b.model ?? 'model'} · {b.tools ?? 0} tools{b.cwd ? ` · ${b.cwd}` : ''}
        </div>
      );
    case 'user':
      return (
        <div className="flex gap-2 text-fg">
          <ChevronRight className="mt-0.5 size-4 shrink-0 text-primary" />
          <span className="whitespace-pre-wrap break-words text-primary/90">{b.text}</span>
        </div>
      );
    case 'assistant':
      return <div className="whitespace-pre-wrap break-words text-fg/90">{b.text}</div>;
    case 'thinking':
      return (
        <div className="flex gap-2 text-muted/80">
          <Brain className="mt-0.5 size-3.5 shrink-0" />
          <span className="whitespace-pre-wrap break-words italic">{b.text}</span>
        </div>
      );
    case 'command':
      return (
        <div className="rounded-md border border-line bg-surface-2/60 px-3 py-1.5">
          <div className="mb-0.5 flex items-center gap-1.5 text-[11px] text-muted">
            <Terminal className="size-3" /> bash
          </div>
          <code className="whitespace-pre-wrap break-words text-sev-low">$ {b.command}</code>
        </div>
      );
    case 'file_edit':
      return (
        <div className="flex items-center gap-2 text-fg/80">
          <FileEdit className="size-4 shrink-0 text-primary" />
          <span className="text-muted">{b.summary}</span>
          <code className="break-all text-fg">{b.path}</code>
        </div>
      );
    case 'tool':
      return (
        <div className="flex items-start gap-2">
          {b.variant === 'workflow' ? (
            <WorkflowIcon className="mt-0.5 size-4 shrink-0 text-primary" />
          ) : b.variant === 'task' ? (
            <Network className="mt-0.5 size-4 shrink-0 text-primary" />
          ) : (
            <span className="mt-0.5 text-primary">⏺</span>
          )}
          <div className="min-w-0">
            <span className="font-semibold text-fg">{b.name}</span>
            {b.summary ? <span className="ml-2 break-words text-muted">{b.summary}</span> : null}
          </div>
        </div>
      );
    case 'tool_result':
      return (
        <div
          className={`ml-6 max-h-48 overflow-y-auto whitespace-pre-wrap break-words rounded border-l-2 ${
            b.isError ? 'border-danger/60 text-danger/90' : 'border-line text-muted'
          } bg-surface-2/30 px-3 py-1 text-xs`}
        >
          {b.text || '(no output)'}
        </div>
      );
    case 'result':
      return (
        <div
          className={`flex flex-wrap items-center gap-3 rounded-md border px-3 py-2 text-xs ${
            b.isError ? 'border-danger/40 bg-danger/10 text-danger' : 'border-primary/40 bg-primary-dim text-primary'
          }`}
        >
          {b.isError ? <XCircle className="size-4" /> : <CheckCircle2 className="size-4" />}
          <span className="font-semibold">{b.isError ? 'run failed' : 'run complete'}</span>
          {b.cost != null ? <span>· {usd(b.cost)}</span> : null}
          {b.tokens != null ? <span>· {fmtTokens(b.tokens)} tok</span> : null}
          {b.durationMs != null ? <span>· {(b.durationMs / 1000).toFixed(1)}s</span> : null}
          {b.numTurns != null ? <span>· {b.numTurns} turns</span> : null}
        </div>
      );
    case 'note':
      return (
        <div className={`flex items-start gap-1.5 text-xs ${b.tone === 'error' ? 'text-danger' : 'text-muted/70'}`}>
          {b.tone === 'error' ? <AlertTriangle className="mt-0.5 size-3 shrink-0" /> : null}
          <span className="whitespace-pre-wrap break-words">{b.text}</span>
        </div>
      );
  }
}
