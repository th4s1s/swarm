import { Ban, Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatusPill } from '@/components/StatusPill';
import { Badge } from '@/components/ui/badge';
import { Loading } from '@/components/ui/misc';
import { usd, relTime } from '@/lib/format';
import { useCancelRun, useDeleteRun, useRuns } from '@/features/sessions/api';

export function QueueList({ sessionId, onSelectRun }: { sessionId: string; onSelectRun: (runId: string) => void }) {
  const q = useRuns(sessionId);
  const cancel = useCancelRun(sessionId);
  const del = useDeleteRun(sessionId);

  if (q.isLoading) return <Loading label="Loading runs…" />;
  const runs = q.data ?? [];

  return (
    <div className="flex flex-col gap-1.5">
      {runs.length === 0 ? (
        <div className="px-1 text-xs text-muted">No runs yet.</div>
      ) : (
        runs.map((r) => {
          const label = r.phase ?? r.mode ?? 'custom';
          const active = r.status === 'running' || r.status === 'queued';
          return (
            <div
              key={r.id}
              className="flex items-center justify-between rounded-md border border-line bg-surface-2/40 px-2.5 py-1.5"
            >
              <button className="flex min-w-0 items-center gap-2 text-left" onClick={() => onSelectRun(r.id)}>
                <Badge tone={r.mode ? 'primary' : 'neutral'}>{label}</Badge>
                <StatusPill status={r.status} />
                <span className="truncate text-[11px] text-muted">
                  {r.total_cost_usd != null ? usd(r.total_cost_usd) : ''}{' '}
                  {r.started_at ? `· ${relTime(r.started_at)}` : ''}
                </span>
              </button>
              <div className="flex items-center gap-1">
                {r.status === 'queued' ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    title="Remove from queue"
                    disabled={del.isPending && del.variables === r.id}
                    onClick={() => del.mutate(r.id)}
                  >
                    {del.isPending && del.variables === r.id ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="size-3.5" />
                    )}
                  </Button>
                ) : null}
                {active ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    title="Cancel"
                    disabled={cancel.isPending && cancel.variables === r.id}
                    onClick={() => cancel.mutate(r.id)}
                  >
                    {cancel.isPending && cancel.variables === r.id ? (
                      <Loader2 className="size-3.5 animate-spin text-danger" />
                    ) : (
                      <Ban className="size-3.5 text-danger" />
                    )}
                  </Button>
                ) : null}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
