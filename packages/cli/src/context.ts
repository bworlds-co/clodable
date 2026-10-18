import { resolve } from "node:path";
import { isCancel, password } from "@clack/prompts";
import {
  CloclodError,
  type ErrorInfo,
  FakeGitHub,
  type Flow,
  type GitHubAdapter,
  runFlow,
  toErrorInfo,
  Workspace,
} from "@clodable/core";
import { createOutput, type Output } from "./ui.js";

export interface GlobalOptions {
  json?: boolean;
  cwd?: string;
}

export interface Context {
  cwd: string;
  out: Output;
  github: GitHubAdapter | undefined;
  workspace(options?: { requireSetup?: boolean }): Promise<Workspace>;
}

export function createContext(options: GlobalOptions): Context {
  const cwd = resolve(options.cwd ?? process.cwd());
  // Demo and test mode: a fake GitHub over a local bare repository.
  const fake = process.env.CLODABLE_FAKE_GITHUB;
  const github = fake ? FakeGitHub.persistent(resolve(fake)) : undefined;
  return {
    cwd,
    out: createOutput({ json: Boolean(options.json) }),
    github,
    workspace: (options = {}) => Workspace.open({ cwd, ...options, ...(github ? { github } : {}) }),
  };
}

/**
 * Run a command body with consistent output and exit codes:
 * 0 means done, 1 means a known problem the builder can act on, 2 means something unexpected.
 */
export async function run<T>(
  ctx: Context,
  body: () => Promise<T>,
  render?: (data: T) => void,
): Promise<void> {
  try {
    const data = await body();
    ctx.out.close();
    if (ctx.out.json) ctx.out.result(true, data);
    else render?.(data);
  } catch (error) {
    const info: ErrorInfo = toErrorInfo(error);
    ctx.out.result(false, undefined, info);
    process.exitCode = error instanceof CloclodError && info.code !== "unknown" ? 1 : 2;
  }
}

/** Drive a flow, streaming its steps to the output. */
export function drive<T>(ctx: Context, flow: Flow<T>): Promise<T> {
  return runFlow(flow, (event) => ctx.out.event(event));
}

/** Everything piped in, as it came; undefined in a terminal. */
export async function readStdin(): Promise<string | undefined> {
  if (process.stdin.isTTY) return undefined;
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

/**
 * A value that must never be a command-line argument (a key, a token, a setting): piped in, or
 * typed in a hidden prompt in a terminal. Spaces around it go, unless `exact`: a setting's value
 * is the builder's to the letter (core drops only the newline a pipe adds).
 */
export async function secretInput(
  ctx: Context,
  message: string,
  options: { exact?: boolean } = {},
): Promise<string> {
  const tidy = (value: string) => (options.exact ? value : value.trim());
  const piped = await readStdin();
  if (piped?.trim()) return tidy(piped);
  if (piped === undefined && !ctx.out.json) {
    const typed = await password({ message });
    if (!isCancel(typed) && typed.trim()) return tidy(typed);
  }
  throw new CloclodError({
    code: "invalid-config",
    message: "Nothing was given.",
    hint: "Pipe the value in (never as an argument), or run this in a terminal to type it.",
  });
}
