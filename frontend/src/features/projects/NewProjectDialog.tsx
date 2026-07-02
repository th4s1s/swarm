import { useState } from 'react';
import { FileArchive, GitBranch, Plus, UploadCloud } from 'lucide-react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input, Label, Textarea } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useZipDrop } from '@/lib/dropzone';
import { useCreateGitProject, useCreateZipProject } from './api';

const NAME_RE = /^[A-Za-z0-9_-]+$/;

export function NewProjectDialog() {
  const [open, setOpen] = useState(false);
  const git = useCreateGitProject();
  const zip = useCreateZipProject();

  const [title, setTitle] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [url, setUrl] = useState('');
  const [token, setToken] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const { dragging, handlers } = useZipDrop(setFile);

  const nameOk = NAME_RE.test(name);
  const reset = () => {
    setTitle('');
    setName('');
    setDescription('');
    setUrl('');
    setToken('');
    setFile(null);
  };
  const done = () => {
    reset();
    setOpen(false);
  };

  const submitGit = () =>
    git.mutate(
      { title, name, description: description || undefined, url, token: token || undefined },
      { onSuccess: done },
    );

  const submitZip = () => {
    if (!file) return;
    const form = new FormData();
    form.set('title', title);
    form.set('name', name);
    if (description) form.set('description', description);
    form.set('file', file);
    zip.mutate(form, { onSuccess: done });
  };

  const err = git.error || zip.error;

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : done())}>
      <DialogTrigger asChild>
        <Button>
          <Plus /> New Project
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader title="New project" description="Clone a git repo or upload a zip of the source." />
        <div className="mb-3 flex flex-col gap-3">
          <Field label="Title">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="My Target App" />
          </Field>
          <Field label="Name (dir-safe: A-Z a-z 0-9 - _)">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my-target-app"
              aria-invalid={name.length > 0 && !nameOk}
            />
            {name.length > 0 && !nameOk ? (
              <span className="text-[11px] text-danger">only letters, digits, "-" and "_"</span>
            ) : null}
          </Field>
          <Field label="Description (optional)">
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="min-h-[56px]"
            />
          </Field>
        </div>

        <Tabs defaultValue="git">
          <TabsList>
            <TabsTrigger value="git">
              <GitBranch className="mr-1 inline size-3.5" /> Git
            </TabsTrigger>
            <TabsTrigger value="zip">
              <FileArchive className="mr-1 inline size-3.5" /> Zip
            </TabsTrigger>
          </TabsList>

          <TabsContent value="git" className="mt-3 flex flex-col gap-3">
            <Field label="Repository URL">
              <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://github.com/org/repo.git" />
            </Field>
            <Field label="Access token (optional, private repos)">
              <Input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="ghp_…" />
            </Field>
            {err ? <span className="text-xs text-danger">{(err as Error).message}</span> : null}
            <DialogFooter>
              <Button
                onClick={submitGit}
                disabled={!title || !nameOk || !url || git.isPending}
              >
                {git.isPending ? 'Cloning…' : 'Clone & create'}
              </Button>
            </DialogFooter>
          </TabsContent>

          <TabsContent value="zip" className="mt-3 flex flex-col gap-3">
            <label
              {...handlers}
              className={cn(
                'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-8 text-center',
                dragging ? 'border-primary bg-primary/10' : 'border-line bg-surface-2/40 hover:border-primary/50',
              )}
            >
              <UploadCloud className="size-6 text-primary/70" />
              <span className="text-sm text-fg">{file ? file.name : 'Choose or drop a .zip file'}</span>
              <span className="text-[11px] text-muted">extracted into /vibe/hack/projects/&lt;name&gt;</span>
              <input
                type="file"
                accept=".zip,application/zip"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>
            {err ? <span className="text-xs text-danger">{(err as Error).message}</span> : null}
            <DialogFooter>
              <Button onClick={submitZip} disabled={!title || !nameOk || !file || zip.isPending}>
                {zip.isPending ? 'Extracting…' : 'Upload & create'}
              </Button>
            </DialogFooter>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
