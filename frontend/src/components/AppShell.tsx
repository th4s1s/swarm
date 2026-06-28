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
    <div className="flex h-screen overflow-hidden">
      <aside className="flex w-56 shrink-0 flex-col border-r border-line bg-surface/60">
        <div className="flex items-center gap-2.5 px-4 py-4">
          <SwarmMark size={26} />
          <span className="font-mono text-lg font-bold tracking-[0.25em] text-primary text-glow">SWARM</span>
        </div>
        <nav className="flex-1 px-2 py-2">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  'mb-0.5 flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
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
        <div className="border-t border-line p-3">
          <div className="mb-2 flex items-center gap-2 px-1 text-xs text-muted">
            <TerminalSquare className="size-3.5 text-primary/60" />
            <span className="truncate" title={email}>
              {email || 'account'}
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start"
            onClick={() => logout.mutate(undefined, { onSuccess: () => nav('/login', { replace: true }) })}
          >
            <LogOut /> Sign out
          </Button>
        </div>
      </aside>
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
