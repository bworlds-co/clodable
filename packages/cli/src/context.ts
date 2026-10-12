import { resolve } from "node:path";
import {
  ClodableError,
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
    process.exitCode = error instanceof ClodableError && info.code !== "unknown" ? 1 : 2;
  }
}

/** Drive a flow, streaming its steps to the output. */
export function drive<T>(ctx: Context, flow: Flow<T>): Promise<T> {
  return runFlow(flow, (event) => ctx.out.event(event));
}
