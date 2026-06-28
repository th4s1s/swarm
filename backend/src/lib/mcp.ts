import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { run } from './exec.js';
import { config } from '../config.js';
import { projectDir } from './paths.js';

function readJson(path: string): Record<string, unknown> | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export interface McpServer {
  name: string;
  scope: 'user' | 'project';
  transport: string; // stdio | http | sse | unknown
  command?: string;
  args?: string[];
  url?: string;
  hasEnv: boolean;
  hasHeaders: boolean;
}

function shape(name: string, cfg: Record<string, unknown>, scope: 'user' | 'project'): McpServer {
  const type = typeof cfg['type'] === 'string' ? (cfg['type'] as string) : cfg['url'] ? 'http' : 'stdio';
  return {
    name,
    scope,
    transport: type,
    command: typeof cfg['command'] === 'string' ? (cfg['command'] as string) : undefined,
    args: Array.isArray(cfg['args']) ? (cfg['args'] as string[]) : undefined,
    url: typeof cfg['url'] === 'string' ? (cfg['url'] as string) : undefined,
    hasEnv: Boolean(cfg['env'] && Object.keys(cfg['env'] as object).length),
    hasHeaders: Boolean(cfg['headers'] && Object.keys(cfg['headers'] as object).length),
  };
}

export function listUserServers(): McpServer[] {
  const j = readJson(join(homedir(), '.claude.json'));
  const servers = (j?.['mcpServers'] ?? {}) as Record<string, Record<string, unknown>>;
  return Object.entries(servers).map(([name, cfg]) => shape(name, cfg, 'user'));
}

export function listProjectServers(projectName: string): McpServer[] {
  const j = readJson(join(projectDir(projectName), '.mcp.json'));
  const servers = (j?.['mcpServers'] ?? {}) as Record<string, Record<string, unknown>>;
  return Object.entries(servers).map(([name, cfg]) => shape(name, cfg, 'project'));
}

type Scope = 'user' | 'project' | 'local';

function cwdForScope(scope: Scope, projectName?: string): string {
  if (scope === 'user') return homedir();
  if (!projectName) throw new Error('project is required for project/local scope');
  return projectDir(projectName);
}

export interface AddStdio {
  name: string;
  transport: 'stdio';
  command: string;
  args?: string[];
  env?: Record<string, string>;
  scope: Scope;
  project?: string;
}
export interface AddRemote {
  name: string;
  transport: 'http' | 'sse';
  url: string;
  headers?: Record<string, string>;
  scope: Scope;
  project?: string;
}
export type AddInput = AddStdio | AddRemote;

const NAME_RE = /^[A-Za-z0-9._-]+$/;

export async function addServer(input: AddInput): Promise<void> {
  if (!NAME_RE.test(input.name)) throw new Error('invalid server name');
  const cwd = cwdForScope(input.scope, input.project);
  const args = ['mcp', 'add', '-s', input.scope, '-t', input.transport];
  if (input.transport === 'stdio') {
    for (const [k, v] of Object.entries(input.env ?? {})) args.push('-e', `${k}=${v}`);
    args.push(input.name, '--', input.command, ...(input.args ?? []));
  } else {
    for (const [k, v] of Object.entries(input.headers ?? {})) args.push('-H', `${k}: ${v}`);
    args.push(input.name, input.url);
  }
  await run(config.claudeBin, args, { cwd, timeoutMs: 30_000 });
}

export async function addServerJson(name: string, jsonConfig: string, scope: Scope, project?: string): Promise<void> {
  if (!NAME_RE.test(name)) throw new Error('invalid server name');
  JSON.parse(jsonConfig); // validate
  const cwd = cwdForScope(scope, project);
  await run(config.claudeBin, ['mcp', 'add-json', '-s', scope, name, jsonConfig], { cwd, timeoutMs: 30_000 });
}

export async function removeServer(name: string, scope: Scope, project?: string): Promise<void> {
  if (!NAME_RE.test(name)) throw new Error('invalid server name');
  const cwd = cwdForScope(scope, project);
  await run(config.claudeBin, ['mcp', 'remove', '-s', scope, name], { cwd, timeoutMs: 30_000 });
}

export interface McpServerConfig {
  name: string;
  scope: 'user' | 'project';
  transport: string; // stdio | http | sse
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
  headers?: Record<string, string>;
}

/**
 * Full stored config for one server (incl. env/headers VALUES) read from the same
 * JSON the list endpoints read. Used to prefill the edit dialog. Returns null if absent.
 */
export function getServerConfig(
  name: string,
  scope: 'user' | 'project',
  projectName?: string,
): McpServerConfig | null {
  if (!NAME_RE.test(name)) throw new Error('invalid server name');
  const path =
    scope === 'project'
      ? projectName
        ? join(projectDir(projectName), '.mcp.json')
        : null
      : join(homedir(), '.claude.json');
  if (!path) return null;
  const j = readJson(path);
  const servers = (j?.['mcpServers'] ?? {}) as Record<string, Record<string, unknown>>;
  const cfg = servers[name];
  if (!cfg) return null;
  const type = typeof cfg['type'] === 'string' ? (cfg['type'] as string) : cfg['url'] ? 'http' : 'stdio';
  const asRecord = (v: unknown): Record<string, string> | undefined =>
    v && typeof v === 'object' ? (v as Record<string, string>) : undefined;
  return {
    name,
    scope,
    transport: type,
    command: typeof cfg['command'] === 'string' ? (cfg['command'] as string) : undefined,
    args: Array.isArray(cfg['args']) ? (cfg['args'] as string[]) : undefined,
    url: typeof cfg['url'] === 'string' ? (cfg['url'] as string) : undefined,
    env: asRecord(cfg['env']),
    headers: asRecord(cfg['headers']),
  };
}

/** Raw `claude mcp get <name>` output (includes a live health check). */
export async function getServerDetail(name: string, projectName?: string): Promise<string> {
  if (!NAME_RE.test(name)) throw new Error('invalid server name');
  const cwd = projectName ? projectDir(projectName) : homedir();
  const res = await run(config.claudeBin, ['mcp', 'get', name], { cwd, timeoutMs: 30_000 }).catch((e) => ({
    stdout: '',
    stderr: (e as Error).message,
    code: 1,
  }));
  return res.stdout || res.stderr;
}
