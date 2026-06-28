import { db } from '../db/index.js';
import { newId, nowIso } from '../lib/util.js';

export interface ProjectRow {
  id: string;
  title: string;
  name: string;
  description: string | null;
  source_type: 'git' | 'zip';
  git_url: string | null;
  git_default_branch: string | null;
  current_ref: string | null;
  current_commit: string | null;
  created_at: string;
  updated_at: string;
}

export interface NewProject {
  title: string;
  name: string;
  description?: string | null;
  sourceType: 'git' | 'zip';
  gitUrl?: string | null;
  gitDefaultBranch?: string | null;
  currentRef?: string | null;
  currentCommit?: string | null;
}

export function insertProject(p: NewProject): ProjectRow {
  const id = newId();
  const ts = nowIso();
  db()
    .prepare(
      `INSERT INTO projects
       (id, title, name, description, source_type, git_url, git_default_branch, current_ref, current_commit, created_at, updated_at)
       VALUES (@id, @title, @name, @description, @source_type, @git_url, @git_default_branch, @current_ref, @current_commit, @created_at, @updated_at)`,
    )
    .run({
      id,
      title: p.title,
      name: p.name,
      description: p.description ?? null,
      source_type: p.sourceType,
      git_url: p.gitUrl ?? null,
      git_default_branch: p.gitDefaultBranch ?? null,
      current_ref: p.currentRef ?? null,
      current_commit: p.currentCommit ?? null,
      created_at: ts,
      updated_at: ts,
    });
  return getProjectById(id)!;
}

export const getProjectById = (id: string): ProjectRow | undefined =>
  db().prepare('SELECT * FROM projects WHERE id = ?').get(id) as ProjectRow | undefined;

export const getProjectByName = (name: string): ProjectRow | undefined =>
  db().prepare('SELECT * FROM projects WHERE name = ?').get(name) as ProjectRow | undefined;

export const listProjects = (): ProjectRow[] =>
  db().prepare('SELECT * FROM projects ORDER BY created_at DESC').all() as ProjectRow[];

export function updateProject(
  id: string,
  fields: Partial<Pick<ProjectRow, 'title' | 'description' | 'current_ref' | 'current_commit' | 'git_default_branch'>>,
): void {
  const allowed = ['title', 'description', 'current_ref', 'current_commit', 'git_default_branch'] as const;
  const sets: string[] = [];
  const params: Record<string, unknown> = { id, updated_at: nowIso() };
  for (const k of allowed) {
    if (k in fields && fields[k] !== undefined) {
      sets.push(`${k} = @${k}`);
      params[k] = fields[k];
    }
  }
  if (sets.length === 0) return;
  db()
    .prepare(`UPDATE projects SET ${sets.join(', ')}, updated_at = @updated_at WHERE id = @id`)
    .run(params);
}

export function deleteProject(id: string): void {
  db().prepare('DELETE FROM projects WHERE id = ?').run(id);
}
