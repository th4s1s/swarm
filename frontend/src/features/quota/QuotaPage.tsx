import { Gauge, Mail, RefreshCw, ShieldCheck } from 'lucide-react';
import { PageHeader } from '@/components/AppShell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ErrorNote, Loading } from '@/components/ui/misc';
import { untilTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useQuota } from '@/features/ops/api';
import type { QuotaWindow } from '@/lib/types';

const WINDOW_LABEL: Record<string, string> = {
  session_5h: 'Current session (5h)',
  weekly_7d: 'Weekly (7d)',
};
function label(key: string): string {
  if (WINDOW_LABEL[key]) return WINDOW_LABEL[key];
  if (key.startsWith('weekly_')) return `Weekly · ${key.replace('weekly_', '')}`;
  return key;
}

export function QuotaPage() {
  const q = useQuota();
  return (
    <div>
      <PageHeader
        title="Quota"
        subtitle="Claude account usage windows - auto-refreshes every minute"
        actions={
          <Button variant="subtle" size="sm" onClick={() => q.refetch()} disabled={q.isFetching}>
            <RefreshCw className={q.isFetching ? 'animate-spin' : ''} /> Refresh
          </Button>
        }
      />
      <div className="p-6">
        {q.isLoading ? (
          <Loading />
        ) : q.isError ? (
          <ErrorNote error={q.error} />
        ) : (
          <div className="flex flex-col gap-4">
            <Card>
              <CardHeader><CardTitle>Account</CardTitle></CardHeader>
              <CardContent className="flex flex-wrap gap-6 text-sm">
                <Info icon={<Mail className="size-4" />} label="Email" value={q.data?.account.email ?? '-'} />
                <Info icon={<ShieldCheck className="size-4" />} label="Plan" value={q.data?.plan ?? '-'} />
                <Info icon={<Gauge className="size-4" />} label="Subscription" value={q.data?.account.subscriptionType ?? '-'} />
              </CardContent>
            </Card>

            {q.data?.error ? <ErrorNote error={q.data.error} /> : null}

            {q.data && Object.keys(q.data.quotas).length > 0 ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {Object.entries(q.data.quotas).map(([key, w]) => (
                  <Meter key={key} title={label(key)} w={w} />
                ))}
              </div>
            ) : !q.data?.error ? (
              <div className="text-sm text-muted">No quota windows reported.</div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

function Info({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-primary/70">{icon}</span>
      <div>
        <div className="text-[11px] uppercase tracking-wider text-muted">{label}</div>
        <div className="font-mono text-fg">{value}</div>
      </div>
    </div>
  );
}

function Meter({ title, w }: { title: string; w: QuotaWindow }) {
  const used = Math.min(100, Math.max(0, w.used));
  const hot = used >= 85;
  return (
    <Card>
      <CardContent>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-medium text-fg">{title}</span>
          <span className={cn('font-mono text-sm', hot ? 'text-danger' : 'text-primary')}>{used.toFixed(0)}%</span>
        </div>
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-surface-2">
          <div
            className={cn('h-full rounded-full transition-all', hot ? 'bg-danger' : 'bg-primary shadow-glow-sm')}
            style={{ width: `${used}%` }}
          />
        </div>
        <div className="mt-2 flex items-center justify-between text-[11px] text-muted">
          <span>{w.remaining.toFixed(0)}% remaining</span>
          <span>resets in {untilTime(w.resetsAt)}</span>
        </div>
      </CardContent>
    </Card>
  );
}
