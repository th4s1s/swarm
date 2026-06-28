import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { badRequest } from '../lib/errors.js';
import * as svc from './service.js';

const gitCreateSchema = z.object({
  title: z.string().min(1).max(200),
  name: z.string().min(1).max(100),
  description: z.string().max(5000).optional(),
  url: z.string().min(1).max(2000),
  token: z.string().max(500).optional(),
});

const patchSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(5000).nullable().optional(),
  live_instance_note: z.string().max(2_000_000).optional(),
});

const checkoutSchema = z.object({ ref: z.string().min(1).max(300) });
const updateSchema = z.object({ ref: z.string().min(1).max(300).optional(), token: z.string().max(500).optional() });
const tokenSchema = z.object({ token: z.string().max(500).optional() }).optional();

interface MultipartProject {
  fields: Record<string, string>;
  file?: Buffer;
}

async function readMultipart(req: FastifyRequest): Promise<MultipartProject> {
  const out: MultipartProject = { fields: {} };
  for await (const part of req.parts()) {
    if (part.type === 'file') {
      out.file = await part.toBuffer();
    } else {
      out.fields[part.fieldname] = String(part.value);
    }
  }
  return out;
}

export async function registerProjects(app: FastifyInstance): Promise<void> {
  await app.register(async (r) => {
    r.addHook('preHandler', app.authGuard);

    // Create — git (JSON) or zip (multipart/form-data with a `file` part)
    r.post('/api/projects', async (req, reply) => {
      if (req.isMultipart()) {
        const { fields, file } = await readMultipart(req);
        if (!file || file.length === 0) throw badRequest('a zip file part is required');
        const title = fields.title ?? '';
        const name = fields.name ?? '';
        if (!title || !name) throw badRequest('title and name are required');
        const project = svc.createZipProject(
          { title, name, description: fields.description },
          file,
        );
        return reply.code(201).send(project);
      }
      const body = gitCreateSchema.parse(req.body);
      const project = await svc.createGitProject(body);
      return reply.code(201).send(project);
    });

    r.get('/api/projects', async () => svc.list());

    r.get('/api/projects/:id', async (req) => svc.getDetail((req.params as { id: string }).id));

    r.patch('/api/projects/:id', async (req) => {
      const fields = patchSchema.parse(req.body);
      return svc.updateMeta((req.params as { id: string }).id, fields);
    });

    r.delete('/api/projects/:id', async (req, reply) => {
      const purge = (req.query as { purgeAudits?: string }).purgeAudits === 'true';
      svc.remove((req.params as { id: string }).id, purge);
      return reply.code(204).send();
    });

    // Git operations
    r.get('/api/projects/:id/branches', async (req) =>
      svc.listBranches((req.params as { id: string }).id),
    );

    r.post('/api/projects/:id/checkout', async (req) => {
      const { ref } = checkoutSchema.parse(req.body);
      return svc.checkoutRef((req.params as { id: string }).id, ref);
    });

    r.post('/api/projects/:id/check-updates', async (req) => {
      const body = tokenSchema.parse(req.body) ?? {};
      return svc.checkUpdates((req.params as { id: string }).id, body.token);
    });

    r.post('/api/projects/:id/update', async (req) => {
      const body = updateSchema.parse(req.body ?? {});
      return svc.applyUpdate((req.params as { id: string }).id, body.ref, body.token);
    });

    // Zip re-upload
    r.post('/api/projects/:id/reupload', async (req) => {
      if (!req.isMultipart()) throw badRequest('expected multipart/form-data with a zip file');
      const { file } = await readMultipart(req);
      if (!file || file.length === 0) throw badRequest('a zip file part is required');
      return svc.reuploadZip((req.params as { id: string }).id, file);
    });
  });
}
