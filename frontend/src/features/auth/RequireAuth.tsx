import { useEffect } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { UNAUTHORIZED_EVENT } from '@/lib/api';
import { Loading } from '@/components/ui/misc';
import { useMe } from './useAuth';

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const me = useMe();
  const nav = useNavigate();
  const qc = useQueryClient();

  // Global 401 → bounce to login.
  useEffect(() => {
    const onUnauth = () => {
      qc.setQueryData(['me'], null);
      nav('/login', { replace: true });
    };
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauth);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauth);
  }, [nav, qc]);

  if (me.isLoading) return <Loading label="Authenticating…" />;
  if (me.isError || !me.data) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export function useLocationState() {
  const loc = useLocation();
  return (loc.state as { from?: string } | null)?.from ?? '/projects';
}
