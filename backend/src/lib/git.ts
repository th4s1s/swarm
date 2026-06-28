import { mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run, type RunResult } from './exec.js';

/** Strip any embedded credentials from a URL for safe storage/display. */
export function sanitizeUrl(url: string): string {
  try {
    const u = new URL(url);
    u.username = '';
    u.password = '';
    return u.toString();
  } catch {
    return url; // ssh-style scp urls (git@host:repo) - nothing to strip
  }
}

function defaultUserForHost(url: string): string {
  try {
    const host = new URL(url).hostname;
    if (host.includes('gitlab')) return 'oauth2';
    if (host.includes('bitbucket')) return 'x-token-auth';
    return 'x-access-token'; // github + sensible default
  } catch {
    return 'x-access-token';
  }
}

/**
 * Run a git operation with an optional token supplied via GIT_ASKPASS, so the
 * token never appears in argv (ps) or in the stored remote config. For HTTPS
 * urls without embedded userinfo we inject a non-secret username so git asks
 * askpass for the password (the token).
 */
async function withAskpass<T>(
  token: string | undefined,
  url: string | undefined,
  fn: (extraEnv: NodeJS.ProcessEnv, effectiveUrl: string | undefined) => Promise<T>,
): Promise<T> {
  if (!token) return fn({ GIT_TERMINAL_PROMPT: '0' }, url);

  const dir = mkdtempSync(join(tmpdir(), 'vh-askpass-'));
  const script = join(dir, 'askpass.sh');
  // Print the token regardless of which prompt git issues.
  writeFileSync(script, `#!/bin/sh\nprintf '%s' "$VH_GIT_TOKEN"\n`, { mode: 0o700 });

  let effectiveUrl = url;
  if (url) {
    try {
      const u = new URL(url);
      if (!u.username) u.username = defaultUserForHost(url);
      effectiveUrl = u.toString();
    } catch {
      /* non-http url; leave as-is */
    }
  }
  try {
    return await fn(
      { GIT_ASKPASS: script, GIT_TERMINAL_PROMPT: '0', VH_GIT_TOKEN: token },
      effectiveUrl,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const git = (args: string[], cwd?: string, env?: NodeJS.ProcessEnv, timeoutMs = 300_000): Promise<RunResult> =>
  run('git', args, { cwd, env: { ...process.env, ...env }, timeoutMs });

export function isGitRepo(dir: string): boolean {
  return existsSync(join(dir, '.git'));
}

export async function cloneRepo(url: string, dest: string, token?: string): Promise<void> {
  await withAskpass(token, url, (env, effUrl) =>
    git(['clone', '--no-single-branch', '--', effUrl ?? url, dest], undefined, env),
  );
  // Ensure the stored remote carries no credentials.
  await git(['remote', 'set-url', 'origin', sanitizeUrl(url)], dest).catch(() => undefined);
}

export async function defaultBranch(dir: string): Promise<string | null> {
  try {
    const r = await git(['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], dir);
    return r.stdout.trim().replace(/^origin\//, '') || null;
  } catch {
    try {
      const r = await git(['rev-parse', '--abbrev-ref', 'HEAD'], dir);
      return r.stdout.trim() || null;
    } catch {
      return null;
    }
  }
}

export async function headCommit(dir: string): Promise<string | null> {
  try {
    return (await git(['rev-parse', 'HEAD'], dir)).stdout.trim() || null;
  } catch {
    return null;
  }
}

export async function currentRef(dir: string): Promise<string | null> {
  try {
    const b = (await git(['rev-parse', '--abbrev-ref', 'HEAD'], dir)).stdout.trim();
    if (b && b !== 'HEAD') return b;
    // Detached: prefer an exact tag name, else short sha.
    const tag = await git(['describe', '--tags', '--exact-match'], dir).catch(() => null);
    if (tag && tag.stdout.trim()) return tag.stdout.trim();
    return (await git(['rev-parse', '--short', 'HEAD'], dir)).stdout.trim() || null;
  } catch {
    return null;
  }
}

export interface RefList {
  branches: string[];
  tags: string[];
}

/** List branches/tags from the LOCAL clone (a full clone fetches all of them). */
export async function listRefs(dir: string): Promise<RefList> {
  const branchesRaw = await git(
    ['for-each-ref', '--format=%(refname:short)', 'refs/remotes/origin'],
    dir,
  ).catch(() => ({ stdout: '' }) as RunResult);
  const tagsRaw = await git(['tag', '--list'], dir).catch(() => ({ stdout: '' }) as RunResult);

  const branches = branchesRaw.stdout
    .split('\n')
    .map((s) => s.trim().replace(/^origin\//, ''))
    .filter((s) => s && s !== 'HEAD');
  const tags = tagsRaw.stdout
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
  return { branches: [...new Set(branches)].sort(), tags: tags.sort() };
}

const VALID_REF = /^[A-Za-z0-9._\/-]+$/;

/** Checkout a branch/tag/commit. Validates the ref against the repo to prevent arg injection. */
export async function checkout(dir: string, ref: string): Promise<void> {
  if (!VALID_REF.test(ref) || ref.startsWith('-')) {
    throw new Error('invalid ref');
  }
  await git(['checkout', '--detach', '--', ref], dir).catch(async () => {
    // Fall back to a normal checkout (so branch names track origin) if --detach -- isn't ideal.
    await git(['checkout', ref], dir);
  });
}

export async function fetchAll(dir: string, url: string, token?: string): Promise<void> {
  await withAskpass(token, url, (env) =>
    git(['fetch', '--all', '--tags', '--prune'], dir, env),
  );
}

export interface UpdateStatus {
  hasUpdates: boolean;
  ahead: number;
  behind: number;
  currentRef: string | null;
  localCommit: string | null;
  remoteCommit: string | null;
  newTags: string[];
}

/** Fetch, then compare HEAD's upstream to report ahead/behind + any new tags. */
export async function checkForUpdates(dir: string, url: string, token?: string): Promise<UpdateStatus> {
  const tagsBefore = new Set((await listRefs(dir)).tags);
  await fetchAll(dir, url, token);
  const refsAfter = await listRefs(dir);
  const newTags = refsAfter.tags.filter((t) => !tagsBefore.has(t));

  const cur = await currentRef(dir);
  const localCommit = await headCommit(dir);
  let ahead = 0;
  let behind = 0;
  let remoteCommit: string | null = null;

  // Determine the upstream commit (branch's origin counterpart, else origin/HEAD).
  let upstreamRef = '@{u}';
  const upstreamOk = await git(['rev-parse', '--verify', '--quiet', '@{u}'], dir).catch(() => null);
  if (!upstreamOk || !upstreamOk.stdout.trim()) {
    const def = await defaultBranch(dir);
    upstreamRef = def ? `origin/${def}` : 'origin/HEAD';
  }
  try {
    remoteCommit = (await git(['rev-parse', upstreamRef], dir)).stdout.trim() || null;
    const counts = await git(['rev-list', '--left-right', '--count', `HEAD...${upstreamRef}`], dir);
    const [a, b] = counts.stdout.trim().split(/\s+/).map((n) => Number(n) || 0);
    ahead = a ?? 0;
    behind = b ?? 0;
  } catch {
    /* no upstream resolvable */
  }
  return {
    hasUpdates: behind > 0 || newTags.length > 0,
    ahead,
    behind,
    currentRef: cur,
    localCommit,
    remoteCommit,
    newTags,
  };
}

/** Pull updates for the current branch (fast-forward); for detached/tag refs, callers re-checkout. */
export async function pull(dir: string, url: string, token?: string): Promise<void> {
  await withAskpass(token, url, (env) => git(['pull', '--ff-only'], dir, env));
}
