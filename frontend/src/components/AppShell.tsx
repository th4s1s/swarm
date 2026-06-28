import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  Activity,
  Boxes,
  FolderGit2,
  Gauge,
  LogOut,
  Plug,
  Settings,
  TerminalSquare,
} from 'lucide-react';
import { SwarmMark } from '@/components/SwarmMark';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useLogout, useMe } from '@/features/auth/useAuth';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { qk } from '@/lib/query';
import type { QuotaResult } from '@/lib/types';

const NAV = [
  { to: '/projects', label: 'Projects', icon: FolderGit2 },
  { to: '/mcp', label: 'MCP', icon: Plug },
  { to: '/quota', label: 'Quota', icon: Gauge },
  { to: '/usage', label: 'Usage', icon: Activity },
  { to: '/resources', label: 'Resources', icon: Boxes },
  { to: '/config', label: 'Config', icon: Settings },
];

export function AppShell() {
  const nav = useNavigate();
  const logout = useLogout();
  const me = useMe();
  const quota = useQuery({ queryKey: qk.quota, queryFn: () => api.get<QuotaResult>('/api/quota'), staleTime: 60_000 });
  const email = quota.data?.account.email ?? me.data?.user.username ?? '';

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <header className="flex shrink-0 items-center gap-4 overflow-x-auto border-b border-line bg-surface/60 px-4 py-2.5">
        <div className="flex shrink-0 items-center gap-2.5">
          <SwarmMark size={24} />
          <span className="font-mono text-base font-bold tracking-[0.25em] text-primary text-glow">SWARM</span>
        </div>
        <nav className="flex items-center gap-1">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm transition-colors',
                  isActive
                    ? 'bg-primary-dim text-primary shadow-glow-sm'
                    : 'text-fg/70 hover:bg-surface-2 hover:text-fg',
                )
              }
            >
              <Icon className="size-4" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <span className="flex items-center gap-2 px-1 text-xs text-muted" title={email}>
            <TerminalSquare className="size-3.5 text-primary/60" />
            <span className="max-w-[16rem] truncate">{email || 'account'}</span>
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => logout.mutate(undefined, { onSuccess: () => nav('/login', { replace: true }) })}
          >
            <LogOut /> Sign out
          </Button>
        </div>
      </header>
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-6 py-4">
      <div>
        <h1 className="text-lg font-semibold text-fg">{title}</h1>
        {subtitle ? <p className="mt-0.5 text-xs text-muted">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}
