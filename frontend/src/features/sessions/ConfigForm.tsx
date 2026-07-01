import { Sparkles } from 'lucide-react';
import { Input, Label, Select } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { ModelSelect } from './ModelSelect';
import type { Effort, SessionConfig } from '@/lib/types';

export type DraftConfig = Partial<SessionConfig>;

const EFFORTS: (Effort | '')[] = ['', 'low', 'medium', 'high', 'xhigh', 'max'];
const PERMS = ['bypassPermissions', 'acceptEdits', 'plan', 'default', 'dontAsk'];

export function ConfigForm({ value, onChange }: { value: DraftConfig; onChange: (c: DraftConfig) => void }) {
  const set = (patch: DraftConfig) => onChange({ ...value, ...patch });
  const isUltracode = value.effort === 'xhigh' && value.workflows === true;

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <Label>Permission mode</Label>
          <Select
            value={value.permissionMode ?? 'bypassPermissions'}
            onChange={(e) => set({ permissionMode: e.target.value })}
          >
            {PERMS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label>Model</Label>
          <ModelSelect value={value.model ?? ''} onChange={(v) => set({ model: v || null })} />
        </div>
        <div className="flex flex-col gap-1">
          <Label>Effort</Label>
          <Select
            value={value.effort ?? ''}
            onChange={(e) => set({ effort: (e.target.value || null) as Effort | null })}
          >
            {EFFORTS.map((e) => (
              <option key={e} value={e}>
                {e || 'model default'}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="flex items-center justify-between rounded-md border border-line bg-surface-2/40 px-3 py-2">
        <div>
          <div className="flex items-center gap-1.5 text-sm text-fg">
            <Sparkles className="size-3.5 text-primary" /> Workflows (ultracode)
          </div>
          <div className="text-[11px] text-muted">prefer the Workflow tool / gateless runs</div>
        </div>
        <Switch checked={value.workflows === true} onCheckedChange={(c) => set({ workflows: c })} />
      </div>

      <div className="flex items-center justify-between rounded-md border border-line bg-surface-2/40 px-3 py-2">
        <div>
          <div className="text-sm text-fg">Extended thinking</div>
          <div className="text-[11px] text-muted">MAX_THINKING_TOKENS budget</div>
        </div>
        <div className="flex items-center gap-2">
          {value.thinking ? (
            <Input
              type="number"
              className="h-8 w-24"
              value={value.thinkingTokens ?? 10000}
              onChange={(e) => set({ thinkingTokens: Number(e.target.value) || 10000 })}
            />
          ) : null}
          <Switch checked={value.thinking === true} onCheckedChange={(c) => set({ thinking: c })} />
        </div>
      </div>

      <Button
        type="button"
        variant={isUltracode ? 'primary' : 'subtle'}
        size="sm"
        className="self-start"
        onClick={() => set({ effort: 'xhigh', workflows: true })}
      >
        <Sparkles /> Ultracode preset
      </Button>
    </div>
  );
}
