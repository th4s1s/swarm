import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { config } from '../config.js';
import { effective, getSetting, setSetting } from '../lib/settings.js';

/**
 * Editable settings: key -> env-derived default. admin_pass is write-only (never
 * returned). Paths are exposed read-only for reference.
 */
const EDITABLE: Record<string, string> = {
  admin_user: config.adminUser,
  default_mode: config.defaultMode,
  default_permission_mode: config.defaultPermissionMode,
  default_model: config.defaultModel,
  max_concurrent_runs: String(config.maxConcurrentRuns),
  cors_origin: config.corsOrigin,
  resource_sample_ms: String(config.resourceSampleMs),
};

const patchSchema = z
  .object({
    admin_user: z.string().min(1).max(100).optional(),
    admin_pass: z.string().min(1).max(200).optional(),
    default_mode: z.enum(['full', 'source']).optional(),
    default_permission_mode: z
      .enum(['bypassPermissions', 'acceptEdits', 'plan', 'default', 'dontAsk'])
      .optional(),
    default_model: z.string().max(80).optional(),
    max_concurrent_runs: z.coerce.number().int().min(1).max(16).optional(),
    cors_origin: z.string().max(500).optional(),
    resource_sample_ms: z.coerce.number().int().min(1000).max(120000).optional(),
  })
  .strict();

export async function registerConfig(app: FastifyInstance): Promise<void> {
  await app.register(async (r) => {
    r.addHook('preHandler', app.authGuard);

    r.get('/api/config', async () => {
      const settings: Record<string, string> = {};
      for (const [k, def] of Object.entries(EDITABLE)) settings[k] = effective(k, def);
      return {
        settings,
        admin_pass_set: getSetting('admin_pass') !== null, // never echo the value
        paths: {
          projects_dir: config.projectsDir,
          audits_dir: config.auditsDir,
          skill_dir: config.skillDir,
          app_db: config.appDbPath,
        },
        claude_bin: config.claudeBin,
      };
    });

    r.patch('/api/config', async (req) => {
      const body = patchSchema.parse(req.body);
      for (const [k, v] of Object.entries(body)) {
        if (v !== undefined) setSetting(k, String(v));
      }
      const settings: Record<string, string> = {};
      for (const [k, def] of Object.entries(EDITABLE)) settings[k] = effective(k, def);
      return { ok: true, settings };
    });
  });
}
