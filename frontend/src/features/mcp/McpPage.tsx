import { useState } from 'react';
import { Plug, Plus, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/AppShell';
import { Card } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input, Label, Select } from '@/components/ui/input';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTrigger } from '@/components/ui/dialog';
import { EmptyState, Loading } from '@/components/ui/misc';
import { useProjects } from '@/features/projects/api';
import { useAddMcp, useDeleteMcp, useMcp } from '@/features/ops/api';

export function McpPage() {
  const [scope, setScope] = useState<'user' | 'project'>('user');
  const [project, setProject] = useState('');
  const projects = useProjects();
  const q = useMcp(scope, scope === 'project' ? project : undefined);
  const del = useDeleteMcp();

  return (
    <div>
      <PageHeader
        title="MCP Servers"
        subtitle="Model Context Protocol servers — global (user) and per-project"
        actions={<AddMcpDialog scope={scope} project={project} />}
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
                {q.data.servers.map((s) => (
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
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        title="Remove"
                        onClick={() => del.mutate({ name: s.name, scope, project: scope === 'project' ? project : undefined })}
                      >
                        <Trash2 className="size-3.5 text-danger" />
                      </Button>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>
        )}
      </div>
    </div>
  );
}

function AddMcpDialog({ scope, project }: { scope: 'user' | 'project'; project: string }) {
  const add = useAddMcp();
  const [open, setOpen] = useState(false);
  const [transport, setTransport] = useState<'stdio' | 'http' | 'sse'>('stdio');
  const [name, setName] = useState('');
  const [command, setCommand] = useState('');
  const [args, setArgs] = useState('');
  const [url, setUrl] = useState('');

  const submit = () => {
    const base = { name, scope, project: scope === 'project' ? project : undefined };
    const body =
      transport === 'stdio'
        ? { ...base, transport, command, args: args.trim() ? args.trim().split(/\s+/) : undefined }
        : { ...base, transport, url };
    add.mutate(body, {
      onSuccess: () => {
        setOpen(false);
        setName('');
        setCommand('');
        setArgs('');
        setUrl('');
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" disabled={scope === 'project' && !project}>
          <Plus /> Add server
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader title="Add MCP server" description={`scope: ${scope}${scope === 'project' ? ` · ${project}` : ''}`} />
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <Label>Transport</Label>
            <Select value={transport} onChange={(e) => setTransport(e.target.value as 'stdio' | 'http' | 'sse')}>
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
            </>
          ) : (
            <div className="flex flex-col gap-1">
              <Label>URL</Label>
              <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://host/mcp" />
            </div>
          )}
          {add.isError ? <div className="text-xs text-danger">{(add.error as Error).message}</div> : null}
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={!name || (transport === 'stdio' ? !command : !url) || add.isPending}>
            {add.isPending ? 'Adding…' : 'Add'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
