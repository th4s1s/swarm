import { useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Pencil, Save, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/input';
import { Loading } from '@/components/ui/misc';
import { useProject, useUpdateProject } from './api';

/**
 * View/edit the project's live-instance note. Defaults to a rendered markdown view
 * (like the resume note) with an Edit toggle. Reads + writes via the shared project
 * query, so it works the same on the project page and in a session tab.
 */
export function LiveNoteEditor({ projectId }: { projectId: string }) {
  const q = useProject(projectId);
  const upd = useUpdateProject(projectId);
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const [draft, setDraft] = useState('');

  if (q.isLoading) return <Loading label="Loading note…" />;

  const note = q.data?.live_instance_note ?? '';

  if (mode === 'edit') {
    return (
      <div className="flex flex-col gap-2">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="min-h-[360px]"
          placeholder="Deployment mode, endpoints, credentials, liveness command… (read by verify forks)"
          autoFocus
        />
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            disabled={draft === note || upd.isPending}
            onClick={() => upd.mutate({ live_instance_note: draft }, { onSuccess: () => setMode('view') })}
          >
            <Save /> {upd.isPending ? 'Saving…' : 'Save note'}
          </Button>
          <Button variant="subtle" size="sm" disabled={upd.isPending} onClick={() => setMode('view')}>
            <X /> Cancel
          </Button>
        </div>
        {upd.isError ? <p className="text-xs text-danger">{(upd.error as Error).message}</p> : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-end">
        <Button
          variant="subtle"
          size="sm"
          onClick={() => {
            setDraft(note);
            setMode('edit');
          }}
        >
          <Pencil /> Edit
        </Button>
      </div>
      {note ? (
        <article className="markdown text-sm leading-relaxed text-fg/90">
          <Markdown remarkPlugins={[remarkGfm]}>{note}</Markdown>
        </article>
      ) : (
        <div className="text-xs text-muted">
          No live-instance note yet. Add deployment mode, endpoints, credentials, and the liveness
          command here - verify forks read it.
        </div>
      )}
    </div>
  );
}
