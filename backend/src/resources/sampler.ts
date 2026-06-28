import type { FastifyBaseLogger } from 'fastify';
import { db } from '../db/index.js';
import { config } from '../config.js';
import { effective } from '../lib/settings.js';
import { nowIso } from '../lib/util.js';
import { dockerAvailable, systemSample } from '../lib/docker.js';

let timer: NodeJS.Timeout | null = null;

async function tick(logger: FastifyBaseLogger): Promise<void> {
  try {
    const s = await systemSample();
    db()
      .prepare(
        `INSERT INTO resource_samples (ts, scope, cpu, mem, net_in, net_out, disk_read, disk_write)
         VALUES (?, 'system', ?, ?, ?, ?, ?, ?)`,
      )
      .run(nowIso(), s.cpu, s.mem, s.netIn, s.netOut, s.diskRead, s.diskWrite);
    // Keep ~24h of samples.
    const cutoff = new Date(Date.now() - 24 * 3600_000).toISOString();
    db().prepare('DELETE FROM resource_samples WHERE ts < ?').run(cutoff);
  } catch (err) {
    logger.debug({ err }, 'resource sample failed');
  }
}

export async function startSampler(logger: FastifyBaseLogger): Promise<void> {
  if (timer) return;
  if (!(await dockerAvailable())) {
    logger.warn('docker not available; resource sampler disabled');
    return;
  }
  const ms = Number(effective('resource_sample_ms', String(config.resourceSampleMs))) || config.resourceSampleMs;
  timer = setInterval(() => void tick(logger), ms);
  timer.unref?.();
  void tick(logger);
}

export function stopSampler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
