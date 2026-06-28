import { createWriteStream, type WriteStream } from 'node:fs';
import type { FastifyBaseLogger } from 'fastify';
import { config } from '../config.js';
import { conflict, notFound } from '../lib/errors.js';
import { effective } from '../lib/settings.js';
import { newId, nowIso } from '../lib/util.js';
import { auditDir, projectDir, runEventLogPath } from '../lib/paths.js';
import { spawnClaude, eventSessionId, type ClaudeHandle } from '../lib/claude.js';
import { getProjectById } from '../projects/repo.js';
import { getSessionById, updateSession } from '../sessions/repo.js';
import { ensureWorkspace, parseConfig } from '../sessions/service.js';
import { composePrompt } from './prompt.js';
import { hub } from './hub.js';
import {
  countRunningForSession,
  countRunningGlobal,
  getRunById,
  insertRun,
  maxQueuePos,
  minQueuedPos,
  nextQueuedForSession,
  reconcileOrphans,
  sessionsWithQueued,
  updateRun,
  type RunRow,
} from './repo.js';

interface ActiveRun {
  runId: string;
  sessionId: string;
  handle: ClaudeHandle;
  log: WriteStream;
  canceled: boolean;
  capturedSid: boolean;
}

export interface EnqueueInput {
  phase?: string | null;
  mode?: string | null;
  customPrompt?: string | null;
  findingId?: string | null;
}

class RunnerManager {
  private active = new Map<string, ActiveRun>();
  private log: FastifyBaseLogger | Console = console;

  init(logger: FastifyBaseLogger): void {
    this.log = logger;
    const n = reconcileOrphans();
    if (n > 0) logger.warn({ orphans: n }, 'marked orphaned runs as error on boot');
    this.schedule();
  }

  /** Enqueue a run for a session. `jump` inserts it ahead of other queued runs (steer). */
  enqueue(sessionId: string, input: EnqueueInput, opts: { jump?: boolean } = {}): RunRow {
    const session = getSessionById(sessionId);
    if (!session) throw notFound('session not found');
    const project = getProjectById(session.project_id);
    if (!project) throw notFound('project not found');

    const findingId = input.findingId ?? session.fork_finding_id ?? null;
    const { prompt, phase, mode } = composePrompt({
      phase: input.phase,
      mode: input.mode,
      customPrompt: input.customPrompt,
      findingId,
    });

    const id = newId();
    const queuePos = opts.jump
      ? (minQueuedPos(sessionId) ?? maxQueuePos(sessionId) + 1) - 1
      : maxQueuePos(sessionId) + 1;

    const run = insertRun({
      id,
      sessionId,
      phase,
      mode,
      customPrompt: input.customPrompt ?? null,
      composedPrompt: prompt,
      eventLogPath: runEventLogPath(project.name, session.session_name, id),
      queuePos,
    });
    hub.broadcast(sessionId, { kind: 'run', runId: run.id, status: 'queued', phase, mode });
    this.schedule();
    return run;
  }

  /** Start queued runs where possible (per-session serial, global concurrency cap). */
  private schedule(): void {
    const cap = Number(effective('max_concurrent_runs', String(config.maxConcurrentRuns))) || config.maxConcurrentRuns;
    if (countRunningGlobal() >= cap) return;
    for (const sessionId of sessionsWithQueued()) {
      if (countRunningGlobal() >= cap) break;
      if (countRunningForSession(sessionId) > 0) continue;
      const next = nextQueuedForSession(sessionId);
      if (next) this.startRun(next).catch((err) => this.log.error({ err, runId: next.id }, 'startRun failed'));
    }
  }

  private async startRun(run: RunRow): Promise<void> {
    const session = getSessionById(run.session_id);
    if (!session) return;
    const project = getProjectById(session.project_id);
    if (!project) return;

    ensureWorkspace(project.name, session.session_name);
    const cfg = parseConfig(session.config_json);

    // Decide session continuity.
    let sessionIdFlag: string | undefined;
    let resume: string | undefined;
    let fork = false;
    if (session.claude_session_id) {
      resume = session.claude_session_id; // continue an existing claude session
    } else if (session.is_fork && session.parent_session_id) {
      const parent = getSessionById(session.parent_session_id);
      if (!parent?.claude_session_id) {
        updateRun(run.id, { status: 'error', is_error: 1, ended_at: nowIso() });
        hub.broadcast(run.session_id, { kind: 'run', runId: run.id, status: 'error', error: 'parent has no claude session' });
        return;
      }
      resume = parent.claude_session_id;
      fork = true; // mint a new child session id from the parent's history
    } else {
      sessionIdFlag = newId(); // root session's first run: we choose the id
      updateSession(session.id, { claude_session_id: sessionIdFlag });
    }

    const log = createWriteStream(run.event_log_path!, { flags: 'a' });
    const knownSid = resume ?? sessionIdFlag ?? null; // fork mints its own; captured from stream
    updateRun(run.id, { status: 'running', started_at: nowIso(), claude_session_id: knownSid });
    updateSession(session.id, { status: 'running' });
    hub.broadcast(run.session_id, { kind: 'run', runId: run.id, status: 'running', phase: run.phase, mode: run.mode });
    hub.broadcast(run.session_id, { kind: 'session', status: 'running' });

    const handle = spawnClaude(
      {
        prompt: run.composed_prompt ?? '',
        cwd: projectDir(project.name),
        env: {
          VIBEHACK_APP: '1',
          VIBEHACK_AUDIT_DIR: auditDir(project.name, session.session_name),
          VIBEHACK_PROJECT: project.name,
        },
        sessionId: sessionIdFlag,
        resume,
        fork,
        permissionMode: cfg.permissionMode,
        model: cfg.model,
        includePartial: true,
      },
      {
        onEvent: (e) => {
          log.write(e.raw + '\n');
          hub.broadcast(run.session_id, { kind: 'event', runId: run.id, event: e.obj });
          this.handleEvent(run, e.obj);
        },
        onStderr: (text) => {
          const obj = { type: '_stderr', text };
          log.write(JSON.stringify(obj) + '\n');
          hub.broadcast(run.session_id, { kind: 'event', runId: run.id, event: obj });
        },
        onError: (err) => {
          const obj = { type: '_error', text: err.message };
          log.write(JSON.stringify(obj) + '\n');
          hub.broadcast(run.session_id, { kind: 'event', runId: run.id, event: obj });
        },
        onClose: (code) => this.finalize(run.id, code),
      },
    );

    if (handle.child.pid) updateRun(run.id, { pid: handle.child.pid });
    this.active.set(run.id, {
      runId: run.id,
      sessionId: run.session_id,
      handle,
      log,
      canceled: false,
      capturedSid: Boolean(session.claude_session_id || sessionIdFlag),
    });
  }

  private handleEvent(run: RunRow, obj: Record<string, unknown>): void {
    const ctx = this.active.get(run.id);
    // Capture the claude session id (esp. for forks where claude mints it).
    if (ctx && !ctx.capturedSid) {
      const sid = eventSessionId(obj);
      if (sid) {
        ctx.capturedSid = true;
        updateSession(run.session_id, { claude_session_id: sid });
        updateRun(run.id, { claude_session_id: sid });
        hub.broadcast(run.session_id, { kind: 'session', claude_session_id: sid });
      }
    }
    if (obj['type'] === 'result') {
      const cost = typeof obj['total_cost_usd'] === 'number' ? (obj['total_cost_usd'] as number) : null;
      const usage = obj['usage'] ?? obj['modelUsage'] ?? null;
      const isErr = obj['is_error'] === true ? 1 : 0;
      updateRun(run.id, {
        total_cost_usd: cost,
        usage_json: usage ? JSON.stringify(usage) : null,
        is_error: isErr,
      });
    }
  }

  private finalize(runId: string, code: number | null): void {
    const ctx = this.active.get(runId);
    const run = getRunById(runId);
    if (run) {
      let status: RunRow['status'];
      if (ctx?.canceled) status = 'canceled';
      else if (code === 0 && run.is_error !== 1) status = 'done';
      else status = 'error';
      updateRun(runId, {
        status,
        exit_code: code,
        ended_at: nowIso(),
        is_error: status === 'error' ? 1 : run.is_error ?? 0,
      });
      hub.broadcast(run.session_id, { kind: 'run', runId, status, exit_code: code });
      // Session goes idle unless it still has queued work that schedule() will pick up.
      updateSession(run.session_id, { status: 'idle' });
      hub.broadcast(run.session_id, { kind: 'session', status: 'idle' });
    }
    if (ctx) {
      ctx.log.end();
      this.active.delete(runId);
    }
    this.schedule();
  }

  /** Cancel a queued or running run. */
  cancel(runId: string): void {
    const run = getRunById(runId);
    if (!run) throw notFound('run not found');
    const ctx = this.active.get(runId);
    if (ctx) {
      ctx.canceled = true;
      ctx.handle.kill('SIGINT');
      setTimeout(() => {
        if (this.active.has(runId)) ctx.handle.kill('SIGKILL');
      }, 5000).unref?.();
      return;
    }
    if (run.status === 'queued') {
      updateRun(runId, { status: 'canceled', ended_at: nowIso() });
      hub.broadcast(run.session_id, { kind: 'run', runId, status: 'canceled' });
      return;
    }
    throw conflict(`run is ${run.status}; nothing to cancel`);
  }

  /** Stop a session: cancel its active run and drop all queued runs. */
  stopSession(sessionId: string): void {
    const session = getSessionById(sessionId);
    if (!session) throw notFound('session not found');
    for (const ctx of this.active.values()) {
      if (ctx.sessionId === sessionId) {
        ctx.canceled = true;
        ctx.handle.kill('SIGINT');
      }
    }
    // Drop queued runs for this session.
    let q = nextQueuedForSession(sessionId);
    while (q) {
      updateRun(q.id, { status: 'canceled', ended_at: nowIso() });
      hub.broadcast(sessionId, { kind: 'run', runId: q.id, status: 'canceled' });
      q = nextQueuedForSession(sessionId);
    }
    updateSession(sessionId, { status: 'idle' });
  }

  /** Inject a steer message: priority-enqueue a custom-prompt run ahead of the queue. */
  steer(sessionId: string, text: string): RunRow {
    return this.enqueue(sessionId, { customPrompt: text }, { jump: true });
  }

  isActive(runId: string): boolean {
    return this.active.has(runId);
  }

  shutdown(): void {
    for (const ctx of this.active.values()) ctx.handle.kill('SIGTERM');
  }
}

export const runner = new RunnerManager();
