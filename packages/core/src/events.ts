/**
 * The event protocol between Clodable's engine and every front end (the CLI's pretty view, the
 * Claude mod, a future web shell). With `--json`, the CLI prints one event per line (NDJSON),
 * and the last line is always a `result`.
 */
import type { ErrorInfo } from "./errors.js";

export type StepId =
  | "save"
  | "sync"
  | "checks"
  | "check:build"
  | "check:packages"
  | "check:secrets"
  | "push"
  | "pull-request"
  | "ci"
  | "merge"
  | "deploy"
  | "functions"
  | "fresh-draft"
  | "revert"
  // An app that isn't online, or has no backend, gets one
  | "site"
  | "backend"
  // Setting Clodable up in an app
  | "setup:tools"
  | "setup:app"
  | "setup:files"
  | "setup:packages"
  | "setup:save"
  // Moving off Lovable
  | "move:connect"
  | "move:create"
  | "move:export"
  | "move:data"
  | "move:fixes"
  | "move:files"
  | "move:functions"
  | "move:checks"
  | "move:site"
  | "move:emails"
  | "move:golive";

export type StepState = "pending" | "running" | "done" | "skipped" | "warning" | "failed";

export interface StepEvent {
  type: "step";
  id: StepId;
  state: StepState;
  /** Plain-language title, already worded for this state ("Checking it builds" / "It builds"). */
  title: string;
  /** One extra line for the curious, e.g. "2 of 3 checks finished". */
  detail?: string;
}

export interface LogEvent {
  type: "log";
  level: "info" | "warn" | "error";
  message: string;
}

export interface ResultEvent<T = unknown> {
  type: "result";
  ok: boolean;
  data?: T;
  error?: ErrorInfo;
}

export type ClodableEvent = StepEvent | LogEvent | ResultEvent;

/** A long-running operation: yields progress, returns its data or throws a ClodableError. */
export type Flow<T> = AsyncGenerator<StepEvent | LogEvent, T, void>;

export const step = (id: StepId, state: StepState, title: string, detail?: string): StepEvent => ({
  type: "step",
  id,
  state,
  title,
  ...(detail ? { detail } : {}),
});

export const log = (level: LogEvent["level"], message: string): LogEvent => ({
  type: "log",
  level,
  message,
});

/** Drive a flow to completion, forwarding every event to `onEvent`. */
export async function runFlow<T>(
  flow: Flow<T>,
  onEvent: (event: StepEvent | LogEvent) => void = () => {},
): Promise<T> {
  while (true) {
    const next = await flow.next();
    if (next.done) return next.value;
    onEvent(next.value);
  }
}
