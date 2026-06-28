import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { badRequest } from '../lib/errors.js';
import { getProjectByName } from '../projects/repo.js';
import {
  addServer,
  addServerJson,
  getServerDetail,
  listProjectServers,
  listUserServers,
  removeServer,
} from '../lib/mcp.js';

const scope = z.enum(['user', 'project', 'local']);

const addSchema = z.discriminatedUnion('transport', [
  z.object({
    transport: z.literal('stdio'),
    name: z.string().min(1).max(100),
    command: z.string().min(1).max(500),
    args: z.array(z.string().max(500)).max(50).optional(),
    env: z.record(z.string(), z.string()).optional(),
    scope,
    project: z.string().max(100).optional(),
  }),
  z.object({
    transport: z.enum(['http', 'sse']),
    name: z.string().min(1).max(100),
    url: z.string().min(1).max(2000),
    headers: z.record(z.string(), z.string()).optional(),
    scope,
    project: z.string().max(100).optional(),
  }),
]);

const addJsonSchema = z.object({
  name: z.string().min(1).max(100),
  json: z.string().min(2).max(20000),
  scope,
  project: z.string().max(100).optional(),
});

function requireProject(scopeVal: string, project?: string): void {
  if ((scopeVal === 'project' || scopeVal === 'local')) {
    if (!project) throw badRequest('project is required for project/local scope');
    if (!getProjectByName(project)) throw badRequest(`unknown project "${project}"`);
  }
}

export async function registerMcp(app: FastifyInstance): Promise<void> {
  await app.register(async (r) => {
    r.addHook('preHandler', app.authGuard);

    // List servers. ?scope=user (default) or ?scope=project&project=<name>
    r.get('/api/mcp', async (req) => {
      const q = req.query as { scope?: string; project?: string };
      if (q.scope === 'project') {
        if (!q.project || !getProjectByName(q.project)) throw badRequest('valid project required');
        return { scope: 'project', project: q.project, servers: listProjectServers(q.project) };
      }
      return { scope: 'user', servers: listUserServers() };
    });

    r.get('/api/mcp/:name', async (req) => {
      const name = (req.params as { name: string }).name;
      const project = (req.query as { project?: string }).project;
      return { name, detail: await getServerDetail(name, project) };
    });

    r.post('/api/mcp', async (req, reply) => {
      const body = addSchema.parse(req.body);
      requireProject(body.scope, body.project);
      await addServer(body);
      return reply.code(201).send({ ok: true });
    });

    r.post('/api/mcp/json', async (req, reply) => {
      const body = addJsonSchema.parse(req.body);
      requireProject(body.scope, body.project);
      await addServerJson(body.name, body.json, body.scope, body.project);
      return reply.code(201).send({ ok: true });
    });

    r.delete('/api/mcp/:name', async (req, reply) => {
      const name = (req.params as { name: string }).name;
      const q = req.query as { scope?: string; project?: string };
      const sc = (q.scope as 'user' | 'project' | 'local') ?? 'user';
      requireProject(sc, q.project);
      await removeServer(name, sc, q.project);
      return reply.code(204).send();
    });
  });
}
