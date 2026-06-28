import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { Button, type ButtonProps } from '@/components/ui/button';

export function CopyButton({
  text,
  label = 'Copy',
  ...props
}: { text: string; label?: string } & Omit<ButtonProps, 'onClick' | 'children'>) {
  const [done, setDone] = useState(false);
  return (
    <Button
      variant="subtle"
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          /* ignore */
        }
      }}
      {...props}
    >
      {done ? <Check className="text-primary" /> : <Copy />}
      {done ? 'Copied' : label}
    </Button>
  );
}
