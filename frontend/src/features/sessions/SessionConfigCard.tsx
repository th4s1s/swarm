import { useState } from 'react';
import { Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfigForm, type DraftConfig } from './ConfigForm';
import { useUpdateSession } from './api';
import type { SessionConfig } from '@/lib/types';

export function SessionConfigCard({
  sessionId,
  config,
  disabled,
}: {
  sessionId: string;
  config: SessionConfig;
  disabled?: boolean;
}) {
  const upd = useUpdateSession(sessionId);
  const [draft, setDraft] = useState<DraftConfig>(config);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted">
        Claude config for this session. Applies to the next run. Phase and mode are chosen per run in the
        controls below the monitor.
      </p>
      <ConfigForm value={draft} onChange={setDraft} />
      <Button
        size="sm"
        className="self-start"
        disabled={disabled || upd.isPending}
        onClick={() => upd.mutate({ config: draft })}
      >
        <Save /> {upd.isPending ? 'Saving…' : 'Save config'}
      </Button>
      {disabled ? <p className="text-[11px] text-muted">Stop the active run to change config.</p> : null}
      {upd.isError ? <p className="text-xs text-danger">{(upd.error as Error).message}</p> : null}
    </div>
  );
}
