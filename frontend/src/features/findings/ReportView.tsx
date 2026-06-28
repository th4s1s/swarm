import { useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { FileText } from 'lucide-react';
import { EmptyState, Loading } from '@/components/ui/misc';
import { CopyButton } from '@/components/CopyButton';
import { Select } from '@/components/ui/input';
import { useReport } from '@/features/sessions/api';

export function ReportView({ sessionId, focusFindingId }: { sessionId: string; focusFindingId?: string | null }) {
  const q = useReport(sessionId);
  const [sel, setSel] = useState<string>('');

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
          <Select value={sel || preferred} onChange={(e) => setSel(e.target.value)} className="h-8 max-w-xs">
            {docs.map((d) => (
              <option key={d.key} value={d.key}>
                {d.label}
              </option>
            ))}
          </Select>
        ) : (
          <span className="text-xs text-muted">{current.label}</span>
        )}
        <CopyButton text={current.markdown} label="Copy as Markdown" />
      </div>
      <div className="prose-invert flex-1 overflow-y-auto p-4">
        <article className="markdown text-sm leading-relaxed text-fg/90">
          <Markdown remarkPlugins={[remarkGfm]}>{current.markdown}</Markdown>
        </article>
      </div>
    </div>
  );
}
