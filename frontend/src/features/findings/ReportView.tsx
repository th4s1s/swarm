import { useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { FileText, Pencil, Save, X } from 'lucide-react';
import { EmptyState, Loading } from '@/components/ui/misc';
import { CopyButton } from '@/components/CopyButton';
import { Button } from '@/components/ui/button';
import { Select, Textarea } from '@/components/ui/input';
import { useReport, useSaveReport } from '@/features/sessions/api';

export function ReportView({
  sessionId,
  focusFindingId,
  refetchInterval = false,
}: {
  sessionId: string;
  focusFindingId?: string | null;
  refetchInterval?: number | false;
}) {
  const [sel, setSel] = useState<string>('');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  // Pause live refetch while editing so an in-flight run's report rewrite can't clobber the textarea.
  const q = useReport(sessionId, editing ? false : refetchInterval);
  const save = useSaveReport(sessionId);

  if (q.isLoading) return <Loading label="Loading report…" />;
  const rep = q.data;

  const docs: { key: string; label: string; markdown: string }[] = [];
  if (rep?.consolidated) docs.push({ key: 'consolidated', label: 'Consolidated report', markdown: rep.consolidated });
  for (const r of rep?.reports ?? []) docs.push({ key: r.finding_id, label: `${r.finding_id} report`, markdown: r.markdown });

  if (docs.length === 0) {
    return (
      <EmptyState
        icon={<FileText className="size-7" />}
        title="No report yet"
        hint="Reports appear after a verify fork confirms a finding, or after a source-mode run completes."
      />
    );
  }

  const preferred = focusFindingId && docs.find((d) => d.key === focusFindingId) ? focusFindingId : docs[0]!.key;
  const current = docs.find((d) => d.key === (sel || preferred)) ?? docs[0]!;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-line p-2">
        {docs.length > 1 ? (
          <Select
            value={sel || preferred}
            onChange={(e) => setSel(e.target.value)}
            disabled={editing}
            className="h-8 max-w-xs"
          >
            {docs.map((d) => (
              <option key={d.key} value={d.key}>
                {d.label}
              </option>
            ))}
          </Select>
        ) : (
          <span className="text-xs text-muted">{current.label}</span>
        )}
        <div className="flex items-center gap-2">
          {editing ? (
            <>
              <Button
                size="sm"
                disabled={draft === current.markdown || save.isPending}
                onClick={() =>
                  save.mutate(
                    { target: current.key, markdown: draft },
                    { onSuccess: () => setEditing(false) },
                  )
                }
              >
                <Save /> {save.isPending ? 'Saving…' : 'Save'}
              </Button>
              <Button size="sm" variant="subtle" onClick={() => setEditing(false)}>
                <X /> Cancel
              </Button>
            </>
          ) : (
            <>
              <Button
                size="sm"
                variant="subtle"
                onClick={() => {
                  setDraft(current.markdown);
                  setEditing(true);
                }}
              >
                <Pencil /> Edit
              </Button>
              <CopyButton text={current.markdown} label="Copy as Markdown" />
            </>
          )}
        </div>
      </div>
      {editing ? (
        <div className="flex min-h-0 flex-1 flex-col gap-2 p-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            autoFocus
            className="min-h-0 flex-1 resize-none font-mono text-xs"
          />
          {save.isError ? <p className="text-xs text-danger">{(save.error as Error).message}</p> : null}
        </div>
      ) : (
        <div className="prose-invert min-h-0 flex-1 overflow-y-auto p-4">
          <article className="markdown text-sm leading-relaxed text-fg/90">
            <Markdown remarkPlugins={[remarkGfm]}>{current.markdown}</Markdown>
          </article>
        </div>
      )}
    </div>
  );
}
