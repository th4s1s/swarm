import { useState } from 'react';
import { Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/input';
import { Loading } from '@/components/ui/misc';
import { useProject, useUpdateProject } from './api';

/**
 * Editor for a project's live-instance note. Reads + writes via the shared project
 * query, so it can be dropped into the project page or a session tab interchangeably.
 */
export function LiveNoteEditor({ projectId }: { projectId: string }) {
  const q = useProject(projectId);
  const upd = useUpdateProject(projectId);
  const [draft, setDraft] = useState<string | null>(null);

  if (q.isLoading) return <Loading label="Loading note…" />;

  const note = q.data?.live_instance_note ?? '';
  const value = draft ?? note;
  const dirty = value !== note;

  return (
    <div className="flex flex-col gap-2">
      <Textarea
        value={value}
        onChange={(e) => setDraft(e.target.value)}
        className="min-h-[280px]"
        placeholder="Deployment mode, endpoints, credentials, liveness command… (read by verify forks)"
      />
      <Button
        size="sm"
        className="self-start"
        disabled={!dirty || upd.isPending}
        onClick={() => upd.mutate({ live_instance_note: value }, { onSuccess: () => setDraft(null) })}
      >
        <Save /> {upd.isPending ? 'Saving…' : 'Save note'}
      </Button>
    </div>
  );
}
