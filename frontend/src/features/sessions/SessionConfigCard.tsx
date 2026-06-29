import { useState } from 'react';
import { Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input, Label, Textarea } from '@/components/ui/input';
import { ConfigForm, type DraftConfig } from './ConfigForm';
import { useUpdateSession } from './api';
import type { SessionConfig } from '@/lib/types';

export function SessionConfigCard({
  sessionId,
  title,
  description,
  config,
}: {
  sessionId: string;
  title: string;
  description: string | null;
  config: SessionConfig;
}) {
  const upd = useUpdateSession(sessionId);
  const [t, setT] = useState(title);
  const [d, setD] = useState(description ?? '');
  const [draft, setDraft] = useState<DraftConfig>(config);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <Label>Title</Label>
        <Input value={t} onChange={(e) => setT(e.target.value)} placeholder="Session title" />
      </div>
      <div className="flex flex-col gap-1">
        <Label>Description</Label>
        <Textarea
          value={d}
          onChange={(e) => setD(e.target.value)}
          className="min-h-[72px]"
          placeholder="Optional notes about this session"
        />
      </div>

      <div className="border-t border-line pt-3">
        <div className="mb-2 text-xs font-medium text-muted">Claude config (applies to the next run)</div>
        <ConfigForm value={draft} onChange={setDraft} />
      </div>

      <Button
        size="sm"
        className="self-start"
        disabled={upd.isPending || !t.trim()}
        onClick={() => upd.mutate({ title: t.trim(), description: d.trim() || null, config: draft })}
      >
        <Save /> {upd.isPending ? 'Saving…' : 'Save'}
      </Button>
      {upd.isError ? <p className="text-xs text-danger">{(upd.error as Error).message}</p> : null}
    </div>
  );
}
