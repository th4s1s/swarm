import type { FastifyInstance } from 'fastify';
import { getUsageAggregate } from '../lib/transcripts.js';
import { getProjectByName } from '../projects/repo.js';
import { db } from '../db/index.js';

export async function registerUsage(app: FastifyInstance): Promise<void> {
  await app.register(async (r) => {
    r.addHook('preHandler', app.authGuard);

    r.get('/api/usage/summary', async () => {
      const a = getUsageAggregate();
      return { total: a.total, generatedAt: a.generatedAt, pricingNote: a.pricingNote };
    });

    r.get('/api/usage/by-model', async () => {
      const a = getUsageAggregate();
      return Object.entries(a.byModel)
        .map(([model, agg]) => ({ model, ...agg }))
        .sort((x, y) => y.total - x.total);
    });

    r.get('/api/usage/timeseries', async (req) => {
      const days = Math.min(365, Math.max(1, Number((req.query as { days?: string }).days) || 30));
      const a = getUsageAggregate();
      const cutoff = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
      return Object.entries(a.byDay)
        .filter(([day]) => day >= cutoff)
        .map(([day, agg]) => ({ day, ...agg }))
        .sort((x, y) => x.day.localeCompare(y.day));
    });

    // Per-project table; ?project=<name> drills into that project's audit sessions.
    r.get('/api/usage/by-project', async (req) => {
      const a = getUsageAggregate();
      const project = (req.query as { project?: string }).project;
      if (project) {
        const sessions = a.byProjectSession[project] ?? {};
        const rows = Object.entries(sessions).map(([claudeSid, agg]) => {
          const s = db()
            .prepare('SELECT id, title, session_name, is_fork FROM audit_sessions WHERE claude_session_id = ?')
            .get(claudeSid) as
            | { id: string; title: string; session_name: string; is_fork: number }
            | undefined;
          return {
            claude_session_id: claudeSid,
            app_session_id: s?.id ?? null,
            title: s?.title ?? null,
            session_name: s?.session_name ?? null,
            is_fork: s ? Boolean(s.is_fork) : null,
            ...agg,
          };
        });
        return { project, sessions: rows.sort((x, y) => y.total - x.total) };
      }
      return Object.entries(a.byProject)
        .map(([name, agg]) => ({ project: name, known: Boolean(getProjectByName(name)), ...agg }))
        .sort((x, y) => y.total - x.total);
    });
  });
}
