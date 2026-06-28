import { useState } from 'react';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ArrowLeft, Coins, Cpu, Database } from 'lucide-react';
import { PageHeader } from '@/components/AppShell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatCard } from '@/components/StatCard';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ErrorNote, Loading } from '@/components/ui/misc';
import { tokens as fmtTok, usd } from '@/lib/format';
import {
  useUsageByModel,
  useUsageByProject,
  useUsageSummary,
  useUsageTimeseries,
  type ByProjectRow,
  type ProjectSessionRow,
} from '@/features/ops/api';

const GREEN = '#29ffa0';
const CYAN = '#39d0ff';

export function UsagePage() {
  const [days, setDays] = useState(30);
  const [drill, setDrill] = useState<string | null>(null);
  const summary = useUsageSummary();
  const series = useUsageTimeseries(days);

  return (
    <div>
      <PageHeader
        title="Usage"
        subtitle={summary.data?.pricingNote ?? 'token consumption - cost is estimated'}
        actions={
          <Select value={days} onChange={(e) => setDays(Number(e.target.value))} className="h-8 w-28">
            <option value={7}>7 days</option>
            <option value={30}>30 days</option>
            <option value={90}>90 days</option>
          </Select>
        }
      />
      <div className="flex flex-col gap-4 p-6">
        {summary.isLoading ? (
          <Loading />
        ) : summary.isError ? (
          <ErrorNote error={summary.error} />
        ) : (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="Total tokens" value={fmtTok(summary.data?.total.total)} icon={<Database className="size-4" />} />
            <StatCard label="Input" value={fmtTok(summary.data?.total.input)} sub={`cache ${fmtTok(summary.data?.total.cacheRead)} read`} icon={<Cpu className="size-4" />} />
            <StatCard label="Output" value={fmtTok(summary.data?.total.output)} icon={<Cpu className="size-4" />} />
            <StatCard label="Est. cost" value={usd(summary.data?.total.costUsd)} sub="public list prices" icon={<Coins className="size-4" />} />
          </div>
        )}

        <Card>
          <CardHeader><CardTitle>Tokens & cost over time</CardTitle></CardHeader>
          <CardContent>
            {series.isLoading ? (
              <Loading />
            ) : (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={series.data ?? []} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id="tok" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={GREEN} stopOpacity={0.4} />
                        <stop offset="100%" stopColor={GREEN} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="rgba(120,255,180,0.08)" vertical={false} />
                    <XAxis dataKey="day" tick={{ fill: '#6b8079', fontSize: 11 }} tickFormatter={(d: string) => d.slice(5)} />
                    <YAxis yAxisId="t" tick={{ fill: '#6b8079', fontSize: 11 }} tickFormatter={(v: number) => fmtTok(v)} width={48} />
                    <YAxis yAxisId="c" orientation="right" tick={{ fill: '#6b8079', fontSize: 11 }} tickFormatter={(v: number) => `$${v.toFixed(0)}`} width={42} />
                    <Tooltip
                      contentStyle={{ background: '#0d1411', border: '1px solid rgba(120,255,180,0.2)', borderRadius: 8, fontSize: 12 }}
                      labelStyle={{ color: '#d7e6df' }}
                      formatter={(val: number, name: string) => (name === 'cost' ? usd(val) : fmtTok(val))}
                    />
                    <Area yAxisId="t" type="monotone" dataKey="total" name="tokens" stroke={GREEN} fill="url(#tok)" strokeWidth={2} />
                    <Line yAxisId="c" type="monotone" dataKey="costUsd" name="cost" stroke={CYAN} dot={false} strokeWidth={1.5} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ByModel />
          {drill ? <ProjectSessions project={drill} onBack={() => setDrill(null)} /> : <ByProject onDrill={setDrill} />}
        </div>
      </div>
    </div>
  );
}

function ByModel() {
  const q = useUsageByModel();
  return (
    <Card>
      <CardHeader><CardTitle>By model</CardTitle></CardHeader>
      <CardContent>
        {q.isLoading ? (
          <Loading />
        ) : (
          <Table>
            <THead>
              <TR><TH>Model</TH><TH>Tokens</TH><TH>Cost</TH><TH>Msgs</TH></TR>
            </THead>
            <TBody>
              {(q.data ?? []).map((m) => (
                <TR key={m.model}>
                  <TD className="font-mono text-xs">{m.model}</TD>
                  <TD>{fmtTok(m.total)}</TD>
                  <TD>{usd(m.costUsd)}</TD>
                  <TD className="text-muted">{m.messages}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function ByProject({ onDrill }: { onDrill: (p: string) => void }) {
  const q = useUsageByProject();
  const rows = (Array.isArray(q.data) ? q.data : []) as ByProjectRow[];
  return (
    <Card>
      <CardHeader><CardTitle>By project</CardTitle></CardHeader>
      <CardContent>
        {q.isLoading ? (
          <Loading />
        ) : (
          <Table>
            <THead>
              <TR><TH>Project</TH><TH>Tokens</TH><TH>Cost</TH><TH></TH></TR>
            </THead>
            <TBody>
              {rows.map((p) => (
                <TR key={p.project}>
                  <TD className="font-mono text-xs">
                    {p.project} {p.known ? <Badge tone="primary">known</Badge> : null}
                  </TD>
                  <TD>{fmtTok(p.total)}</TD>
                  <TD>{usd(p.costUsd)}</TD>
                  <TD>
                    <Button variant="ghost" size="sm" onClick={() => onDrill(p.project)}>
                      sessions
                    </Button>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function ProjectSessions({ project, onBack }: { project: string; onBack: () => void }) {
  const q = useUsageByProject(project);
  const [search, setSearch] = useState('');
  const data = (!Array.isArray(q.data) ? q.data?.sessions : []) as ProjectSessionRow[] | undefined;
  const rows = (data ?? []).filter(
    (s) => !search || (s.title ?? '').toLowerCase().includes(search.toLowerCase()) || s.claude_session_id.includes(search),
  );
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Sessions · {project}</CardTitle>
        <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft /> back</Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <Input placeholder="search sessions…" value={search} onChange={(e) => setSearch(e.target.value)} className="h-8" />
        <Table>
          <THead>
            <TR><TH>Session</TH><TH>Tokens</TH><TH>Cost</TH></TR>
          </THead>
          <TBody>
            {rows.map((s) => (
              <TR key={s.claude_session_id}>
                <TD className="text-xs">
                  {s.title ?? <span className="font-mono text-muted">{s.claude_session_id.slice(0, 8)}</span>}
                  {s.is_fork ? <Badge tone="neutral">fork</Badge> : null}
                </TD>
                <TD>{fmtTok(s.total)}</TD>
                <TD>{usd(s.costUsd)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </CardContent>
    </Card>
  );
}
