import { useState } from 'react';
import { Check, Copy, X } from 'lucide-react';
import { Button, type ButtonProps } from '@/components/ui/button';
import { copyText } from '@/lib/clipboard';

export function CopyButton({
  text,
  label = 'Copy',
  ...props
}: { text: string; label?: string } & Omit<ButtonProps, 'onClick' | 'children'>) {
  const [state, setState] = useState<'idle' | 'done' | 'failed'>('idle');
  return (
    <Button
      variant="subtle"
      size="sm"
      onClick={async () => {
        const ok = await copyText(text);
        setState(ok ? 'done' : 'failed');
        setTimeout(() => setState('idle'), 1500);
      }}
      {...props}
    >
      {state === 'done' ? <Check className="text-primary" /> : state === 'failed' ? <X className="text-danger" /> : <Copy />}
      {state === 'done' ? 'Copied' : state === 'failed' ? 'Copy failed' : label}
    </Button>
  );
}
