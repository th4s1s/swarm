import { useState } from 'react';
import { Input, Select } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useRunnerOptions } from './api';

const CUSTOM = '__custom__';

/**
 * Model picker fed by GET /api/runner/options so the user selects from the known Claude models
 * instead of typing a full id. Blank id = account default. The "Custom" option (and any stored
 * value not in the list) falls back to a free-text input for an arbitrary model id.
 */
export function ModelSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { data } = useRunnerOptions();
  const models = data?.models ?? [];
  const [typing, setTyping] = useState(false);

  if (typing) {
    return (
      <div className="flex items-center gap-2">
        <Input
          autoFocus
          value={value}
          placeholder="claude-opus-4-8"
          onChange={(e) => onChange(e.target.value)}
        />
        <Button type="button" variant="subtle" size="sm" onClick={() => setTyping(false)}>
          List
        </Button>
      </div>
    );
  }

  const known = value === '' || models.some((m) => m.id === value);
  return (
    <Select
      value={value}
      onChange={(e) => {
        const v = e.target.value;
        if (v === CUSTOM) setTyping(true);
        else onChange(v);
      }}
    >
      {!known ? <option value={value}>{value} (custom)</option> : null}
      {models.map((m) => (
        <option key={m.id} value={m.id}>
          {m.label}
        </option>
      ))}
      <option value={CUSTOM}>Custom…</option>
    </Select>
  );
}
