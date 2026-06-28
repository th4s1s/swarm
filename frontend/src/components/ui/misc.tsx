import * as React from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('size-4 animate-spin text-primary', className)} />;
}

export function Center({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('flex h-full w-full items-center justify-center', className)}>{children}</div>;
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <Center className="py-16">
      <div className="flex items-center gap-2 text-sm text-muted">
        <Spinner /> {label}
      </div>
    </Center>
  );
}

export function EmptyState({
  icon,
  title,
  hint,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-line py-14 text-center">
      {icon ? <div className="text-primary/70">{icon}</div> : null}
      <div className="text-sm font-medium text-fg">{title}</div>
      {hint ? <div className="max-w-sm text-xs text-muted">{hint}</div> : null}
      {action}
    </div>
  );
}

export function ErrorNote({ error }: { error: unknown }) {
  const msg = error instanceof Error ? error.message : String(error);
  return (
    <div className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
      {msg}
    </div>
  );
}
