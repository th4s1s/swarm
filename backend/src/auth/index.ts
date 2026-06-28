import { timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fastifyJwt from '@fastify/jwt';
import { config } from '../config.js';
import { effective } from '../lib/settings.js';

const COOKIE_NAME = 'vh_session';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string };
    user: { sub: string };
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    authGuard: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  // Compare against an equal-length buffer to avoid leaking length via early return.
  if (ab.length !== bb.length) {
    timingSafeEqual(ab, ab);
    return false;
  }
  return timingSafeEqual(ab, bb);
}

function checkCredentials(username: string, password: string): boolean {
  const u = effective('admin_user', config.adminUser);
  const p = effective('admin_pass', config.adminPass);
  // Evaluate both comparisons (no short-circuit) so timing doesn't reveal which failed.
  const okUser = safeEqual(username, u);
  const okPass = safeEqual(password, p);
  return okUser && okPass;
}

export async function registerAuth(app: FastifyInstance): Promise<void> {
  await app.register(fastifyJwt, {
    secret: config.jwtSecret,
    cookie: { cookieName: COOKIE_NAME, signed: false },
    sign: { expiresIn: config.sessionTtl },
  });

  app.decorate('authGuard', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      await req.jwtVerify();
    } catch {
      await reply.code(401).send({ error: 'unauthorized' });
    }
  });

  app.post('/api/login', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    handler: async (req, reply) => {
      const body = (req.body ?? {}) as { username?: unknown; password?: unknown };
      const username = typeof body.username === 'string' ? body.username : '';
      const password = typeof body.password === 'string' ? body.password : '';
      if (!checkCredentials(username, password)) {
        return reply.code(401).send({ error: 'invalid credentials' });
      }
      const token = await reply.jwtSign({ sub: username });
      reply.setCookie(COOKIE_NAME, token, {
        httpOnly: true,
        sameSite: 'strict',
        secure: false, // set true behind HTTPS in production
        path: '/',
        maxAge: config.sessionTtl,
      });
      return reply.send({ ok: true, user: { username } });
    },
  });

  app.post('/api/logout', async (_req, reply) => {
    reply.clearCookie(COOKIE_NAME, { path: '/' });
    return reply.send({ ok: true });
  });

  app.get('/api/me', { preHandler: [app.authGuard] }, async (req) => {
    return { user: { username: req.user.sub } };
  });
}
