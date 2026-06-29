import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { qk } from '@/lib/query';
import type {
  AppConfig,
  ContainerInfo,
  ImageInfo,
  IoSample,
  McpServer,
  McpServerConfig,
  QuotaResult,
  TokenAgg,
} from '@/lib/types';

// --- Quota ---
export function useQuota() {
  return useQuery({ queryKey: qk.quota, queryFn: () => api.get<QuotaResult>('/api/quota'), refetchInterval: 60_000 });
}

// --- Usage ---
export interface UsageSummary {
  total: TokenAgg;
  generatedAt: string;
  pricingNote: string;
}
export function useUsageSummary() {
  return useQuery({ queryKey: qk.usageSummary, queryFn: () => api.get<UsageSummary>('/api/usage/summary') });
}
export function useUsageByModel() {
  return useQuery({
    queryKey: qk.usageByModel,
    queryFn: () => api.get<(TokenAgg & { model: string })[]>('/api/usage/by-model'),
  });
}
export function useUsageTimeseries(days: number) {
  return useQuery({
    queryKey: qk.usageTimeseries(days),
    queryFn: () => api.get<(TokenAgg & { day: string })[]>(`/api/usage/timeseries?days=${days}`),
  });
}
export interface ByProjectRow extends TokenAgg {
  project: string;
  known: boolean;
}
export interface ProjectSessionRow extends TokenAgg {
  claude_session_id: string;
  app_session_id: string | null;
  title: string | null;
  session_name: string | null;
  is_fork: boolean | null;
}
export function useUsageByProject(project?: string) {
  return useQuery({
    queryKey: qk.usageByProject(project),
    queryFn: () =>
      api.get<ByProjectRow[] | { project: string; sessions: ProjectSessionRow[] }>(
        `/api/usage/by-project${project ? `?project=${encodeURIComponent(project)}` : ''}`,
      ),
  });
}

// --- MCP ---
export function useMcp(scope: 'user' | 'project', project?: string) {
  return useQuery({
    queryKey: qk.mcp(scope, project),
    queryFn: () =>
      api.get<{ scope: string; project?: string; servers: McpServer[] }>(
        `/api/mcp?scope=${scope}${project ? `&project=${encodeURIComponent(project)}` : ''}`,
      ),
    enabled: scope === 'user' || Boolean(project),
  });
}
/** Per-server connection status (runs `claude mcp list` server-side; slower than the list). */
export function useMcpStatus(scope: 'user' | 'project', project?: string) {
  return useQuery({
    queryKey: qk.mcpStatus(scope, project),
    queryFn: () =>
      api.get<{ statuses: Record<string, string> }>(
        `/api/mcp/status?scope=${scope}${project ? `&project=${encodeURIComponent(project)}` : ''}`,
      ),
    enabled: scope === 'user' || Boolean(project),
    staleTime: 30_000,
  });
}
export function useAddMcp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post('/api/mcp', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mcp'] }),
  });
}
export function useDeleteMcp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name, scope, project }: { name: string; scope: string; project?: string }) =>
      api.del(`/api/mcp/${encodeURIComponent(name)}?scope=${scope}${project ? `&project=${encodeURIComponent(project)}` : ''}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mcp'] }),
  });
}
/** Full stored config (incl. env/headers values) for prefilling the edit dialog. */
export function fetchMcpConfig(name: string, scope: string, project?: string) {
  return api.get<McpServerConfig>(
    `/api/mcp/${encodeURIComponent(name)}/config?scope=${scope}${project ? `&project=${encodeURIComponent(project)}` : ''}`,
  );
}

// --- Resources ---
export function useResourceStatus() {
  return useQuery({ queryKey: ['resStatus'], queryFn: () => api.get<{ dockerAvailable: boolean }>('/api/resources/status') });
}
export function useImages(search: string, filter: string) {
  return useQuery({
    queryKey: qk.images(search, filter),
    queryFn: () =>
      api.get<{ images: ImageInfo[]; totals: { count: number; totalSize: number } }>(
        `/api/resources/images?search=${encodeURIComponent(search)}&filter=${filter}`,
      ),
    refetchInterval: 10_000,
  });
}
export function useContainers(search: string, status: string) {
  return useQuery({
    queryKey: qk.containers(search, status),
    queryFn: () =>
      api.get<{ containers: ContainerInfo[]; totals: { count: number; totalCpu: number; totalMem: number } }>(
        `/api/resources/containers?search=${encodeURIComponent(search)}&status=${status}`,
      ),
    refetchInterval: 5_000,
  });
}
export function useIo(minutes: number) {
  return useQuery({
    queryKey: qk.io(minutes),
    queryFn: () => api.get<{ samples: IoSample[] }>(`/api/resources/io?minutes=${minutes}`),
    refetchInterval: 5_000,
  });
}
export function useContainerAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'start' | 'stop' | 'restart' }) =>
      api.post(`/api/resources/containers/${id}/${action}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['containers'] }),
  });
}
export function useDeleteContainers() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => api.post('/api/resources/containers/bulk-delete', { ids, force: true }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['containers'] }),
  });
}
export function useDeleteImages() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => api.post('/api/resources/images/bulk-delete', { ids, force: false }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['images'] }),
  });
}

// --- Config ---
export function useConfig() {
  return useQuery({ queryKey: qk.config, queryFn: () => api.get<AppConfig>('/api/config') });
}
export function usePatchConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => api.patch<{ ok: boolean; settings: Record<string, string> }>('/api/config', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.config }),
  });
}
