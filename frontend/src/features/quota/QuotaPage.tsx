import { DollarSign, Gauge, Mail, RefreshCw, ShieldCheck } from 'lucide-react';
import { PageHeader } from '@/components/AppShell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ErrorNote, Loading } from '@/components/ui/misc';
import { untilTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useQuota } from '@/features/ops/api';
import type { ExtraUsageInfo, Money, QuotaResult, QuotaWindow, SpendInfo } from '@/lib/types';

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
        subtitle="Claude account usage and spend - auto-refreshes every minute"
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

            {q.data && hasSpend(q.data) ? <SpendCard spend={q.data.spend} extra={q.data.extraUsage} /> : null}

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

/** True when the account carries a dollar/credits spend limit worth showing (a Console/credits
 * org). Subscription accounts report these disabled/empty, so the card stays hidden for them. */
function hasSpend(q?: QuotaResult): boolean {
  if (!q) return false;
  const s = q.spend;
  const e = q.extraUsage;
  return Boolean(
    s?.enabled ||
      s?.limit ||
      (s?.used && s.used.amountMinor > 0) ||
      e?.isEnabled ||
      e?.monthlyLimit != null ||
      e?.usedCredits != null,
  );
}

function fmtAmount(v: number, currency: string | null | undefined): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency || 'USD' }).format(v);
  } catch {
    return `${v.toFixed(2)} ${currency || ''}`.trim();
  }
}
/** Money is stored in minor units: dollars = amountMinor / 10**exponent. */
function fmtMoney(m: Money | null | undefined): string | null {
  if (!m || typeof m.amountMinor !== 'number') return null;
  return fmtAmount(m.amountMinor / Math.pow(10, m.exponent ?? 2), m.currency);
}
/** extra_usage amounts follow the same minor-unit convention, scaled by decimal_places. */
function fmtByDecimals(
  value: number | null | undefined,
  dp: number | null | undefined,
  currency: string | null | undefined,
): string | null {
  if (typeof value !== 'number') return null;
  return fmtAmount(value / Math.pow(10, dp ?? 2), currency);
}

function SpendCard({ spend, extra }: { spend: SpendInfo | null; extra: ExtraUsageInfo | null }) {
  const used = fmtMoney(spend?.used);
  const limit = fmtMoney(spend?.limit);
  const balance = fmtMoney(spend?.balance);
  const cap = fmtMoney(spend?.cap);
  const creditsUsed = fmtByDecimals(extra?.usedCredits, extra?.decimalPlaces, extra?.currency);
  const creditsLimit = fmtByDecimals(extra?.monthlyLimit, extra?.decimalPlaces, extra?.currency);
  const pct = Math.min(100, Math.max(0, spend?.percent ?? extra?.utilization ?? 0));
  const hot = pct >= 85 || spend?.severity === 'warning' || spend?.severity === 'critical';
  const headline =
    used && limit
      ? `${used} / ${limit}`
      : creditsUsed && creditsLimit
        ? `${creditsUsed} / ${creditsLimit}`
        : used ?? creditsUsed ?? `${pct.toFixed(0)}%`;
  return (
    <Card>
      <CardContent>
        <div className="mb-2 flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-sm font-medium text-fg">
            <DollarSign className="size-4 text-primary/70" /> Monthly spend
          </span>
          <span className={cn('font-mono text-sm', hot ? 'text-danger' : 'text-primary')}>{headline}</span>
        </div>
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-surface-2">
          <div
            className={cn('h-full rounded-full transition-all', hot ? 'bg-danger' : 'bg-primary shadow-glow-sm')}
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted">
          <span>{pct.toFixed(0)}% used</span>
          {balance ? <span>balance {balance}</span> : null}
          {cap ? <span>cap {cap}</span> : null}
          {extra?.isEnabled && (creditsUsed || creditsLimit) ? (
            <span>
              usage credits {creditsUsed ?? '-'}
              {creditsLimit ? ` / ${creditsLimit}` : ''}
            </span>
          ) : null}
          {spend && !spend.enabled && spend.disabledReason ? (
            <span>({spend.disabledReason.replace(/_/g, ' ')})</span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
