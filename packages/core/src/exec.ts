import { x } from "tinyexec";

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface ExecOptions {
  cwd: string;
  env?: Record<string, string | undefined>;
  /** Milliseconds. Defaults to 2 minutes. */
  timeout?: number;
  /** Text piped to stdin. */
  input?: string;
}

/** Run a program (no shell) and capture its output. Never throws for a non-zero exit code. */
export async function exec(
  command: string,
  args: string[],
  options: ExecOptions,
): Promise<ExecResult> {
  const proc = x(command, args, {
    throwOnError: false,
    timeout: options.timeout ?? 120_000,
    nodeOptions: {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      stdio: [options.input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
    },
  });
  if (options.input !== undefined) {
    proc.process?.stdin?.end(options.input);
  }
  try {
    const result = await proc;
    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode ?? (proc.killed ? 124 : 1),
    };
  } catch (error) {
    return {
      stdout: "",
      stderr: error instanceof Error ? error.message : String(error),
      exitCode: 127,
    };
  }
}

/** Is a program available on PATH? */
export async function hasCommand(command: string, cwd = process.cwd()): Promise<boolean> {
  const probe =
    process.platform === "win32"
      ? await exec("where", [command], { cwd, timeout: 10_000 })
      : await exec("sh", ["-c", `command -v ${command}`], { cwd, timeout: 10_000 });
  return probe.exitCode === 0 && probe.stdout.trim().length > 0;
}
