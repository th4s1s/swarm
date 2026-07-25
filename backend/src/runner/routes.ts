import { existsSync, readFileSync } from 'node:fs';
import type { FastifyInstance } from 'fastify';
import type { WebSocket } from '@fastify/websocket';
import { z } from 'zod';
import { badRequest, notFound } from '../lib/errors.js';
import { PHASES, MODES } from './prompt.js';
import { getModels } from './models.js';
import { runner } from './manager.js';
import { hub } from './hub.js';
import { getRunById, listBySession, deleteQueuedRun } from './repo.js';
import { getSessionById } from '../sessions/repo.js';

const runSchema = z.object({
  phase: z.enum(PHASES).optional(),
  mode: z.enum(MODES).optional(),
  customPrompt: z.string().max(20000).optional(),
  findingId: z.string().max(100).optional(),
  compact: z.boolean().optional(),
});
const steerSchema = z.object({ text: z.string().min(1).max(20000) });

function readEventLog(path: string | null): Record<string, unknown>[] {
  if (!path || !existsSync(path)) return [];
  const out: Record<string, unknown>[] = [];
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t) continue;
    try {
      out.push(JSON.parse(t) as Record<string, unknown>);
    } catch {
      out.push({ type: '_nonjson', text: t });
    }
  }
  return out;
}

export async function registerRunner(app: FastifyInstance): Promise<void> {
  // --- REST (guarded) ---
  await app.register(async (r) => {
    r.addHook('preHandler', app.authGuard);

    r.get('/api/runner/options', async () => ({
      phases: PHASES,
      modes: MODES,
      models: await getModels(), // live from Claude (cached); falls back if the API is unreachable
    }));

    r.post('/api/sessions/:id/runs', async (req, reply) => {
      const body = runSchema.parse(req.body);
      const run = runner.enqueue((req.params as { id: string }).id, body);
      return reply.code(201).send(run);
    });

    r.get('/api/sessions/:id/runs', async (req) => {
      const id = (req.params as { id: string }).id;
      if (!getSessionById(id)) throw notFound('session not found');
      return listBySession(id);
    });

    r.post('/api/sessions/:id/steer', async (req, reply) => {
      const { text } = steerSchema.parse(req.body);
      const run = runner.steer((req.params as { id: string }).id, text);
      return reply.code(201).send(run);
    });

    r.post('/api/sessions/:id/stop', async (req, reply) => {
      runner.stopSession((req.params as { id: string }).id);
      return reply.send({ ok: true });
    });

    r.get('/api/runs/:id', async (req) => {
      const run = getRunById((req.params as { id: string }).id);
      if (!run) throw notFound('run not found');
      return { ...run, active: runner.isActive(run.id) };
    });

    r.get('/api/runs/:id/events', async (req) => {
      const run = getRunById((req.params as { id: string }).id);
      if (!run) throw notFound('run not found');
      return { runId: run.id, events: readEventLog(run.event_log_path) };
    });

    r.post('/api/runs/:id/cancel', async (req, reply) => {
      runner.cancel((req.params as { id: string }).id);
      return reply.send({ ok: true });
    });

    r.delete('/api/runs/:id', async (req, reply) => {
      const id = (req.params as { id: string }).id;
      const run = getRunById(id);
      if (!run) throw notFound('run not found');
      if (!deleteQueuedRun(id)) throw badRequest('only queued runs can be deleted; cancel a running run instead');
      return reply.code(204).send();
    });
  });

  // --- WebSocket live stream: /ws/sessions/:id ---
  app.get('/ws/sessions/:id', { websocket: true }, (socket: WebSocket, req) => {
    const token = req.cookies?.['vh_session'] ?? (req.query as { token?: string }).token;
    try {
      if (!token) throw new Error('no token');
      app.jwt.verify(token);
    } catch {
      socket.close(1008, 'unauthorized');
      return;
    }
    const id = (req.params as { id: string }).id;
    if (!getSessionById(id)) {
      socket.close(1011, 'session not found');
      return;
    }
    hub.subscribe(id, socket);
    socket.send(JSON.stringify({ kind: 'hello', sessionId: id }));
    socket.on('close', () => hub.unsubscribe(id, socket));
    socket.on('error', () => hub.unsubscribe(id, socket));
  });
}
