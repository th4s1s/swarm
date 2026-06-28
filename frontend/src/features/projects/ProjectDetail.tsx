import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Check,
  GitBranch,
  RefreshCw,
  Save,
  Trash2,
  UploadCloud,
} from 'lucide-react';
import { PageHeader } from '@/components/AppShell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Label, Select, Textarea } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { StatusPill } from '@/components/StatusPill';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { ErrorNote, Loading } from '@/components/ui/misc';
import { shortSha } from '@/lib/format';
import { NewSessionDialog } from '@/features/sessions/NewSessionDialog';
import {
  useApplyUpdate,
  useBranches,
  useCheckUpdates,
  useCheckout,
  useDeleteProject,
  useProject,
  useReuploadZip,
  useUpdateProject,
} from './api';
import type { UpdateStatus } from '@/lib/types';

export function ProjectDetailPage() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const q = useProject(id);
  const del = useDeleteProject();
  const [confirmDel, setConfirmDel] = useState(false);

  if (q.isLoading) return <Loading />;
  if (q.isError || !q.data) return <div className="p-6"><ErrorNote error={q.error ?? 'not found'} /></div>;
  const p = q.data;

  return (
    <div>
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <Link to="/projects" className="text-muted hover:text-fg">
              <ArrowLeft className="size-4" />
            </Link>
            {p.title}
            <Badge tone={p.is_git ? 'primary' : 'neutral'}>{p.source_type}</Badge>
          </span>
        }
        subtitle={<span className="font-mono">{p.name}</span>}
        actions={
          <Button variant="danger" size="sm" onClick={() => setConfirmDel(true)}>
            <Trash2 /> Delete
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-4 p-6 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <MetaCard id={id} title={p.title} description={p.description} />
          {p.is_git ? <GitCard id={id} currentRef={p.current_ref} currentCommit={p.current_commit} /> : <ZipCard id={id} />}
          <LiveNoteCard id={id} note={p.live_instance_note} />
        </div>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Sessions</CardTitle>
              <NewSessionDialog projectId={id} />
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {!p.sessions.length ? (
                <div className="text-xs text-muted">No sessions yet. Create one to start auditing.</div>
              ) : (
                p.sessions.map((s) => (
                  <Link
                    key={s.id}
                    to={`/sessions/${s.id}`}
                    className="flex items-center justify-between rounded-md border border-line bg-surface-2/40 px-3 py-2 hover:border-primary/50"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm text-fg">{s.title}</div>
                      <div className="truncate font-mono text-[11px] text-muted">{s.session_name}</div>
                    </div>
                    <StatusPill status={s.status} />
                  </Link>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDel}
        onOpenChange={setConfirmDel}
        title={`Delete "${p.title}"?`}
        description="Removes the project and its source dir. Audit reports are kept unless you purge them."
        confirmLabel="Delete project"
        danger
        onConfirm={() => del.mutate({ id }, { onSuccess: () => nav('/projects') })}
      />
    </div>
  );
}

function MetaCard({ id, title, description }: { id: string; title: string; description: string | null }) {
  const upd = useUpdateProject(id);
  const [t, setT] = useState(title);
  const [d, setD] = useState(description ?? '');
  const dirty = t !== title || d !== (description ?? '');
  return (
    <Card>
      <CardHeader><CardTitle>Details</CardTitle></CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <Label>Title</Label>
          <Input value={t} onChange={(e) => setT(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <Label>Description</Label>
          <Textarea value={d} onChange={(e) => setD(e.target.value)} className="min-h-[56px]" />
        </div>
        <Button
          size="sm"
          className="self-start"
          disabled={!dirty || upd.isPending}
          onClick={() => upd.mutate({ title: t, description: d || null })}
        >
          <Save /> Save
        </Button>
      </CardContent>
    </Card>
  );
}

function GitCard({ id, currentRef, currentCommit }: { id: string; currentRef: string | null; currentCommit: string | null }) {
  const branches = useBranches(id, true);
  const checkout = useCheckout(id);
  const check = useCheckUpdates(id);
  const apply = useApplyUpdate(id);
  const [ref, setRef] = useState('');
  const [token, setToken] = useState('');
  const status: UpdateStatus | undefined = check.data;

  return (
    <Card>
      <CardHeader><CardTitle>Git</CardTitle></CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center gap-2 text-sm">
          <GitBranch className="size-4 text-primary" />
          <span className="font-mono">{currentRef ?? '—'}</span>
          <span className="text-muted">@ {shortSha(currentCommit)}</span>
        </div>

        <div className="flex flex-col gap-1">
          <Label>Checkout branch / tag</Label>
          <div className="flex gap-2">
            <Select value={ref} onChange={(e) => setRef(e.target.value)}>
              <option value="">select…</option>
              {branches.data && (
                <>
                  <optgroup label="branches">
                    {branches.data.branches.map((b) => (
                      <option key={`b-${b}`} value={b}>{b}</option>
                    ))}
                  </optgroup>
                  <optgroup label="tags">
                    {branches.data.tags.map((t) => (
                      <option key={`t-${t}`} value={t}>{t}</option>
                    ))}
                  </optgroup>
                </>
              )}
            </Select>
            <Button
              size="sm"
              disabled={!ref || checkout.isPending}
              onClick={() => checkout.mutate(ref)}
            >
              {checkout.isPending ? '…' : 'Checkout'}
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-2 border-t border-line pt-3">
          <Label>Updates (token optional for private repos)</Label>
          <div className="flex gap-2">
            <Input type="password" placeholder="token" value={token} onChange={(e) => setToken(e.target.value)} />
            <Button size="sm" variant="subtle" disabled={check.isPending} onClick={() => check.mutate(token || undefined)}>
              <RefreshCw className={check.isPending ? 'animate-spin' : ''} /> Check
            </Button>
          </div>
          {status ? (
            status.hasUpdates ? (
              <div className="flex items-center justify-between rounded-md border border-primary/40 bg-primary-dim px-3 py-2">
                <div className="text-xs text-primary">
                  Updates available — behind {status.behind}
                  {status.newTags.length ? `, ${status.newTags.length} new tag(s)` : ''}
                </div>
                <Button size="sm" disabled={apply.isPending} onClick={() => apply.mutate({ token: token || undefined })}>
                  Update
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-xs text-muted"><Check className="size-3.5 text-primary" /> Up to date</div>
            )
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function ZipCard({ id }: { id: string }) {
  const reupload = useReuploadZip(id);
  const [file, setFile] = useState<File | null>(null);
  return (
    <Card>
      <CardHeader><CardTitle>Source (zip)</CardTitle></CardHeader>
      <CardContent className="flex flex-col gap-3">
        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-line bg-surface-2/40 px-4 py-6 hover:border-primary/50">
          <UploadCloud className="size-5 text-primary/70" />
          <span className="text-sm">{file ? file.name : 'Re-upload a .zip (replaces current source)'}</span>
          <input type="file" accept=".zip" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </label>
        <Button
          size="sm"
          className="self-start"
          disabled={!file || reupload.isPending}
          onClick={() => {
            if (!file) return;
            const f = new FormData();
            f.set('file', file);
            reupload.mutate(f, { onSuccess: () => setFile(null) });
          }}
        >
          {reupload.isPending ? 'Extracting…' : 'Replace source'}
        </Button>
      </CardContent>
    </Card>
  );
}

function LiveNoteCard({ id, note }: { id: string; note: string | null }) {
  const upd = useUpdateProject(id);
  const [v, setV] = useState(note ?? '');
  return (
    <Card>
      <CardHeader><CardTitle>Live-instance note</CardTitle></CardHeader>
      <CardContent className="flex flex-col gap-2">
        <Textarea
          value={v}
          onChange={(e) => setV(e.target.value)}
          className="min-h-[140px]"
          placeholder="Deployment mode, endpoints, credentials, liveness command… (read by verify forks)"
        />
        <Button
          size="sm"
          className="self-start"
          disabled={v === (note ?? '') || upd.isPending}
          onClick={() => upd.mutate({ live_instance_note: v })}
        >
          <Save /> Save note
        </Button>
      </CardContent>
    </Card>
  );
}
