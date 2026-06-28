import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium leading-none',
  {
    variants: {
      tone: {
        primary: 'border-primary/40 bg-primary-dim text-primary',
        neutral: 'border-line bg-surface-2 text-muted',
        critical: 'border-sev-critical/40 text-sev-critical bg-sev-critical/10',
        high: 'border-sev-high/40 text-sev-high bg-sev-high/10',
        medium: 'border-sev-medium/40 text-sev-medium bg-sev-medium/10',
        low: 'border-sev-low/40 text-sev-low bg-sev-low/10',
        info: 'border-sev-info/40 text-sev-info bg-sev-info/10',
        danger: 'border-danger/40 text-danger bg-danger/10',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

const SEV_TONE: Record<string, NonNullable<BadgeProps['tone']>> = {
  critical: 'critical',
  high: 'high',
  medium: 'medium',
  low: 'low',
  info: 'info',
};

export function SeverityBadge({ severity }: { severity: string | null | undefined }) {
  const s = (severity ?? 'info').toLowerCase();
  return <Badge tone={SEV_TONE[s] ?? 'info'}>{(severity ?? 'INFO').toUpperCase()}</Badge>;
}
