import * as React from 'react';
import { cn } from '@/lib/utils';

export function StatCard({
  label,
  value,
  sub,
  icon,
  className,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('rounded-xl border border-line bg-surface/70 p-4', className)}>
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wider text-muted">{label}</span>
        {icon ? <span className="text-primary/70">{icon}</span> : null}
      </div>
      <div className="mt-2 font-mono text-2xl font-semibold text-fg">{value}</div>
      {sub ? <div className="mt-1 text-xs text-muted">{sub}</div> : null}
    </div>
  );
}
