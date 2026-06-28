import { useEffect, useState } from 'react';
import { Check, Save } from 'lucide-react';
import { PageHeader } from '@/components/AppShell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Label, Select } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ErrorNote, Loading } from '@/components/ui/misc';
import { useConfig, usePatchConfig } from '@/features/ops/api';

export function ConfigPage() {
  const q = useConfig();
  const patch = usePatchConfig();
  const [form, setForm] = useState<Record<string, string>>({});
  const [pass, setPass] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (q.data) setForm(q.data.settings);
  }, [q.data]);

  if (q.isLoading) return <Loading />;
  if (q.isError || !q.data) return <div className="p-6"><ErrorNote error={q.error ?? 'failed'} /></div>;

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const save = () => {
    const body: Record<string, unknown> = { ...form };
    body.max_concurrent_runs = Number(form.max_concurrent_runs);
    body.default_thinking_tokens = Number(form.default_thinking_tokens);
    body.resource_sample_ms = Number(form.resource_sample_ms);
    if (pass) body.admin_pass = pass;
    patch.mutate(body, {
      onSuccess: () => {
        setPass('');
        setSaved(true);
        setTimeout(() => setSaved(false), 1500);
      },
    });
  };

  return (
    <div>
      <PageHeader title="Config" subtitle="App settings & per-run defaults" />
      <div className="max-w-3xl p-6">
        <Card>
          <CardHeader><CardTitle>Settings</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Admin user">
              <Input value={form.admin_user ?? ''} onChange={(e) => set('admin_user', e.target.value)} />
            </Field>
            <Field label={`Admin password ${q.data.admin_pass_set ? '(custom set)' : '(default)'}`}>
              <Input type="password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder="leave blank to keep" />
            </Field>

            <Field label="Default mode">
              <Select value={form.default_mode ?? 'full'} onChange={(e) => set('default_mode', e.target.value)}>
                <option value="full">full</option>
                <option value="source">source</option>
              </Select>
            </Field>
            <Field label="Default permission mode">
              <Select value={form.default_permission_mode ?? 'bypassPermissions'} onChange={(e) => set('default_permission_mode', e.target.value)}>
                {['bypassPermissions', 'acceptEdits', 'plan', 'default', 'dontAsk'].map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </Select>
            </Field>

            <Field label="Default model (blank = default)">
              <Input value={form.default_model ?? ''} onChange={(e) => set('default_model', e.target.value)} />
            </Field>
            <Field label="Default effort">
              <Select value={form.default_effort ?? ''} onChange={(e) => set('default_effort', e.target.value)}>
                {['', 'low', 'medium', 'high', 'xhigh', 'max'].map((m) => (
                  <option key={m} value={m}>{m || 'model default'}</option>
                ))}
              </Select>
            </Field>

            <Field label="Default workflows (ultracode)">
              <Select value={form.default_workflows ?? ''} onChange={(e) => set('default_workflows', e.target.value)}>
                <option value="">default</option>
                <option value="on">on</option>
                <option value="off">off</option>
              </Select>
            </Field>
            <Field label="Default thinking">
              <Select value={form.default_thinking ?? ''} onChange={(e) => set('default_thinking', e.target.value)}>
                <option value="">default</option>
                <option value="on">on</option>
                <option value="off">off</option>
              </Select>
            </Field>

            <Field label="Default thinking tokens">
              <Input type="number" value={form.default_thinking_tokens ?? '10000'} onChange={(e) => set('default_thinking_tokens', e.target.value)} />
            </Field>
            <Field label="Max concurrent runs">
              <Input type="number" value={form.max_concurrent_runs ?? '2'} onChange={(e) => set('max_concurrent_runs', e.target.value)} />
            </Field>

            <Field label="CORS origin">
              <Input value={form.cors_origin ?? ''} onChange={(e) => set('cors_origin', e.target.value)} />
            </Field>
            <Field label="Resource sample interval (ms)">
              <Input type="number" value={form.resource_sample_ms ?? '5000'} onChange={(e) => set('resource_sample_ms', e.target.value)} />
            </Field>
          </CardContent>
        </Card>

        <div className="mt-4 flex items-center gap-3">
          <Button onClick={save} disabled={patch.isPending}>
            {saved ? <Check /> : <Save />} {saved ? 'Saved' : patch.isPending ? 'Saving…' : 'Save settings'}
          </Button>
          {patch.isError ? <span className="text-xs text-danger">{(patch.error as Error).message}</span> : null}
        </div>

        <Card className="mt-6">
          <CardHeader><CardTitle>Paths (read-only)</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-1 font-mono text-xs text-muted">
            {Object.entries(q.data.paths).map(([k, v]) => (
              <div key={k}><span className="text-fg/70">{k}</span>: {v}</div>
            ))}
            <div><span className="text-fg/70">claude_bin</span>: {q.data.claude_bin}</div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
