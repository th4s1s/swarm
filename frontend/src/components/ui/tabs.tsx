import * as React from 'react';
import * as T from '@radix-ui/react-tabs';
import { cn } from '@/lib/utils';

export const Tabs = T.Root;

export function TabsList({ className, ...props }: React.ComponentProps<typeof T.List>) {
  return (
    <T.List
      className={cn('inline-flex items-center gap-1 rounded-lg border border-line bg-surface-2/50 p-1', className)}
      {...props}
    />
  );
}

export function TabsTrigger({ className, ...props }: React.ComponentProps<typeof T.Trigger>) {
  return (
    <T.Trigger
      className={cn(
        'rounded-md px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:text-fg data-[state=active]:bg-primary-dim data-[state=active]:text-primary data-[state=active]:shadow-glow-sm',
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({ className, ...props }: React.ComponentProps<typeof T.Content>) {
  return <T.Content className={cn('focus:outline-none', className)} {...props} />;
}
