import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GitFork } from 'lucide-react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input, Label, Select, Textarea } from '@/components/ui/input';
import type { AuditFinding } from '@/lib/types';
import { useFork } from './api';

export function ForkDialog({
  sessionId,
  findings,
  disabled,
}: {
  sessionId: string;
  findings: AuditFinding[];
  disabled?: boolean;
}) {
  const nav = useNavigate();
  const fork = useFork(sessionId);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [findingId, setFindingId] = useState('');
  const tps = findings.filter((f) => f.verdict === 'TRUE_POSITIVE');

  const submit = () =>
    fork.mutate(
      { title, description: description || undefined, findingId: findingId || undefined },
      {
        onSuccess: (s) => {
          setOpen(false);
          setTitle('');
          setDescription('');
          setFindingId('');
          nav(`/sessions/${s.id}`);
        },
      },
    );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled} title={disabled ? 'Run at least one phase first' : undefined}>
          <GitFork /> Fork
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader
          title="Fork session"
          description="A child session that shares this audit's findings but runs its own Claude stream (e.g. to verify one finding)."
        />
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Verify F-1" autoFocus />
          </div>
          <div className="flex flex-col gap-1">
            <Label>Description (optional)</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} className="min-h-[48px]" />
          </div>
          <div className="flex flex-col gap-1">
            <Label>Target finding (optional)</Label>
            <Select value={findingId} onChange={(e) => setFindingId(e.target.value)}>
              <option value="">none</option>
              {tps.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.final_id ? `${f.final_id} · ` : ''}
                  {f.id} - {f.title}
                </option>
              ))}
            </Select>
          </div>
        </div>
        {fork.isError ? <div className="mt-2 text-xs text-danger">{(fork.error as Error).message}</div> : null}
        <DialogFooter>
          <Button onClick={submit} disabled={!title || fork.isPending}>
            {fork.isPending ? 'Forking…' : 'Create fork'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
