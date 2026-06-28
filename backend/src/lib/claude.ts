import { spawn, type ChildProcess } from 'node:child_process';
import { config } from '../config.js';

export interface ClaudeSpawnOpts {
  prompt: string;
  cwd: string;
  env?: NodeJS.ProcessEnv;
  /** Set a specific session id (root session's first run). */
  sessionId?: string;
  /** Resume an existing claude session id. */
  resume?: string;
  /** With `resume`, branch into a brand-new session id sharing the parent's history. */
  fork?: boolean;
  permissionMode?: string;
  model?: string | null;
  /** Reasoning effort: low | medium | high | xhigh | max (omit for the model default). */
  effort?: string | null;
  includePartial?: boolean;
  /** Streaming-input mode (lets us write more user messages to stdin mid-run). */
  streamingInput?: boolean;
}

export const EFFORT_LEVELS = ['low', 'medium', 'high', 'xhigh', 'max'] as const;

/** A single parsed stream-json event plus the raw line it came from. */
export interface StreamEvent {
  /** The parsed JSON object (or a synthetic wrapper for non-JSON output). */
  obj: Record<string, unknown>;
  raw: string;
}

export interface ClaudeCallbacks {
  onEvent: (e: StreamEvent) => void;
  onStderr?: (text: string) => void;
  onClose: (code: number | null, signal: NodeJS.Signals | null) => void;
  onError?: (err: Error) => void;
}

export interface ClaudeHandle {
  child: ChildProcess;
  /** Send an additional user message (streamingInput mode only). */
  send: (text: string) => void;
  /** Close stdin so a streaming-input session can finish. */
  endInput: () => void;
  kill: (signal?: NodeJS.Signals) => void;
}

export function buildClaudeArgs(opts: ClaudeSpawnOpts): string[] {
  const args = ['--print', '--output-format', 'stream-json', '--verbose'];
  if (opts.includePartial) args.push('--include-partial-messages');
  if (opts.permissionMode) args.push('--permission-mode', opts.permissionMode);
  if (opts.model) args.push('--model', opts.model);
  if (opts.effort && (EFFORT_LEVELS as readonly string[]).includes(opts.effort)) {
    args.push('--effort', opts.effort);
  }
  if (opts.sessionId) args.push('--session-id', opts.sessionId);
  if (opts.resume) args.push('--resume', opts.resume);
  if (opts.fork) args.push('--fork-session');
  if (opts.streamingInput) {
    args.push('--input-format', 'stream-json');
  } else {
    args.push(opts.prompt); // positional prompt for one-shot mode
  }
  return args;
}

function userMessage(text: string): string {
  return JSON.stringify({ type: 'user', message: { role: 'user', content: [{ type: 'text', text }] } });
}

export function spawnClaude(opts: ClaudeSpawnOpts, cb: ClaudeCallbacks): ClaudeHandle {
  const args = buildClaudeArgs(opts);
  const child = spawn(config.claudeBin, args, {
    cwd: opts.cwd,
    env: { ...process.env, ...opts.env },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  // In streaming-input mode, send the initial prompt as the first user message.
  if (opts.streamingInput && child.stdin) {
    child.stdin.write(userMessage(opts.prompt) + '\n');
  }

  let buf = '';
  child.stdout?.setEncoding('utf8');
  child.stdout?.on('data', (chunk: string) => {
    buf += chunk;
    let nl: number;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      try {
        cb.onEvent({ obj: JSON.parse(line) as Record<string, unknown>, raw: line });
      } catch {
        cb.onEvent({ obj: { type: '_nonjson', text: line }, raw: line });
      }
    }
  });

  child.stderr?.setEncoding('utf8');
  child.stderr?.on('data', (chunk: string) => cb.onStderr?.(chunk));

  child.on('error', (err) => cb.onError?.(err));
  child.on('close', (code, signal) => {
    const tail = buf.trim();
    if (tail) {
      try {
        cb.onEvent({ obj: JSON.parse(tail) as Record<string, unknown>, raw: tail });
      } catch {
        cb.onEvent({ obj: { type: '_nonjson', text: tail }, raw: tail });
      }
    }
    cb.onClose(code, signal);
  });

  return {
    child,
    send: (text: string) => {
      if (opts.streamingInput && child.stdin && !child.stdin.destroyed) {
        child.stdin.write(userMessage(text) + '\n');
      }
    },
    endInput: () => {
      if (child.stdin && !child.stdin.destroyed) child.stdin.end();
    },
    kill: (signal: NodeJS.Signals = 'SIGTERM') => child.kill(signal),
  };
}

/** Pull a session id out of any event that carries one. */
export function eventSessionId(obj: Record<string, unknown>): string | undefined {
  const v = obj['session_id'];
  return typeof v === 'string' ? v : undefined;
}
