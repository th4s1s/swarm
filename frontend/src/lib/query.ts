import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 5_000,
    },
  },
});

export const qk = {
  me: ['me'] as const,
  projects: ['projects'] as const,
  project: (id: string) => ['project', id] as const,
  branches: (id: string) => ['branches', id] as const,
  session: (id: string) => ['session', id] as const,
  family: (id: string) => ['family', id] as const,
  findings: (id: string) => ['findings', id] as const,
  report: (id: string) => ['report', id] as const,
  runs: (id: string) => ['runs', id] as const,
  runEvents: (id: string) => ['runEvents', id] as const,
  runnerOptions: ['runnerOptions'] as const,
  quota: ['quota'] as const,
  usageSummary: ['usage', 'summary'] as const,
  usageByModel: ['usage', 'byModel'] as const,
  usageTimeseries: (days: number) => ['usage', 'timeseries', days] as const,
  usageByProject: (project?: string) => ['usage', 'byProject', project ?? '*'] as const,
  mcp: (scope: string, project?: string) => ['mcp', scope, project ?? '*'] as const,
  mcpConfig: (scope: string, name: string, project?: string) =>
    ['mcpConfig', scope, name, project ?? '*'] as const,
  images: (search: string, filter: string) => ['images', search, filter] as const,
  containers: (search: string, status: string) => ['containers', search, status] as const,
  io: (minutes: number) => ['io', minutes] as const,
  config: ['config'] as const,
};
