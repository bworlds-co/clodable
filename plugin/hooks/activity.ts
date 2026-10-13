// How the bar's activity changes: saving, publishing, undoing, and what stopped them. Pure
// functions for `update($, activity, …)`: no `$`.
import type { ClodableActivity, ClodableError } from "../types/index.d.ts";

/** A save starts, unless a publish or an undo is running: it saves on its own. */
export const savingNow = (a: ClodableActivity): ClodableActivity =>
  a.kind === "idle" || a.kind === "published" || a.kind === "undone" || a.kind === "failed"
    ? { kind: "saving", steps: [] }
    : a;

/** A publish or an undo stopped: why, with the steps it got through. */
export const stoppedBy =
  (error: ClodableError | undefined) =>
  (a: ClodableActivity): ClodableActivity => ({
    kind: "failed",
    steps: a.steps,
    ...(error ? { error } : {}),
  });
