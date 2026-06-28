import { useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Loader2, Play, RefreshCw, Square, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/AppShell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { StatusPill } from '@/components/StatusPill';
import { StatCard } from '@/components/StatCard';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { EmptyState, Loading } from '@/components/ui/misc';
import { bytes, dateTime } from '@/lib/format';
import {
  useContainerAction,
  useContainers,
  useDeleteContainers,
  useDeleteImages,
  useImages,
  useIo,
  useResourceStatus,
} from '@/features/ops/api';

export function ResourcesPage() {
  const status = useResourceStatus();
  return (
    <div>
      <PageHeader title="Resources" subtitle="Docker images, containers & system I/O" />
      <div className="p-6">
        {status.data && !status.data.dockerAvailable ? (
          <EmptyState title="Docker is not available" hint="The backend could not reach the Docker socket." />
        ) : (
          <Tabs defaultValue="containers">
            <TabsList>
              <TabsTrigger value="containers">Containers</TabsTrigger>
              <TabsTrigger value="images">Images</TabsTrigger>
              <TabsTrigger value="io">I/O</TabsTrigger>
            </TabsList>
            <TabsContent value="containers" className="mt-4"><Containers /></TabsContent>
            <TabsContent value="images" className="mt-4"><Images /></TabsContent>
            <TabsContent value="io" className="mt-4"><IoCharts /></TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  );
}

function useSelection() {
  const [sel, setSel] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setSel((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  return { sel, setSel, toggle };
}

function Containers() {
  const [search, setSearch] = useState('');
  const [statusF, setStatusF] = useState('');
  const q = useContainers(search, statusF);
  const action = useContainerAction();
  const del = useDeleteContainers();
  const { sel, setSel, toggle } = useSelection();
  const [confirm, setConfirm] = useState(false);

  const totals = q.data?.totals;
  const rows = q.data?.containers ?? [];

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Containers" value={totals?.count ?? '-'} />
        <StatCard label="Total CPU" value={`${(totals?.totalCpu ?? 0).toFixed(1)}%`} />
        <StatCard label="Total Mem" value={bytes(totals?.totalMem)} />
      </div>
      <div className="flex items-center gap-2">
        <Input placeholder="search name / image…" value={search} onChange={(e) => setSearch(e.target.value)} className="h-8 max-w-xs" />
        <Select value={statusF} onChange={(e) => setStatusF(e.target.value)} className="h-8 w-36">
          <option value="">all states</option>
          <option value="running">running</option>
          <option value="exited">exited</option>
          <option value="created">created</option>
        </Select>
        {sel.size > 0 ? (
          <Button variant="danger" size="sm" disabled={del.isPending} onClick={() => setConfirm(true)}>
            {del.isPending ? <Loader2 className="animate-spin" /> : <Trash2 />} {del.isPending ? 'Deleting…' : `Delete ${sel.size}`}
          </Button>
        ) : null}
      </div>

      {q.isLoading ? (
        <Loading />
      ) : (
        <Card>
          <Table>
            <THead>
              <TR>
                <TH className="w-8"></TH>
                <TH>Name</TH><TH>Image</TH><TH>Status</TH><TH>Ports</TH>
                <TH>CPU</TH><TH>Mem</TH><TH>PIDs</TH><TH></TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((c) => {
                const busy = action.isPending && action.variables?.id === c.id;
                return (
                <TR key={c.id}>
                  <TD><input type="checkbox" className="accent-[#29ffa0]" checked={sel.has(c.id)} onChange={() => toggle(c.id)} /></TD>
                  <TD className="font-medium text-fg">{c.name}</TD>
                  <TD className="font-mono text-xs text-muted">{c.image}</TD>
                  <TD><StatusPill status={c.state === 'running' ? 'running' : c.state} /></TD>
                  <TD className="max-w-[12rem] truncate font-mono text-[11px] text-muted" title={c.ports.join(', ')}>{c.ports.join(', ') || '-'}</TD>
                  <TD>{c.stats ? `${c.stats.cpuPerc.toFixed(1)}%` : '-'}</TD>
                  <TD className="text-xs">{c.stats ? `${bytes(c.stats.memUsage)} / ${bytes(c.stats.memLimit)}` : '-'}</TD>
                  <TD className="text-muted">{c.stats?.pids ?? '-'}</TD>
                  <TD>
                    <div className="flex items-center gap-1">
                      {busy ? (
                        <IconBtn title="Working…" disabled onClick={() => {}}><Loader2 className="size-3.5 animate-spin" /></IconBtn>
                      ) : c.state === 'running' ? (
                        <>
                          <IconBtn title="Stop" onClick={() => action.mutate({ id: c.id, action: 'stop' })}><Square className="size-3.5" /></IconBtn>
                          <IconBtn title="Restart" onClick={() => action.mutate({ id: c.id, action: 'restart' })}><RefreshCw className="size-3.5" /></IconBtn>
                        </>
                      ) : (
                        <IconBtn title="Start" onClick={() => action.mutate({ id: c.id, action: 'start' })}><Play className="size-3.5 text-primary" /></IconBtn>
                      )}
                    </div>
                  </TD>
                </TR>
                );
              })}
            </TBody>
          </Table>
        </Card>
      )}

      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={`Delete ${sel.size} container(s)?`}
        confirmLabel="Delete"
        danger
        onConfirm={() => del.mutate([...sel], { onSuccess: () => setSel(new Set()) })}
      />
    </div>
  );
}

function Images() {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('');
  const q = useImages(search, filter);
  const del = useDeleteImages();
  const { sel, setSel, toggle } = useSelection();
  const [confirm, setConfirm] = useState(false);
  const rows = q.data?.images ?? [];

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Images" value={q.data?.totals.count ?? '-'} />
        <StatCard label="Total size" value={bytes(q.data?.totals.totalSize)} />
      </div>
      <div className="flex items-center gap-2">
        <Input placeholder="search repository:tag…" value={search} onChange={(e) => setSearch(e.target.value)} className="h-8 max-w-xs" />
        <Select value={filter} onChange={(e) => setFilter(e.target.value)} className="h-8 w-36">
          <option value="">all</option>
          <option value="in-use">in use</option>
          <option value="unused">unused</option>
        </Select>
        {sel.size > 0 ? (
          <Button variant="danger" size="sm" disabled={del.isPending} onClick={() => setConfirm(true)}>
            {del.isPending ? <Loader2 className="animate-spin" /> : <Trash2 />} {del.isPending ? 'Deleting…' : `Delete ${sel.size}`}
          </Button>
        ) : null}
      </div>

      {q.isLoading ? (
        <Loading />
      ) : (
        <Card>
          <Table>
            <THead>
              <TR>
                <TH className="w-8"></TH>
                <TH>Repository</TH><TH>Tag</TH><TH>Image ID</TH><TH>Created</TH><TH>Size</TH><TH></TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((img) => (
                <TR key={`${img.id}-${img.repository}-${img.tag}`}>
                  <TD><input type="checkbox" className="accent-[#29ffa0]" checked={sel.has(img.id)} onChange={() => toggle(img.id)} /></TD>
                  <TD className="font-medium text-fg">{img.repository}</TD>
                  <TD className="font-mono text-xs text-muted">{img.tag}</TD>
                  <TD className="font-mono text-xs text-muted">{img.id}</TD>
                  <TD className="text-xs text-muted">{dateTime(new Date(img.created * 1000).toISOString())}</TD>
                  <TD>{bytes(img.size)}</TD>
                  <TD>{img.inUse ? <Badge tone="primary">in use</Badge> : <Badge tone="neutral">unused</Badge>}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}

      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={`Delete ${sel.size} image(s)?`}
        description="In-use images may fail to delete."
        confirmLabel="Delete"
        danger
        onConfirm={() => del.mutate([...sel], { onSuccess: () => setSel(new Set()) })}
      />
    </div>
  );
}

function IoCharts() {
  const q = useIo(60);
  const data = useMemo(() => {
    const s = q.data?.samples ?? [];
    return s.map((cur, i) => {
      const prev = i > 0 ? s[i - 1]! : cur;
      const d = (a: number, b: number) => Math.max(0, a - b);
      return {
        t: cur.ts.slice(11, 19),
        cpu: cur.cpu,
        mem: cur.mem,
        netIn: d(cur.net_in, prev.net_in),
        netOut: d(cur.net_out, prev.net_out),
        diskRead: d(cur.disk_read, prev.disk_read),
        diskWrite: d(cur.disk_write, prev.disk_write),
      };
    });
  }, [q.data]);

  if (q.isLoading) return <Loading />;
  if (!data.length) return <EmptyState title="No samples yet" hint="The sampler collects container stats every few seconds." />;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <IoChart title="Network (Δ bytes)" data={data} a="netIn" b="netOut" labelA="in" labelB="out" fmt={bytes} />
      <IoChart title="Disk (Δ bytes)" data={data} a="diskRead" b="diskWrite" labelA="read" labelB="write" fmt={bytes} />
      <IoChart title="CPU (%)" data={data} a="cpu" labelA="cpu" fmt={(v) => `${v.toFixed(0)}%`} />
      <IoChart title="Memory" data={data} a="mem" labelA="mem" fmt={bytes} />
    </div>
  );
}

function IoChart({
  title,
  data,
  a,
  b,
  labelA,
  labelB,
  fmt,
}: {
  title: string;
  data: Record<string, number | string>[];
  a: string;
  b?: string;
  labelA: string;
  labelB?: string;
  fmt: (v: number) => string;
}) {
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent>
        <div className="h-48 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="rgba(120,255,180,0.08)" vertical={false} />
              <XAxis dataKey="t" tick={{ fill: '#6b8079', fontSize: 10 }} minTickGap={40} />
              <YAxis tick={{ fill: '#6b8079', fontSize: 10 }} tickFormatter={fmt} width={52} />
              <Tooltip
                contentStyle={{ background: '#0d1411', border: '1px solid rgba(120,255,180,0.2)', borderRadius: 8, fontSize: 12 }}
                formatter={(v: number) => fmt(v)}
              />
              <Area type="monotone" dataKey={a} name={labelA} stroke="#29ffa0" fill="rgba(41,255,160,0.18)" strokeWidth={1.5} />
              {b ? <Area type="monotone" dataKey={b} name={labelB} stroke="#39d0ff" fill="rgba(57,208,255,0.14)" strokeWidth={1.5} /> : null}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

function IconBtn({
  title,
  onClick,
  children,
  disabled,
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <Button variant="ghost" size="icon" className="size-7" title={title} onClick={onClick} disabled={disabled}>
      {children}
    </Button>
  );
}
