import { Link } from 'react-router-dom';
import { FileArchive, FolderGit2, GitBranch } from 'lucide-react';
import { PageHeader } from '@/components/AppShell';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState, ErrorNote, Loading } from '@/components/ui/misc';
import { shortSha } from '@/lib/format';
import { NewProjectDialog } from './NewProjectDialog';
import { useProjects } from './api';

export function ProjectsPage() {
  const q = useProjects();

  return (
    <div>
      <PageHeader
        title="Projects"
        subtitle="Targets under audit - clone from git or upload a zip"
        actions={<NewProjectDialog />}
      />
      <div className="p-6">
        {q.isLoading ? (
          <Loading />
        ) : q.isError ? (
          <ErrorNote error={q.error} />
        ) : !q.data?.length ? (
          <EmptyState
            icon={<FolderGit2 className="size-8" />}
            title="No projects yet"
            hint="Create a project to start auditing. You can clone a git repo (with an optional token) or upload a zip of the source."
            action={<NewProjectDialog />}
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {q.data.map((p) => (
              <Link key={p.id} to={`/projects/${p.id}`}>
                <Card className="h-full p-4 transition-all hover:border-primary/50 hover:shadow-glow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate font-semibold text-fg">{p.title}</div>
                      <div className="truncate font-mono text-xs text-muted">{p.name}</div>
                    </div>
                    <Badge tone={p.source_type === 'git' ? 'primary' : 'neutral'}>
                      {p.source_type === 'git' ? <GitBranch className="size-3" /> : <FileArchive className="size-3" />}
                      {p.source_type}
                    </Badge>
                  </div>
                  {p.description ? (
                    <p className="mt-2 line-clamp-2 text-xs text-muted">{p.description}</p>
                  ) : null}
                  <div className="mt-3 flex items-center gap-3 text-[11px] text-muted">
                    {p.source_type === 'git' && (
                      <span className="inline-flex items-center gap-1">
                        <GitBranch className="size-3" />
                        {p.current_ref ?? '-'} @ {shortSha(p.current_commit)}
                      </span>
                    )}
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
