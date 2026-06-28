import type { FastifyInstance } from 'fastify';
import { getQuota } from '../lib/anthropicUsage.js';

export async function registerQuota(app: FastifyInstance): Promise<void> {
  await app.register(async (r) => {
    r.addHook('preHandler', app.authGuard);
    // Cache briefly to avoid hammering the rate-limited usage endpoint.
    let cache: { at: number; data: unknown } | null = null;
    r.get('/api/quota', async () => {
      if (cache && Date.now() - cache.at < 30_000) return cache.data;
      const data = await getQuota();
      cache = { at: Date.now(), data };
      return data;
    });
  });
}
