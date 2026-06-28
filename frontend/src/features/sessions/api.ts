import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { qk } from '@/lib/query';
import type {
  AuditSnapshot,
  RunRow,
  SessionConfig,
  SessionDetail,
  SessionFamily,
  SessionReport,
  SessionRow,
} from '@/lib/types';

export function useSession(id: string) {
  return useQuery({
    queryKey: qk.session(id),
    queryFn: () => api.get<SessionDetail>(`/api/sessions/${id}`),
    refetchInterval: 8000,
  });
}

export function useSessionFamily(id: string) {
  return useQuery({
    queryKey: qk.family(id),
    queryFn: () => api.get<SessionFamily>(`/api/sessions/${id}/family`),
    refetchInterval: 8000,
  });
}

export function useCreateSession(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: { title: string; description?: string; config?: Partial<SessionConfig> }) =>
      api.post<SessionRow>(`/api/projects/${projectId}/sessions`, b),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.project(projectId) }),
  });
}

export function useFork(sessionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: { title: string; description?: string; findingId?: string; config?: Partial<SessionConfig> }) =>
      api.post<SessionRow>(`/api/sessions/${sessionId}/fork`, b),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.session(sessionId) }),
  });
}

export function useUpdateSession(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: { title?: string; description?: string | null; config?: Partial<SessionConfig> }) =>
      api.patch<SessionDetail>(`/api/sessions/${id}`, b),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.session(id) }),
  });
}

export function useDeleteSession() {
  return useMutation({ mutationFn: (id: string) => api.del(`/api/sessions/${id}`) });
}

export function useFindings(id: string, refetchInterval: number | false = false) {
  return useQuery({
    queryKey: qk.findings(id),
    queryFn: () => api.get<AuditSnapshot>(`/api/sessions/${id}/findings`),
    refetchInterval,
  });
}

export function useReport(id: string, refetchInterval: number | false = false) {
  return useQuery({
    queryKey: qk.report(id),
    queryFn: () => api.get<SessionReport>(`/api/sessions/${id}/report`),
    refetchInterval,
  });
}

// --- runner ---
export function useRunnerOptions() {
  return useQuery({
    queryKey: qk.runnerOptions,
    queryFn: () => api.get<{ phases: string[]; modes: string[] }>('/api/runner/options'),
    staleTime: Infinity,
  });
}

export function useRuns(sessionId: string) {
  return useQuery({
    queryKey: qk.runs(sessionId),
    queryFn: () => api.get<RunRow[]>(`/api/sessions/${sessionId}/runs`),
    refetchInterval: 5000,
  });
}

export function useRunEvents(runId: string | undefined) {
  return useQuery({
    queryKey: qk.runEvents(runId ?? ''),
    queryFn: () => api.get<{ runId: string; events: Record<string, unknown>[] }>(`/api/runs/${runId}/events`),
    enabled: Boolean(runId),
  });
}

export function useEnqueueRun(sessionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: { phase?: string; mode?: string; customPrompt?: string; findingId?: string }) =>
      api.post<RunRow>(`/api/sessions/${sessionId}/runs`, b),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.runs(sessionId) }),
  });
}

export function useSteer(sessionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (text: string) => api.post<RunRow>(`/api/sessions/${sessionId}/steer`, { text }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.runs(sessionId) }),
  });
}

export function useStopSession(sessionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post(`/api/sessions/${sessionId}/stop`),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.runs(sessionId) }),
  });
}

export function useCancelRun(sessionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (runId: string) => api.post(`/api/runs/${runId}/cancel`),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.runs(sessionId) }),
  });
}

export function useDeleteRun(sessionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (runId: string) => api.del(`/api/runs/${runId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.runs(sessionId) }),
  });
}
