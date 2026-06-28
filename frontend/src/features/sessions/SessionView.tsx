import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ArrowLeft, GitBranch, GitFork, Radio } from 'lucide-react';
import { PageHeader } from '@/components/AppShell';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select } from '@/components/ui/input';
import { StatusPill } from '@/components/StatusPill';
import { Badge } from '@/components/ui/badge';
import { ErrorNote, Loading } from '@/components/ui/misc';
import { cn } from '@/lib/utils';
import { qk } from '@/lib/query';
import { useSessionSocket } from '@/lib/ws';
import type { FamilyMember, StreamEvent, WsMessage } from '@/lib/types';
import { TerminalView } from '@/features/monitor/TerminalView';
import { JsonView } from '@/features/monitor/JsonView';
import { RunControls } from '@/features/monitor/RunControls';
import { QueueList } from '@/features/monitor/QueueList';
import { FindingsPanel } from '@/features/findings/FindingsPanel';
import { ReportView } from '@/features/findings/ReportView';
import { ForkDialog } from './ForkDialog';
import { SessionConfigCard } from './SessionConfigCard';
import { useRunEvents, useRunnerOptions, useRuns, useSession, useSessionFamily } from './api';

export function SessionView() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const session = useSession(id);
  const family = useSessionFamily(id);
  const options = useRunnerOptions();
  const runs = useRuns(id);
  const [viewRun, setViewRun] = useState<string>('live'); // 'live' or a runId
  const [monitorTab, setMonitorTab] = useState<'terminal' | 'json'>('terminal');

  const onWs = useMemo(
    () => (m: WsMessage) => {
      if (m.kind === 'run' && (m.status === 'done' || m.status === 'error' || m.status === 'canceled')) {
        qc.invalidateQueries({ queryKey: qk.findings(id) });
        qc.invalidateQueries({ queryKey: qk.report(id) });
        qc.invalidateQueries({ queryKey: qk.session(id) });
      }
      if (m.kind === 'run') qc.invalidateQueries({ queryKey: qk.runs(id) });
      if (m.kind === 'session' && m.claude_session_id) qc.invalidateQueries({ queryKey: qk.session(id) });
    },
    [id, qc],
  );

  const socket = useSessionSocket(id, onWs);
  const replay = useRunEvents(viewRun !== 'live' ? viewRun : undefined);

  if (session.isLoading) return <Loading />;
  if (session.isError || !session.data) return <div className="p-6"><ErrorNote error={session.error ?? 'not found'} /></div>;
  const s = session.data;

  const liveEvents: StreamEvent[] = socket.events.map((e) => e.event);
  const events: StreamEvent[] = viewRun === 'live' ? liveEvents : ((replay.data?.events ?? []) as StreamEvent[]);
  const running = s.status === 'running' || socket.sessionStatus === 'running';
  const liveInterval = running ? 4000 : false;
  const findings = s.audit.findings;
  const familyMembers = family.data?.members ?? [];

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <Link to={`/projects/${s.project.id}`} className="text-muted hover:text-fg">
              <ArrowLeft className="size-4" />
            </Link>
            {s.title}
            {s.is_fork ? <Badge tone="primary"><GitFork className="size-3" /> fork</Badge> : null}
          </span>
        }
        subtitle={
          <span className="flex items-center gap-2 font-mono">
            {s.project.name} / {s.session_name}
            {s.claude_session_id ? <span className="text-muted/60">· {s.claude_session_id.slice(0, 8)}</span> : null}
            <StatusPill status={running ? 'running' : s.status} />
            <span className={cn('flex items-center gap-1 text-[11px]', socket.connected ? 'text-primary' : 'text-muted')}>
              <Radio className="size-3" /> {socket.connected ? 'live' : 'offline'}
            </span>
          </span>
        }
        actions={<ForkDialog sessionId={s.id} findings={findings} disabled={!s.claude_session_id} />}
      />

      {/* Fork family tree (root + all forks, recursively) - always visible on every member */}
      {familyMembers.length > 1 ? <ForkTree members={familyMembers} currentId={s.id} /> : null}

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 p-4 lg:grid-cols-5">
        {/* Monitor + run controls */}
        <div className="flex min-h-0 flex-col lg:col-span-3">
          <Card className="flex min-h-0 flex-1 flex-col overflow-hidden p-0">
            <div className="flex items-center justify-between border-b border-line px-3 py-2">
              <Tabs value={monitorTab} onValueChange={(v) => setMonitorTab(v as 'terminal' | 'json')}>
                <TabsList>
                  <TabsTrigger value="terminal">Terminal</TabsTrigger>
                  <TabsTrigger value="json">JSON</TabsTrigger>
                </TabsList>
              </Tabs>
              <Select value={viewRun} onChange={(e) => setViewRun(e.target.value)} className="h-8 w-40">
                <option value="live">● Live</option>
                {(runs.data ?? []).map((r) => (
                  <option key={r.id} value={r.id}>
                    {(r.phase ?? r.mode ?? 'custom')} · {r.id.slice(0, 8)}
                  </option>
                ))}
              </Select>
            </div>
            <div className="min-h-0 flex-1">
              {monitorTab === 'terminal' ? (
                <TerminalView events={events} running={viewRun === 'live' && running} />
              ) : (
                <JsonView events={events} />
              )}
            </div>
          </Card>
          {options.data ? (
            <RunControls
              sessionId={id}
              phases={options.data.phases}
              modes={options.data.modes}
              findings={findings}
              running={running}
            />
          ) : null}
        </div>

        {/* Right: findings / report / queue / notes / config */}
        <div className="flex min-h-0 flex-col lg:col-span-2">
          <Tabs defaultValue="findings" className="flex min-h-0 flex-1 flex-col">
            <TabsList>
              <TabsTrigger value="findings">Findings</TabsTrigger>
              <TabsTrigger value="report">Report</TabsTrigger>
              <TabsTrigger value="queue">Queue</TabsTrigger>
              <TabsTrigger value="notes">Notes</TabsTrigger>
              <TabsTrigger value="config">Config</TabsTrigger>
            </TabsList>
            <Card className="mt-2 flex min-h-0 flex-1 flex-col overflow-hidden">
              <TabsContent value="findings" className="min-h-0 flex-1 overflow-y-auto p-3">
                <FindingsPanel sessionId={id} refetchInterval={liveInterval} />
              </TabsContent>
              <TabsContent value="report" className="min-h-0 flex-1 overflow-hidden">
                <ReportView sessionId={id} focusFindingId={s.fork_finding_id} refetchInterval={liveInterval} />
              </TabsContent>
              <TabsContent value="queue" className="min-h-0 flex-1 overflow-y-auto p-3">
                <QueueList sessionId={id} onSelectRun={(r) => setViewRun(r)} />
              </TabsContent>
              <TabsContent value="notes" className="min-h-0 flex-1 overflow-y-auto p-3">
                {s.resume_note ? (
                  <article className="markdown text-sm leading-relaxed text-fg/90">
                    <Markdown remarkPlugins={[remarkGfm]}>{s.resume_note}</Markdown>
                  </article>
                ) : (
                  <div className="text-xs text-muted">
                    No resume note yet. The audit writes one once recon/audit has run (it holds pipeline
                    state, the live-instance pointer, and the fork inventory).
                  </div>
                )}
              </TabsContent>
              <TabsContent value="config" className="min-h-0 flex-1 overflow-y-auto p-3">
                <SessionConfigCard sessionId={id} config={s.config} disabled={running} />
              </TabsContent>
            </Card>
          </Tabs>
        </div>
      </div>
    </div>
  );
}

/** Root + all forks (and forks of forks) as an indented tree, built from parent links. */
function ForkTree({ members, currentId }: { members: FamilyMember[]; currentId: string }) {
  const ids = new Set(members.map((m) => m.id));
  const byParent = new Map<string | null, FamilyMember[]>();
  for (const m of members) {
    // Treat a member whose parent is outside this family as a root, to be safe.
    const key = m.parent_session_id && ids.has(m.parent_session_id) ? m.parent_session_id : null;
    const list = byParent.get(key) ?? [];
    list.push(m);
    byParent.set(key, list);
  }
  const rows: { m: FamilyMember; depth: number }[] = [];
  const walk = (m: FamilyMember, depth: number) => {
    rows.push({ m, depth });
    for (const c of byParent.get(m.id) ?? []) walk(c, depth + 1);
  };
  for (const r of byParent.get(null) ?? []) walk(r, 0);

  return (
    <div className="flex flex-col gap-1 border-b border-line px-6 py-2">
      <span className="text-[11px] uppercase tracking-wider text-muted">sessions</span>
      <div className="flex flex-col items-start gap-1">
        {rows.map(({ m, depth }) => (
          <Link
            key={m.id}
            to={`/sessions/${m.id}`}
            style={{ marginLeft: depth * 18 }}
            title={m.fork_finding_id ? `verifies ${m.fork_finding_id}` : undefined}
            className={cn(
              'flex w-fit items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs',
              m.id === currentId
                ? 'border-primary/60 bg-primary-dim text-primary'
                : 'border-line text-muted hover:text-fg',
            )}
          >
            {depth > 0 ? <span className="text-muted/50">└</span> : null}
            {m.is_fork ? <GitFork className="size-3" /> : <GitBranch className="size-3" />}
            {m.title}
            {m.fork_finding_id ? <span className="font-mono text-[10px] text-muted/70">{m.fork_finding_id}</span> : null}
            <StatusPill status={m.status} className="text-[10px]" />
          </Link>
        ))}
      </div>
    </div>
  );
}
