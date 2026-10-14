// How the bar's activity changes: saving, publishing, undoing, and what stopped them. Pure
// functions for `update($, activity, …)`: no `$`.
import type { ClodableActivity, ClodableError } from "../types/index.d.ts";

/** A save starts, unless a publish or an undo is running: it saves on its own. */
export const savingNow = (a: ClodableActivity): ClodableActivity =>
  a.kind === "idle" || a.kind === "published" || a.kind === "undone" || a.kind === "failed"
    ? { kind: "saving", steps: [] }
    : a;

/** How long the bar and the panel say what a publish or an undo did, once it's done. */
export const DONE_SHOWN_MS = 2 * 60_000;

/** A publish or an undo that ended a moment ago: still worth saying. */
export const justDone = (
  a: ClodableActivity,
  now: number,
): a is ClodableActivity & { kind: "published" | "undone" } =>
  (a.kind === "published" || a.kind === "undone") && Boolean(a.at && now - a.at < DONE_SHOWN_MS);

/** What a publish or an undo did has been said: back to the usual bar, unless something started since. */
export const doneSaid =
  (at: number) =>
  (a: ClodableActivity): ClodableActivity =>
    (a.kind === "published" || a.kind === "undone") && a.at === at
      ? { kind: "idle", steps: [] }
      : a;

/** A publish or an undo stopped: why, with the steps it got through. */
export const stoppedBy =
  (error: ClodableError | undefined) =>
  (a: ClodableActivity): ClodableActivity => ({
    kind: "failed",
    steps: a.steps,
    ...(error ? { error } : {}),
  });
