import * as React from 'react';
import * as S from '@radix-ui/react-switch';
import { cn } from '@/lib/utils';

export function Switch({ className, ...props }: React.ComponentProps<typeof S.Root>) {
  return (
    <S.Root
      className={cn(
        'peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-line transition-colors data-[state=checked]:bg-primary data-[state=unchecked]:bg-surface-2 data-[state=checked]:shadow-glow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
        className,
      )}
      {...props}
    >
      <S.Thumb className="pointer-events-none block size-4 translate-x-0.5 rounded-full bg-bg transition-transform data-[state=checked]:translate-x-[18px]" />
    </S.Root>
  );
}
