import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { SwarmMark } from '@/components/SwarmMark';
import { useLogin, useMe } from './useAuth';

export function LoginPage() {
  const nav = useNavigate();
  const me = useMe();
  const login = useLogin();
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');

  if (me.data) {
    nav('/projects', { replace: true });
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    login.mutate({ username, password }, { onSuccess: () => nav('/projects', { replace: true }) });
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-surface/80 p-8 shadow-glow-lg backdrop-blur">
        <div className="mb-6 flex flex-col items-center gap-3">
          <SwarmMark size={44} />
          <div className="text-center">
            <div className="font-mono text-2xl font-bold tracking-[0.3em] text-glow text-primary">SWARM</div>
            <div className="mt-1 text-xs text-muted">parallel-agent security auditing</div>
          </div>
        </div>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="u">Username</Label>
            <Input id="u" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="p">Password</Label>
            <Input
              id="p"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>
          {login.isError ? (
            <div className="text-xs text-danger">{(login.error as Error).message}</div>
          ) : null}
          <Button type="submit" className="mt-2 w-full" disabled={login.isPending}>
            <ShieldCheck />
            {login.isPending ? 'Authenticating…' : 'Enter'}
          </Button>
        </form>
      </div>
    </div>
  );
}
