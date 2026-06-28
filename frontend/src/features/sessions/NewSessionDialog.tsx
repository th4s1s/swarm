import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input, Label, Textarea } from '@/components/ui/input';
import { ConfigForm, type DraftConfig } from './ConfigForm';
import { useCreateSession } from './api';

export function NewSessionDialog({ projectId }: { projectId: string }) {
  const nav = useNavigate();
  const create = useCreateSession(projectId);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [config, setConfig] = useState<DraftConfig>({
    permissionMode: 'bypassPermissions',
    effort: null,
    workflows: false,
    thinking: false,
  });

  const submit = () =>
    create.mutate(
      { title, description: description || undefined, config },
      {
        onSuccess: (s) => {
          setOpen(false);
          nav(`/sessions/${s.id}`);
        },
      },
    );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus /> New Session
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader title="New audit session" description="A fresh audit-<timestamp> workspace + Claude session." />
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Initial audit" autoFocus />
          </div>
          <div className="flex flex-col gap-1">
            <Label>Description (optional)</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} className="min-h-[56px]" />
          </div>
          <div className="mt-1 border-t border-line pt-3">
            <div className="mb-2 text-xs font-medium text-muted">Claude config</div>
            <ConfigForm value={config} onChange={setConfig} />
          </div>
        </div>
        {create.isError ? <div className="mt-2 text-xs text-danger">{(create.error as Error).message}</div> : null}
        <DialogFooter>
          <Button onClick={submit} disabled={!title || create.isPending}>
            {create.isPending ? 'Creating…' : 'Create session'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
