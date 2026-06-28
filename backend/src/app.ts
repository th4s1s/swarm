import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import websocket from '@fastify/websocket';
import { ZodError } from 'zod';
import { config } from './config.js';
import { db } from './db/index.js';
import { AppError } from './lib/errors.js';
import { registerAuth } from './auth/index.js';
import { registerProjects } from './projects/routes.js';
import { registerSessions } from './sessions/routes.js';
import { registerRunner } from './runner/routes.js';
import { runner } from './runner/manager.js';
import { registerConfig } from './appconfig/routes.js';
import { registerQuota } from './quota/routes.js';
import { registerUsage } from './usage/routes.js';
import { registerMcp } from './mcp/routes.js';
import { registerResources } from './resources/routes.js';
import { startSampler } from './resources/sampler.js';

export async function buildApp(): Promise<FastifyInstance> {
  // Touch the DB once at startup so the schema is applied before any request.
  db();

  const app = Fastify({
    logger: {
      level: config.logLevel,
      transport:
        process.env.NODE_ENV === 'production'
          ? undefined
          : { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } },
    },
    bodyLimit: 5 * 1024 * 1024,
  });

  await app.register(cors, {
    origin: config.corsOrigin === '*' ? true : config.corsOrigin.split(',').map((s) => s.trim()),
    credentials: true,
  });
  await app.register(cookie);
  await app.register(rateLimit, { global: false, max: 300, timeWindow: '1 minute' });
  await app.register(multipart, { limits: { fileSize: 2 * 1024 * 1024 * 1024 } }); // 2 GB zip cap
  await app.register(websocket);

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof AppError) {
      return reply.code(err.statusCode).send({ error: err.message });
    }
    if (err instanceof ZodError) {
      return reply.code(400).send({ error: 'validation failed', details: err.issues });
    }
    const sc = (err as { statusCode?: number }).statusCode;
    if (typeof sc === 'number' && sc < 500) {
      return reply.code(sc).send({ error: (err as Error).message });
    }
    req.log.error({ err }, 'unhandled error');
    return reply.code(500).send({ error: 'internal server error' });
  });

  // Health check (unauthenticated)
  app.get('/api/health', async () => ({ ok: true, ts: new Date().toISOString() }));

  await registerAuth(app);
  await registerProjects(app);
  await registerSessions(app);
  await registerRunner(app);
  await registerConfig(app);
  await registerQuota(app);
  await registerUsage(app);
  await registerMcp(app);
  await registerResources(app);

  runner.init(app.log);
  void startSampler(app.log);

  return app;
}
