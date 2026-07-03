import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import * as svc from './service.js';

const configSchema = z
  .object({
    mode: z.string().max(20).optional(),
    permissionMode: z.string().max(40).optional(),
    model: z.string().max(80).nullable().optional(),
    effort: z.enum(['low', 'medium', 'high', 'xhigh', 'max']).nullable().optional(),
    workflows: z.boolean().nullable().optional(),
    thinking: z.boolean().nullable().optional(),
    thinkingTokens: z.number().int().min(1024).max(200000).nullable().optional(),
  })
  .passthrough();

const createSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  config: configSchema.optional(),
});

const forkSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  findingId: z.string().max(100).optional(),
  config: configSchema.optional(),
});

const patchSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(5000).nullable().optional(),
  config: configSchema.optional(),
});

const reportSchema = z.object({
  target: z.string().min(1).max(100), // 'consolidated' or a finding id
  markdown: z.string().max(2_000_000),
});

export async function registerSessions(app: FastifyInstance): Promise<void> {
  await app.register(async (r) => {
    r.addHook('preHandler', app.authGuard);

    r.post('/api/projects/:id/sessions', async (req, reply) => {
      const body = createSchema.parse(req.body);
      const session = svc.createSession((req.params as { id: string }).id, body);
      return reply.code(201).send(session);
    });

    r.post('/api/sessions/:id/fork', async (req, reply) => {
      const body = forkSchema.parse(req.body);
      const child = svc.forkSession((req.params as { id: string }).id, body);
      return reply.code(201).send(child);
    });

    r.get('/api/sessions/:id', async (req) => svc.getDetail((req.params as { id: string }).id));
    r.get('/api/sessions/:id/family', async (req) => svc.getFamily((req.params as { id: string }).id));
    r.get('/api/sessions/:id/findings', async (req) => svc.getFindings((req.params as { id: string }).id));
    r.get('/api/sessions/:id/report', async (req) => svc.getReport((req.params as { id: string }).id));
    r.get('/api/sessions/:id/usage', async (req) => svc.getSessionUsage((req.params as { id: string }).id));

    r.patch('/api/sessions/:id/report', async (req) => {
      const b = reportSchema.parse(req.body);
      return svc.saveReport((req.params as { id: string }).id, b.target, b.markdown);
    });

    r.patch('/api/sessions/:id', async (req) => {
      const body = patchSchema.parse(req.body);
      return svc.updateMeta((req.params as { id: string }).id, body);
    });

    r.delete('/api/sessions/:id', async (req, reply) => {
      svc.remove((req.params as { id: string }).id);
      return reply.code(204).send();
    });
  });
}
