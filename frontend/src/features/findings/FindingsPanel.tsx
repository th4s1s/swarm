import { ShieldAlert } from 'lucide-react';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { Badge, SeverityBadge } from '@/components/ui/badge';
import { EmptyState, Loading } from '@/components/ui/misc';
import { severityRank } from '@/lib/format';
import { useFindings } from '@/features/sessions/api';

const VERDICT_TONE: Record<string, 'primary' | 'danger' | 'neutral'> = {
  TRUE_POSITIVE: 'primary',
  FALSE_POSITIVE: 'neutral',
  DUPLICATE: 'neutral',
};

export function FindingsPanel({ sessionId }: { sessionId: string }) {
  const q = useFindings(sessionId);
  if (q.isLoading) return <Loading label="Loading findings…" />;
  const snap = q.data;

  if (!snap || !snap.available || snap.findings.length + snap.groups.length === 0) {
    return (
      <EmptyState
        icon={<ShieldAlert className="size-7" />}
        title="No findings yet"
        hint="Run recon to map feature groups, then audit to surface findings."
      />
    );
  }

  const findings = [...snap.findings].sort(
    (a, b) => severityRank(a.severity) - severityRank(b.severity) || (a.group_id ?? '').localeCompare(b.group_id ?? ''),
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2 text-xs text-muted">
        <span>{snap.counts.groups} groups</span>·<span>{snap.counts.findings} findings</span>·
        <span className="text-primary">{snap.counts.true_positives} true-positive</span>
      </div>

      {snap.groups.length ? (
        <div className="flex flex-wrap gap-1.5">
          {snap.groups.map((g) => (
            <Badge key={g.id} tone="neutral" title={g.description ?? ''}>
              <span className="text-primary">{g.id}</span> {g.name}
              {g.status ? <span className="text-muted/70"> · {g.status}</span> : null}
            </Badge>
          ))}
        </div>
      ) : null}

      {findings.length ? (
        <Table>
          <THead>
            <TR>
              <TH>ID</TH>
              <TH>Severity</TH>
              <TH>Title</TH>
              <TH>CWE</TH>
              <TH>Location</TH>
              <TH>Verdict</TH>
            </TR>
          </THead>
          <TBody>
            {findings.map((f) => (
              <TR key={f.id}>
                <TD className="whitespace-nowrap font-mono text-xs text-muted">{f.final_id ?? f.id}</TD>
                <TD><SeverityBadge severity={f.severity} /></TD>
                <TD className="max-w-[22rem] truncate" title={f.title}>{f.title}</TD>
                <TD className="whitespace-nowrap text-xs text-muted">{f.cwe ?? '-'}</TD>
                <TD className="max-w-[14rem] truncate font-mono text-[11px] text-muted" title={f.location ?? ''}>
                  {f.location ?? '-'}
                </TD>
                <TD>
                  {f.verdict ? (
                    <Badge tone={VERDICT_TONE[f.verdict] ?? 'neutral'}>{f.verdict.replace('_', ' ').toLowerCase()}</Badge>
                  ) : (
                    <span className="text-xs text-muted">-</span>
                  )}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      ) : null}
    </div>
  );
}
