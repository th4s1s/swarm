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
import { runBaselineScan } from './scan.js';
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
  /** Streaming-input lifecycle: messages sent to the process, and `result`s seen back. */
  sent: number;
  done: number;
  /** Timer that closes stdin once the agent is idle (all sent messages answered). */
  idleTimer: ReturnType<typeof setTimeout> | null;
  /** Background task ids the agent is still waiting on (build/subagent/workflow). While any
   * are outstanding the agent intends to resume, so we must NOT close stdin. */
  bgTasks: Set<string>;
}

/** After the agent answers everything it was sent, wait this long for a late steer before
 * closing stdin (which ends the run). Keeps a small window for live follow-ups. */
const IDLE_CLOSE_MS = 1200;

export interface EnqueueInput {
  phase?: string | null;
  mode?: string | null;
  customPrompt?: string | null;
  findingId?: string | null;
  compact?: boolean | null;
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

    // Live injection: if a run is already streaming for this session and this is a free-text
    // message (no phase/mode/compact), feed it into the running process instead of queuing a run.
    const customText = (input.customPrompt ?? '').trim();
    if (customText && !input.phase && !input.mode && !input.compact) {
      const ctx = this.activeForSession(sessionId);
      if (ctx) {
        this.inject(ctx, customText);
        return getRunById(ctx.runId)!;
      }
    }

    const findingId = input.findingId ?? session.fork_finding_id ?? null;
    const { prompt, phase, mode } = composePrompt({
      phase: input.phase,
      mode: input.mode,
      customPrompt: input.customPrompt,
      findingId,
      compact: input.compact,
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

    // Deterministic baseline scan (semgrep + gitleaks) once per session, before recon-bearing runs.
    // Best-effort: it never blocks the run on tool failure; hits land in vh_scanner_hits for recon.
    if (run.phase === 'recon' || run.mode === 'full' || run.mode === 'source') {
      const emitScan = (text: string): void => {
        const ev = { type: '_scan', text };
        log.write(JSON.stringify(ev) + '\n');
        hub.broadcast(run.session_id, { kind: 'event', runId: run.id, event: ev });
      };
      emitScan('Running baseline scanners (semgrep, gitleaks)…');
      try {
        const res = await runBaselineScan(project.name, session.session_name, (m) =>
          this.log.warn({ runId: run.id }, m),
        );
        emitScan(
          res
            ? `Baseline scan done: ${res.hits} lead(s) from ${res.tools.join(', ') || 'no tools'}`
            : 'Baseline scan: already done for this session',
        );
      } catch (err) {
        this.log.warn({ err, runId: run.id }, 'baseline scan failed (continuing)');
        emitScan('Baseline scan failed (continuing without leads)');
      }
    }

    // Extended thinking is controlled by MAX_THINKING_TOKENS: a positive budget
    // enables it, 0 disables it; omit entirely to use the model/effort default.
    const env: NodeJS.ProcessEnv = {
      VIBEHACK_APP: '1',
      VIBEHACK_AUDIT_DIR: auditDir(project.name, session.session_name),
      VIBEHACK_PROJECT: project.name,
      // Wait indefinitely for the orchestrator's background subagents/workflows instead of
      // killing them (and the run) after the default 600s ceiling.
      CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS: '0',
    };
    if (cfg.thinking === true) env.MAX_THINKING_TOKENS = String(cfg.thinkingTokens ?? 10_000);
    else if (cfg.thinking === false) env.MAX_THINKING_TOKENS = '0';

    const handle = spawnClaude(
      {
        prompt: run.composed_prompt ?? '',
        cwd: projectDir(project.name),
        env,
        // Stream the prompt on stdin and keep it open so steer / free-text can be injected
        // into the live run (instead of queuing a separate run).
        streamingInput: true,
        sessionId: sessionIdFlag,
        resume,
        fork,
        permissionMode: cfg.permissionMode,
        model: cfg.model,
        effort: cfg.effort,
        // workflows=true is "ultracode" (typically paired with effort=xhigh): nudge the
        // skill toward its gateless, Workflow-accelerated path.
        appendSystemPrompt:
          cfg.workflows === true
            ? 'Ultracode is on: prefer the Workflow tool and drive substantive work gateless, end-to-end, per the skill’s workflow-accelerated mode where applicable.'
            : null,
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
      sent: 1, // the initial prompt was sent on stdin
      done: 0,
      idleTimer: null,
      bgTasks: new Set(),
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
    // Background-task lifecycle: the agent can launch a bash build / subagent / workflow,
    // background it, and end its turn expecting to be re-notified on completion. Track those
    // so the idle-close below never ends a run that is legitimately parked on one.
    if (ctx && obj['type'] === 'system') {
      const sub = obj['subtype'];
      const taskId = typeof obj['task_id'] === 'string' ? (obj['task_id'] as string) : null;
      if (taskId && sub === 'task_started') {
        ctx.bgTasks.add(taskId);
        if (ctx.idleTimer) {
          clearTimeout(ctx.idleTimer);
          ctx.idleTimer = null;
        }
      } else if (taskId && sub === 'task_notification') {
        // Terminal notification: the agent has been told the task finished and will resume,
        // so stop tracking it. The ensuing turn's `result` re-arms the idle-close.
        ctx.bgTasks.delete(taskId);
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
      // The agent finished a turn. Once every message we sent has been answered, close stdin
      // (after a short grace) so the run ends; a steer before then keeps it open.
      if (ctx) {
        ctx.done += 1;
        this.maybeArmIdleClose(ctx);
      }
    }
  }

  /** Find the active (non-canceled) run for a session, if any. */
  private activeForSession(sessionId: string): ActiveRun | undefined {
    for (const ctx of this.active.values()) if (ctx.sessionId === sessionId && !ctx.canceled) return ctx;
    return undefined;
  }

  /** Feed a free-text message into the running process and surface it in the transcript. */
  private inject(ctx: ActiveRun, text: string): void {
    if (ctx.idleTimer) {
      clearTimeout(ctx.idleTimer);
      ctx.idleTimer = null;
    }
    ctx.sent += 1;
    ctx.handle.send(text);
    const ev = { type: 'user', message: { role: 'user', content: [{ type: 'text', text }] } };
    ctx.log.write(JSON.stringify(ev) + '\n');
    hub.broadcast(ctx.sessionId, { kind: 'event', runId: ctx.runId, event: ev });
  }

  /** Close stdin (ending the run) once all sent messages are answered, after a short grace.
   * Never closes while a background task is outstanding: the agent parked on it (a build,
   * subagent, or workflow) intends to resume once it completes. */
  private maybeArmIdleClose(ctx: ActiveRun): void {
    if (ctx.canceled || ctx.done < ctx.sent) return;
    if (ctx.bgTasks.size > 0) return;
    if (ctx.idleTimer) clearTimeout(ctx.idleTimer);
    ctx.idleTimer = setTimeout(() => ctx.handle.endInput(), IDLE_CLOSE_MS);
    ctx.idleTimer.unref?.();
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
      if (ctx.idleTimer) clearTimeout(ctx.idleTimer);
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

  /**
   * Steer: if a run is live, inject the text into it (handled inside enqueue); otherwise
   * priority-enqueue a custom-prompt run ahead of the queue.
   */
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
