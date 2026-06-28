import { useEffect, useRef } from 'react';
import type { StreamEvent } from '@/lib/types';

const TYPE_COLOR: Record<string, string> = {
  system: 'text-sev-low',
  assistant: 'text-primary',
  user: 'text-fg',
  result: 'text-primary-strong',
  stream_event: 'text-muted',
  rate_limit_event: 'text-sev-medium',
  _stderr: 'text-sev-medium',
  _error: 'text-danger',
};

export function JsonView({ events }: { events: StreamEvent[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  useEffect(() => {
    const el = ref.current;
    if (el && atBottom.current) el.scrollTop = el.scrollHeight;
  }, [events.length]);

  return (
    <div
      ref={ref}
      onScroll={(e) => {
        const el = e.currentTarget;
        atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
      }}
      className="h-full overflow-y-auto bg-[#060908] p-3 font-mono text-[11.5px] leading-relaxed"
    >
      {events.length === 0 ? (
        <div className="text-muted">No events.</div>
      ) : (
        events.map((e, i) => (
          <details key={i} className="border-b border-line/40 py-1">
            <summary className="cursor-pointer list-none">
              <span className={TYPE_COLOR[e.type] ?? 'text-fg'}>
                {e.type}
                {e.subtype ? `:${e.subtype}` : ''}
              </span>
            </summary>
            <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-words text-muted">
              {JSON.stringify(e, null, 2)}
            </pre>
          </details>
        ))
      )}
    </div>
  );
}
