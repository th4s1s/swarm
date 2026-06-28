import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../db/index.js';
import {
  dockerAvailable,
  listContainers,
  listImages,
  removeContainer,
  removeImage,
  restartContainer,
  startContainer,
  stopContainer,
} from '../lib/docker.js';

const bulkSchema = z.object({ ids: z.array(z.string().min(1).max(100)).min(1).max(200), force: z.boolean().optional() });

function matches(hay: string, needle?: string): boolean {
  return !needle || hay.toLowerCase().includes(needle.toLowerCase());
}

async function bulk<T>(ids: string[], fn: (id: string) => Promise<T>): Promise<{ id: string; ok: boolean; error?: string }[]> {
  return Promise.all(
    ids.map(async (id) => {
      try {
        await fn(id);
        return { id, ok: true };
      } catch (e) {
        return { id, ok: false, error: (e as Error).message };
      }
    }),
  );
}

export async function registerResources(app: FastifyInstance): Promise<void> {
  await app.register(async (r) => {
    r.addHook('preHandler', app.authGuard);

    r.get('/api/resources/status', async () => ({ dockerAvailable: await dockerAvailable() }));

    // --- Images ---
    r.get('/api/resources/images', async (req) => {
      const q = req.query as { search?: string; filter?: string };
      let images = await listImages();
      if (q.search) images = images.filter((i) => matches(`${i.repository}:${i.tag}`, q.search));
      if (q.filter === 'in-use') images = images.filter((i) => i.inUse);
      if (q.filter === 'unused') images = images.filter((i) => !i.inUse);
      return {
        images,
        totals: { count: images.length, totalSize: images.reduce((s, i) => s + i.size, 0) },
      };
    });

    r.delete('/api/resources/images/:id', async (req, reply) => {
      const force = (req.query as { force?: string }).force === 'true';
      await removeImage((req.params as { id: string }).id, force);
      return reply.code(204).send();
    });

    r.post('/api/resources/images/bulk-delete', async (req) => {
      const { ids, force } = bulkSchema.parse(req.body);
      return { results: await bulk(ids, (id) => removeImage(id, force ?? false)) };
    });

    // --- Containers ---
    r.get('/api/resources/containers', async (req) => {
      const q = req.query as { search?: string; status?: string };
      let containers = await listContainers();
      if (q.search) containers = containers.filter((c) => matches(c.name, q.search) || matches(c.image, q.search));
      if (q.status) containers = containers.filter((c) => c.state === q.status);
      const totals = {
        count: containers.length,
        totalCpu: containers.reduce((s, c) => s + (c.stats?.cpuPerc ?? 0), 0),
        totalMem: containers.reduce((s, c) => s + (c.stats?.memUsage ?? 0), 0),
      };
      return { containers, totals };
    });

    const action = (fn: (id: string) => Promise<unknown>) => async (req: { params: unknown }, reply: { send: (b: unknown) => unknown }) => {
      await fn((req.params as { id: string }).id);
      return reply.send({ ok: true });
    };
    r.post('/api/resources/containers/:id/start', action(startContainer));
    r.post('/api/resources/containers/:id/stop', action(stopContainer));
    r.post('/api/resources/containers/:id/restart', action(restartContainer));

    r.delete('/api/resources/containers/:id', async (req, reply) => {
      const force = (req.query as { force?: string }).force === 'true';
      await removeContainer((req.params as { id: string }).id, force);
      return reply.code(204).send();
    });

    r.post('/api/resources/containers/bulk-delete', async (req) => {
      const { ids, force } = bulkSchema.parse(req.body);
      return { results: await bulk(ids, (id) => removeContainer(id, force ?? false)) };
    });

    // --- IO time series (net + disk) for graphs ---
    r.get('/api/resources/io', async (req) => {
      const minutes = Math.min(1440, Math.max(1, Number((req.query as { minutes?: string }).minutes) || 60));
      const cutoff = new Date(Date.now() - minutes * 60_000).toISOString();
      const rows = db()
        .prepare(
          `SELECT ts, cpu, mem, net_in, net_out, disk_read, disk_write
           FROM resource_samples WHERE scope = 'system' AND ts >= ? ORDER BY ts`,
        )
        .all(cutoff);
      return { samples: rows };
    });
  });
}
