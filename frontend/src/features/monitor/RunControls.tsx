import { useState } from 'react';
import { Loader2, Play, Send, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea, Input, Select } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { composePreview } from '@/lib/runPrompt';
import type { AuditFinding } from '@/lib/types';
import { useEnqueueRun, useSteer, useStopSession } from '@/features/sessions/api';

const PHASE_LABEL: Record<string, string> = {
  recon: 'recon',
  deploy: 'deploy',
  audit: 'audit',
  fpcheck: 'fpcheck',
  verify: 'verify',
  report: 'report',
};

export function RunControls({
  sessionId,
  phases,
  modes,
  findings,
  running,
  canCompact = false,
}: {
  sessionId: string;
  phases: string[];
  modes: string[];
  findings: AuditFinding[];
  running: boolean;
  canCompact?: boolean;
}) {
  const enqueue = useEnqueueRun(sessionId);
  const steer = useSteer(sessionId);
  const stop = useStopSession(sessionId);

  const [phase, setPhase] = useState<string | null>(null);
  const [mode, setMode] = useState<string | null>(null);
  const [compact, setCompact] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [findingId, setFindingId] = useState('');
  const [steerText, setSteerText] = useState('');

  const tps = findings.filter((f) => f.verdict === 'TRUE_POSITIVE');
  const canRun =
    Boolean(phase || mode || compact || prompt.trim()) && !(phase === 'verify' && !findingId);
  const preview = composePreview({ phase, mode, findingId, customPrompt: prompt, compact });

  const run = () => {
    enqueue.mutate(
      {
        phase: phase ?? undefined,
        mode: mode ?? undefined,
        customPrompt: prompt.trim() || undefined,
        findingId: phase === 'verify' ? findingId : undefined,
        compact: compact || undefined,
      },
      { onSuccess: () => setPrompt('') },
    );
  };

  const chip = (active: boolean) =>
    cn(
      'rounded-md border px-2.5 py-1 text-xs font-medium transition-colors',
      active
        ? 'border-primary/60 bg-primary-dim text-primary shadow-glow-sm'
        : 'border-line text-muted hover:border-primary/40 hover:text-fg',
    );

  return (
    <div className="flex flex-col gap-3 border-t border-line bg-surface/60 p-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[11px] uppercase tracking-wider text-muted">phase</span>
        {phases.map((p) => (
          <button
            key={p}
            className={chip(phase === p)}
            onClick={() => {
              setPhase(phase === p ? null : p);
              setMode(null);
              setCompact(false);
            }}
          >
            {PHASE_LABEL[p] ?? p}
          </button>
        ))}
        <span className="mx-1 text-line">|</span>
        <span className="mr-1 text-[11px] uppercase tracking-wider text-muted">mode</span>
        {modes.map((m) => (
          <button
            key={m}
            className={chip(mode === m)}
            onClick={() => {
              setMode(mode === m ? null : m);
              setPhase(null);
              setCompact(false);
            }}
          >
            {m}
          </button>
        ))}
        <span className="mx-1 text-line">|</span>
        <span className="mr-1 text-[11px] uppercase tracking-wider text-muted">context</span>
        <button
          className={cn(chip(compact), 'disabled:cursor-not-allowed disabled:opacity-40')}
          disabled={!canCompact}
          title={canCompact ? 'Compact the conversation context' : 'Run a phase first (no session yet)'}
          onClick={() => {
            const next = !compact;
            setCompact(next);
            if (next) {
              setPhase(null);
              setMode(null);
            }
          }}
        >
          compact
        </button>
      </div>

      {phase === 'verify' ? (
        <Select value={findingId} onChange={(e) => setFindingId(e.target.value)}>
          <option value="">select a true-positive finding to verify…</option>
          {tps.map((f) => (
            <option key={f.id} value={f.id}>
              {f.final_id ? `${f.final_id} · ` : ''}
              {f.id} - {f.title}
            </option>
          ))}
        </Select>
      ) : null}

      <Textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder={
          compact
            ? 'Optional compact instructions (what to keep / focus the summary on).'
            : 'Custom prompt - appended to the selected phase/mode, or sent on its own.'
        }
        className="min-h-[64px]"
      />

      {canRun ? (
        <div className="rounded-md border border-line bg-surface-2/40 px-3 py-2">
          <div className="mb-1 text-[11px] uppercase tracking-wider text-muted">prompt sent to agent</div>
          <pre className="max-h-32 overflow-y-auto whitespace-pre-wrap break-words font-mono text-xs text-fg/80">{preview}</pre>
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button onClick={run} disabled={!canRun || enqueue.isPending}>
            <Play /> Run
          </Button>
          <Button
            variant="danger"
            size="sm"
            disabled={!running || stop.isPending}
            onClick={() => stop.mutate()}
            title="Cancel active run and clear the queue"
          >
            {stop.isPending ? <Loader2 className="animate-spin" /> : <Square />} {stop.isPending ? 'Stopping…' : 'Stop'}
          </Button>
        </div>
        <div className="flex items-center gap-1.5">
          <Input
            value={steerText}
            onChange={(e) => setSteerText(e.target.value)}
            placeholder="steer (priority prompt)…"
            className="h-8 w-56"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && steerText.trim()) {
                steer.mutate(steerText.trim(), { onSuccess: () => setSteerText('') });
              }
            }}
          />
          <Button
            variant="subtle"
            size="sm"
            disabled={!steerText.trim() || steer.isPending}
            onClick={() => steer.mutate(steerText.trim(), { onSuccess: () => setSteerText('') })}
          >
            <Send /> Steer
          </Button>
        </div>
      </div>
      {enqueue.isError ? <div className="text-xs text-danger">{(enqueue.error as Error).message}</div> : null}
    </div>
  );
}
