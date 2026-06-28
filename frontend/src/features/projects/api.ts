import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { qk } from '@/lib/query';
import type { Project, ProjectDetail, RefList, UpdateStatus } from '@/lib/types';

export function useProjects() {
  return useQuery({ queryKey: qk.projects, queryFn: () => api.get<Project[]>('/api/projects') });
}

export function useProject(id: string) {
  return useQuery({ queryKey: qk.project(id), queryFn: () => api.get<ProjectDetail>(`/api/projects/${id}`) });
}

export function useCreateGitProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: { title: string; name: string; description?: string; url: string; token?: string }) =>
      api.post<Project>('/api/projects', b),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.projects }),
  });
}

export function useCreateZipProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (form: FormData) => api.upload<Project>('/api/projects', form),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.projects }),
  });
}

export function useUpdateProject(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: { title?: string; description?: string | null; live_instance_note?: string }) =>
      api.patch<ProjectDetail>(`/api/projects/${id}`, b),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.project(id) });
      qc.invalidateQueries({ queryKey: qk.projects });
    },
  });
}

export function useDeleteProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, purge }: { id: string; purge?: boolean }) =>
      api.del(`/api/projects/${id}${purge ? '?purgeAudits=true' : ''}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.projects }),
  });
}

export function useBranches(id: string, enabled: boolean) {
  return useQuery({
    queryKey: qk.branches(id),
    queryFn: () => api.get<RefList>(`/api/projects/${id}/branches`),
    enabled,
  });
}

export function useCheckout(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ref: string) => api.post<Project>(`/api/projects/${id}/checkout`, { ref }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.project(id) }),
  });
}

export function useCheckUpdates(id: string) {
  return useMutation({
    mutationFn: (token?: string) => api.post<UpdateStatus>(`/api/projects/${id}/check-updates`, { token }),
  });
}

export function useApplyUpdate(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: { ref?: string; token?: string }) => api.post<Project>(`/api/projects/${id}/update`, b),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.project(id) }),
  });
}

export function useReuploadZip(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (form: FormData) => api.upload<Project>(`/api/projects/${id}/reupload`, form),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.project(id) }),
  });
}
