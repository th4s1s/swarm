import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { db } from '../db/index.js';
import { AppError, badRequest, conflict, notFound } from '../lib/errors.js';
import * as git from '../lib/git.js';
import {
  assertValidProjectName,
  auditHome,
  isPathInside,
  liveInstanceNotePath,
  projectDir,
  InvalidNameError,
} from '../lib/paths.js';
import { config } from '../config.js';
import { extractZipBuffer, wipeDirContents } from '../lib/zip.js';
import {
  deleteProject,
  getProjectById,
  getProjectByName,
  insertProject,
  listProjects,
  updateProject,
  type ProjectRow,
} from './repo.js';

export interface ProjectDetail extends ProjectRow {
  is_git: boolean;
  sessions: { id: string; title: string; session_name: string; status: string }[];
  live_instance_note: string | null;
}

function assertCreatable(name: string): void {
  try {
    assertValidProjectName(name);
  } catch (e) {
    if (e instanceof InvalidNameError) throw badRequest(e.message);
    throw e;
  }
  if (getProjectByName(name)) throw conflict(`a project named "${name}" already exists`);
  if (existsSync(projectDir(name))) throw conflict(`directory ${projectDir(name)} already exists`);
}

function rollbackDirs(name: string): void {
  // Only ever touches paths inside the configured roots.
  const pd = projectDir(name);
  if (isPathInside(config.projectsDir, pd)) rmSync(pd, { recursive: true, force: true });
}

export async function createGitProject(input: {
  title: string;
  name: string;
  description?: string | null;
  url: string;
  token?: string;
}): Promise<ProjectRow> {
  assertCreatable(input.name);
  const dest = projectDir(input.name);
  try {
    await git.cloneRepo(input.url, dest, input.token);
  } catch (e) {
    rollbackDirs(input.name);
    throw badRequest(`git clone failed: ${(e as Error).message}`);
  }
  const [defBranch, commit, ref] = await Promise.all([
    git.defaultBranch(dest),
    git.headCommit(dest),
    git.currentRef(dest),
  ]);
  mkdirSync(auditHome(input.name), { recursive: true });
  return insertProject({
    title: input.title,
    name: input.name,
    description: input.description ?? null,
    sourceType: 'git',
    gitUrl: git.sanitizeUrl(input.url),
    gitDefaultBranch: defBranch,
    currentRef: ref,
    currentCommit: commit,
  });
}

export function createZipProject(
  input: { title: string; name: string; description?: string | null },
  zipBuf: Buffer,
): ProjectRow {
  assertCreatable(input.name);
  const dest = projectDir(input.name);
  try {
    mkdirSync(dest, { recursive: true });
    extractZipBuffer(zipBuf, dest);
  } catch (e) {
    rollbackDirs(input.name);
    throw badRequest(`zip extraction failed: ${(e as Error).message}`);
  }
  mkdirSync(auditHome(input.name), { recursive: true });
  return insertProject({
    title: input.title,
    name: input.name,
    description: input.description ?? null,
    sourceType: 'zip',
  });
}

export const list = (): ProjectRow[] => listProjects();

export function mustGet(id: string): ProjectRow {
  const p = getProjectById(id);
  if (!p) throw notFound('project not found');
  return p;
}

export function getDetail(id: string): ProjectDetail {
  const p = mustGet(id);
  const sessions = db()
    .prepare(
      `SELECT id, title, session_name, status FROM audit_sessions
       WHERE project_id = ? AND parent_session_id IS NULL ORDER BY created_at DESC`,
    )
    .all(p.id) as { id: string; title: string; session_name: string; status: string }[];
  return {
    ...p,
    is_git: p.source_type === 'git',
    sessions,
    live_instance_note: readLiveNote(p.name),
  };
}

export function updateMeta(
  id: string,
  fields: { title?: string; description?: string | null; live_instance_note?: string },
): ProjectDetail {
  const p = mustGet(id);
  if (fields.title !== undefined || fields.description !== undefined) {
    updateProject(p.id, { title: fields.title, description: fields.description });
  }
  if (fields.live_instance_note !== undefined) writeLiveNote(p.name, fields.live_instance_note);
  return getDetail(id);
}

export function readLiveNote(name: string): string | null {
  const f = liveInstanceNotePath(name);
  return existsSync(f) ? readFileSync(f, 'utf8') : null;
}

export function writeLiveNote(name: string, content: string): void {
  mkdirSync(auditHome(name), { recursive: true });
  writeFileSync(liveInstanceNotePath(name), content);
}

function assertGit(p: ProjectRow): void {
  if (p.source_type !== 'git') throw badRequest('this operation is only available for git projects');
}

export async function listBranches(id: string): Promise<git.RefList> {
  const p = mustGet(id);
  assertGit(p);
  return git.listRefs(projectDir(p.name));
}

export async function checkoutRef(id: string, ref: string): Promise<ProjectRow> {
  const p = mustGet(id);
  assertGit(p);
  if (typeof ref !== 'string' || !ref) throw badRequest('ref is required');
  try {
    await git.checkout(projectDir(p.name), ref);
  } catch (e) {
    throw badRequest(`checkout failed: ${(e as Error).message}`);
  }
  const [commit, curRef] = await Promise.all([
    git.headCommit(projectDir(p.name)),
    git.currentRef(projectDir(p.name)),
  ]);
  updateProject(p.id, { current_ref: curRef ?? ref, current_commit: commit });
  return getProjectById(p.id)!;
}

export async function checkUpdates(id: string, token?: string): Promise<git.UpdateStatus> {
  const p = mustGet(id);
  assertGit(p);
  if (!p.git_url) throw badRequest('project has no git url');
  return git.checkForUpdates(projectDir(p.name), p.git_url, token);
}

export async function applyUpdate(id: string, ref: string | undefined, token?: string): Promise<ProjectRow> {
  const p = mustGet(id);
  assertGit(p);
  if (!p.git_url) throw badRequest('project has no git url');
  const dir = projectDir(p.name);
  await git.fetchAll(dir, p.git_url, token);
  if (ref) {
    await git.checkout(dir, ref);
  } else {
    await git.pull(dir, p.git_url, token).catch(async (e) => {
      throw badRequest(`update failed (not fast-forwardable?): ${(e as Error).message}`);
    });
  }
  const [commit, curRef] = await Promise.all([git.headCommit(dir), git.currentRef(dir)]);
  updateProject(p.id, { current_ref: curRef, current_commit: commit });
  return getProjectById(p.id)!;
}

export function reuploadZip(id: string, zipBuf: Buffer): ProjectRow {
  const p = mustGet(id);
  if (p.source_type !== 'zip') throw badRequest('re-upload is only available for zip projects');
  const dir = projectDir(p.name);
  wipeDirContents(dir);
  try {
    extractZipBuffer(zipBuf, dir);
  } catch (e) {
    throw badRequest(`zip extraction failed: ${(e as Error).message}`);
  }
  updateProject(p.id, {});
  return getProjectById(p.id)!;
}

export function remove(id: string, purgeAudits = false): void {
  const p = mustGet(id);
  // Block deletion while any session has a running process (safety).
  const running = db()
    .prepare(`SELECT COUNT(*) c FROM runs r JOIN audit_sessions s ON s.id = r.session_id
              WHERE s.project_id = ? AND r.status = 'running'`)
    .get(p.id) as { c: number };
  if (running.c > 0) throw new AppError(409, 'cannot delete: a run is still active for this project');

  deleteProject(p.id); // cascades sessions + runs
  const pd = projectDir(p.name);
  if (isPathInside(config.projectsDir, pd)) rmSync(pd, { recursive: true, force: true });
  if (purgeAudits) {
    const ah = auditHome(p.name);
    if (isPathInside(config.auditsDir, ah)) rmSync(ah, { recursive: true, force: true });
  }
}
