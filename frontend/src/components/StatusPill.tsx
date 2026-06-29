import { cn } from '@/lib/utils';

const MAP: Record<string, { dot: string; text: string; pulse?: boolean }> = {
  running: { dot: 'bg-primary', text: 'text-primary', pulse: true },
  queued: { dot: 'bg-sev-low', text: 'text-sev-low' },
  done: { dot: 'bg-primary-strong', text: 'text-primary-strong' },
  idle: { dot: 'bg-muted', text: 'text-muted' },
  error: { dot: 'bg-danger', text: 'text-danger' },
  canceled: { dot: 'bg-muted', text: 'text-muted' },
  // MCP server statuses
  connected: { dot: 'bg-primary', text: 'text-primary' },
  failed: { dot: 'bg-danger', text: 'text-danger' },
  'needs-auth': { dot: 'bg-warn', text: 'text-warn' },
  checking: { dot: 'bg-muted', text: 'text-muted', pulse: true },
  unknown: { dot: 'bg-muted', text: 'text-muted' },
};

const LABEL: Record<string, string> = {
  'needs-auth': 'needs auth',
  checking: 'checking…',
};

export function StatusPill({ status, className }: { status: string; className?: string }) {
  const m = MAP[status] ?? MAP.idle!;
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs font-medium', m.text, className)}>
      <span className={cn('size-1.5 rounded-full', m.dot, m.pulse && 'animate-pulse-glow')} />
      {LABEL[status] ?? status}
    </span>
  );
}
