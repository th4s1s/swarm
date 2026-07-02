import * as React from 'react';
import * as D from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

export function DialogContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof D.Content>) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm data-[state=open]:animate-fade-in" />
      <D.Content
        className={cn(
          'fixed left-1/2 top-1/2 z-50 w-[92vw] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-xl border border-line bg-surface p-5 shadow-glow-lg focus:outline-none data-[state=open]:animate-dialog-in',
          className,
        )}
        {...props}
      >
        {children}
        <D.Close className="absolute right-3 top-3 rounded-md p-1 text-muted hover:bg-surface-2 hover:text-fg">
          <X className="size-4" />
        </D.Close>
      </D.Content>
    </D.Portal>
  );
}

export function DialogHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mb-4 flex flex-col gap-1">
      <D.Title className="text-base font-semibold text-fg">{title}</D.Title>
      {description ? <D.Description className="text-xs text-muted">{description}</D.Description> : null}
    </div>
  );
}

export function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('mt-5 flex justify-end gap-2', className)} {...props} />;
}
