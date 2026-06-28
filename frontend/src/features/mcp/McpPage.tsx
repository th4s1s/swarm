import { useState } from 'react';
import { Loader2, Pencil, Plug, Plus, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/AppShell';
import { Card } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input, Label, Select, Textarea } from '@/components/ui/input';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTrigger } from '@/components/ui/dialog';
import { EmptyState, Loading } from '@/components/ui/misc';
import { useProjects } from '@/features/projects/api';
import { fetchMcpConfig, useAddMcp, useDeleteMcp, useMcp } from '@/features/ops/api';

type Transport = 'stdio' | 'http' | 'sse';

/** "KEY=value" lines <-> Record. */
function linesToRecord(text: string): Record<string, string> | undefined {
  const rec: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    const i = t.indexOf('=');
    if (i <= 0) continue;
    rec[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return Object.keys(rec).length ? rec : undefined;
}
function recordToLines(rec?: Record<string, string>): string {
  return rec ? Object.entries(rec).map(([k, v]) => `${k}=${v}`).join('\n') : '';
}

export function McpPage() {
  const [scope, setScope] = useState<'user' | 'project'>('user');
  const [project, setProject] = useState('');
  const projects = useProjects();
  const q = useMcp(scope, scope === 'project' ? project : undefined);
  const del = useDeleteMcp();
  const proj = scope === 'project' ? project : undefined;

  return (
    <div>
      <PageHeader
        title="MCP Servers"
        subtitle="Model Context Protocol servers - global (user) and per-project"
        actions={<McpServerDialog scope={scope} project={project} trigger={<Button size="sm" disabled={scope === 'project' && !project}><Plus /> Add server</Button>} />}
      />
      <div className="flex flex-col gap-4 p-6">
        <div className="flex items-center gap-3">
          <Tabs value={scope} onValueChange={(v) => setScope(v as 'user' | 'project')}>
            <TabsList>
              <TabsTrigger value="user">User (global)</TabsTrigger>
              <TabsTrigger value="project">Project</TabsTrigger>
            </TabsList>
          </Tabs>
          {scope === 'project' ? (
            <Select value={project} onChange={(e) => setProject(e.target.value)} className="h-8 w-56">
              <option value="">select project…</option>
              {(projects.data ?? []).map((p) => (
                <option key={p.id} value={p.name}>{p.name}</option>
              ))}
            </Select>
          ) : null}
        </div>

        {scope === 'project' && !project ? (
          <EmptyState icon={<Plug className="size-7" />} title="Pick a project" hint="Choose a project to see its .mcp.json servers." />
        ) : q.isLoading ? (
          <Loading />
        ) : !q.data?.servers.length ? (
          <EmptyState icon={<Plug className="size-7" />} title="No MCP servers" hint="Add one with the button above." />
        ) : (
          <Card>
            <Table>
              <THead>
                <TR><TH>Name</TH><TH>Transport</TH><TH>Command / URL</TH><TH>Extras</TH><TH></TH></TR>
              </THead>
              <TBody>
                {q.data.servers.map((s) => {
                  const deleting = del.isPending && del.variables?.name === s.name;
                  return (
                    <TR key={s.name}>
                      <TD className="font-medium text-fg">{s.name}</TD>
                      <TD><Badge tone="primary">{s.transport}</Badge></TD>
                      <TD className="max-w-[24rem] truncate font-mono text-xs text-muted">
                        {s.url ?? [s.command, ...(s.args ?? [])].join(' ')}
                      </TD>
                      <TD className="text-[11px] text-muted">
                        {s.hasEnv ? 'env ' : ''}{s.hasHeaders ? 'headers' : ''}
                      </TD>
                      <TD>
                        <div className="flex items-center justify-end gap-1">
                          <McpServerDialog
                            scope={scope}
                            project={project}
                            editName={s.name}
                            trigger={
                              <Button variant="ghost" size="icon" className="size-7" title="Edit">
                                <Pencil className="size-3.5" />
                              </Button>
                            }
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7"
                            title="Remove"
                            disabled={deleting}
                            onClick={() => del.mutate({ name: s.name, scope, project: proj })}
                          >
                            {deleting ? <Loader2 className="size-3.5 animate-spin text-danger" /> : <Trash2 className="size-3.5 text-danger" />}
                          </Button>
                        </div>
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </Card>
        )}
      </div>
    </div>
  );
}

function McpServerDialog({
  scope,
  project,
  editName,
  trigger,
}: {
  scope: 'user' | 'project';
  project: string;
  editName?: string;
  trigger: React.ReactNode;
}) {
  const add = useAddMcp();
  const del = useDeleteMcp();
  const isEdit = Boolean(editName);
  const proj = scope === 'project' ? project : undefined;

  const [open, setOpen] = useState(false);
  const [transport, setTransport] = useState<Transport>('stdio');
  const [name, setName] = useState('');
  const [command, setCommand] = useState('');
  const [args, setArgs] = useState('');
  const [url, setUrl] = useState('');
  const [env, setEnv] = useState('');
  const [headers, setHeaders] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadErr, setLoadErr] = useState('');

  const reset = () => {
    setTransport('stdio'); setName(''); setCommand(''); setArgs(''); setUrl(''); setEnv(''); setHeaders('');
    setLoadErr('');
  };

  const onOpenChange = async (o: boolean) => {
    setOpen(o);
    if (!o) return;
    reset();
    if (isEdit) {
      setLoading(true);
      try {
        const cfg = await fetchMcpConfig(editName!, scope, proj);
        setName(cfg.name);
        setTransport(cfg.transport === 'http' || cfg.transport === 'sse' ? cfg.transport : 'stdio');
        setCommand(cfg.command ?? '');
        setArgs((cfg.args ?? []).join(' '));
        setUrl(cfg.url ?? '');
        setEnv(recordToLines(cfg.env));
        setHeaders(recordToLines(cfg.headers));
      } catch (e) {
        setLoadErr((e as Error).message);
      } finally {
        setLoading(false);
      }
    }
  };

  const submit = () => {
    const base = { name, scope, project: proj };
    const body =
      transport === 'stdio'
        ? { ...base, transport, command, args: args.trim() ? args.trim().split(/\s+/) : undefined, env: linesToRecord(env) }
        : { ...base, transport, url, headers: linesToRecord(headers) };
    const apply = () => add.mutate(body, { onSuccess: () => setOpen(false) });
    // Edit = delete the existing server, then re-add (the name is the key, so this also renames).
    if (isEdit) {
      del.mutate({ name: editName!, scope, project: proj }, { onSuccess: apply });
    } else {
      apply();
    }
  };

  const busy = add.isPending || del.isPending;
  const invalid = !name || (transport === 'stdio' ? !command : !url);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader
          title={isEdit ? `Edit MCP server` : 'Add MCP server'}
          description={`scope: ${scope}${scope === 'project' ? ` · ${project}` : ''}`}
        />
        {loading ? (
          <Loading label="Loading server config…" />
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <Label>Transport</Label>
              <Select value={transport} onChange={(e) => setTransport(e.target.value as Transport)}>
                <option value="stdio">stdio</option>
                <option value="http">http</option>
                <option value="sse">sse</option>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="my-server" />
            </div>
            {transport === 'stdio' ? (
              <>
                <div className="flex flex-col gap-1">
                  <Label>Command</Label>
                  <Input value={command} onChange={(e) => setCommand(e.target.value)} placeholder="npx" />
                </div>
                <div className="flex flex-col gap-1">
                  <Label>Args (space-separated)</Label>
                  <Input value={args} onChange={(e) => setArgs(e.target.value)} placeholder="-y my-mcp-server" />
                </div>
                <div className="flex flex-col gap-1">
                  <Label>Env (one KEY=value per line)</Label>
                  <Textarea value={env} onChange={(e) => setEnv(e.target.value)} className="min-h-[64px]" placeholder={'API_KEY=...\nREGION=us'} />
                </div>
              </>
            ) : (
              <>
                <div className="flex flex-col gap-1">
                  <Label>URL</Label>
                  <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://host/mcp" />
                </div>
                <div className="flex flex-col gap-1">
                  <Label>Headers (one KEY=value per line)</Label>
                  <Textarea value={headers} onChange={(e) => setHeaders(e.target.value)} className="min-h-[64px]" placeholder={'Authorization=Bearer ...'} />
                </div>
              </>
            )}
            {loadErr ? <div className="text-xs text-danger">{loadErr}</div> : null}
            {add.isError ? <div className="text-xs text-danger">{(add.error as Error).message}</div> : null}
            {del.isError ? <div className="text-xs text-danger">{(del.error as Error).message}</div> : null}
          </div>
        )}
        <DialogFooter>
          <Button onClick={submit} disabled={invalid || busy || loading}>
            {busy ? <Loader2 className="animate-spin" /> : null}
            {busy ? 'Saving…' : isEdit ? 'Save changes' : 'Add'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
