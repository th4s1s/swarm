import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { qk } from '@/lib/query';

interface Me {
  user: { username: string };
}

export function useMe() {
  return useQuery({
    queryKey: qk.me,
    queryFn: () => api.get<Me>('/api/me'),
    retry: false,
    staleTime: 60_000,
  });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (creds: { username: string; password: string }) =>
      api.post<{ ok: boolean; user: { username: string } }>('/api/login', creds),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.me }),
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post('/api/logout'),
    onSuccess: () => qc.clear(),
  });
}
