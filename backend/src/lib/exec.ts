import { execFile } from 'node:child_process';

export interface RunOpts {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  maxBuffer?: number;
  /** When set, written to the child's stdin and stdin is then closed. */
  input?: string;
}

export interface RunResult {
  stdout: string;
  stderr: string;
  code: number;
}

export class CommandError extends Error {
  constructor(
    message: string,
    readonly code: number,
    readonly stdout: string,
    readonly stderr: string,
  ) {
    super(message);
    this.name = 'CommandError';
  }
}

/**
 * Run a command with an explicit ARGUMENT ARRAY (never a shell string) so user
 * input can't be interpreted as shell. Rejects with CommandError on non-zero exit.
 */
export function run(cmd: string, args: string[], opts: RunOpts = {}): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      cmd,
      args,
      {
        cwd: opts.cwd,
        env: opts.env ?? process.env,
        timeout: opts.timeoutMs ?? 120_000,
        maxBuffer: opts.maxBuffer ?? 32 * 1024 * 1024,
        windowsHide: true,
      },
      (err, stdout, stderr) => {
        const so = stdout.toString();
        const se = stderr.toString();
        if (err) {
          const code = typeof (err as { code?: unknown }).code === 'number' ? (err as { code: number }).code : 1;
          reject(new CommandError(`${cmd} ${args.join(' ')} failed: ${err.message}`, code, so, se));
          return;
        }
        resolve({ stdout: so, stderr: se, code: 0 });
      },
    );
    if (opts.input !== undefined && child.stdin) {
      child.stdin.end(opts.input);
    }
  });
}
