import { useState } from 'react';
import { Play, Send, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea, Input, Select } from '@/components/ui/input';
import { cn } from '@/lib/utils';
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
}: {
  sessionId: string;
  phases: string[];
  modes: string[];
  findings: AuditFinding[];
  running: boolean;
}) {
  const enqueue = useEnqueueRun(sessionId);
  const steer = useSteer(sessionId);
  const stop = useStopSession(sessionId);

  const [phase, setPhase] = useState<string | null>(null);
  const [mode, setMode] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('');
  const [findingId, setFindingId] = useState('');
  const [steerText, setSteerText] = useState('');

  const tps = findings.filter((f) => f.verdict === 'TRUE_POSITIVE');
  const canRun = Boolean(phase || mode || prompt.trim()) && !(phase === 'verify' && !findingId);

  const run = () => {
    enqueue.mutate(
      {
        phase: phase ?? undefined,
        mode: mode ?? undefined,
        customPrompt: prompt.trim() || undefined,
        findingId: phase === 'verify' ? findingId : undefined,
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
            }}
          >
            {m}
          </button>
        ))}
      </div>

      {phase === 'verify' ? (
        <Select value={findingId} onChange={(e) => setFindingId(e.target.value)}>
          <option value="">select a true-positive finding to verify…</option>
          {tps.map((f) => (
            <option key={f.id} value={f.id}>
              {f.final_id ? `${f.final_id} · ` : ''}
              {f.id} — {f.title}
            </option>
          ))}
        </Select>
      ) : null}

      <Textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Custom prompt — appended to the selected phase/mode, or sent on its own."
        className="min-h-[64px]"
      />

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
            <Square /> Stop
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
