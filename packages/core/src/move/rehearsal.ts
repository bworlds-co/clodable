import { z } from "zod";
import { ClodableError } from "../errors.js";
import type { Workspace } from "../workspace.js";
import { loadMove, type MoveState, updateMove } from "./state.js";

const copySchema = z.object({ ref: z.string().min(1).max(100), dataAt: z.iso.datetime() }).strict();
const observationSchema = z
  .object({
    feature: z.string().trim().min(1).max(200),
    result: z.enum(["passed", "failed", "blocked"]),
    method: z.enum(["browser", "automated", "builder-report"]),
    observedAt: z.iso.datetime(),
    evidence: z.string().trim().min(1).max(600),
    limitation: z.string().trim().max(600).optional(),
  })
  .strict();
const recordSchema = z
  .object({
    copy: copySchema,
    observations: z.array(observationSchema).min(1).max(30),
  })
  .strict();

export type RehearsalObservation = z.infer<typeof observationSchema> & {
  copy: z.infer<typeof copySchema>;
  recordedAt: string;
};

/** A copy in progress, even one that later fails, invalidates earlier feature checks. */
function currentCopy(state: MoveState) {
  if (
    !state.home ||
    !state.data ||
    (state.copyStartedAt && Date.parse(state.copyStartedAt) > Date.parse(state.data.at))
  )
    return undefined;
  return { ref: state.home.ref, dataAt: state.data.at };
}

export function rehearsalSummary(state: MoveState) {
  const copy = currentCopy(state);
  return {
    copy,
    observations: (state.rehearsal ?? []).map((observation) => ({
      ...observation,
      scope:
        copy && observation.copy.ref === copy.ref && observation.copy.dataAt === copy.dataAt
          ? ("current-copy" as const)
          : ("earlier-copy" as const),
    })),
    limit:
      "These are dated observations, not a fresh check or proof every feature works. Missing evidence means unknown, not never tested. Earlier-copy observations need checking again after a new copy.",
  };
}

/** Local, safe evidence only; never opens an export, connects to a service or advances a step. */
export async function readRehearsal(ws: Pick<Workspace, "root">) {
  return rehearsalSummary(await loadMove(ws.root));
}

export async function recordRehearsal(ws: Pick<Workspace, "root">, json: string) {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    raw = null;
  }
  const parsed = recordSchema.safeParse(raw);
  if (!parsed.success)
    throw new ClodableError({
      code: "invalid-config",
      message: "The rehearsal notes don't have the expected shape.",
      hint: "Include the copy identity from move rehearsal and dated feature observations, with their result, method and evidence. Never include keys or people's data.",
    });
  const input = parsed.data;
  const now = new Date().toISOString();
  const state = await updateMove(ws.root, (s) => {
    const copy = currentCopy(s);
    if (!copy || copy.ref !== input.copy.ref || copy.dataAt !== input.copy.dataAt) {
      throw new ClodableError({
        code: "move-not-ready",
        message: "These notes don't match the current copy.",
        hint: "Read the current rehearsal record and check which copy was actually tested. Don't relabel old checks as new ones.",
      });
    }
    if (
      input.observations.some(
        (o) =>
          Date.parse(o.observedAt) < Date.parse(copy.dataAt) ||
          Date.parse(o.observedAt) > Date.now() + 60_000,
      )
    ) {
      throw new ClodableError({
        code: "invalid-config",
        message: "A check's date is outside this copy's lifetime.",
        hint: "Use the date the check actually happened, after this copy was made.",
      });
    }
    const entries = [...(s.rehearsal ?? [])];
    for (const observation of input.observations) {
      const same = entries.findIndex(
        (o) =>
          o.copy.ref === copy.ref &&
          o.copy.dataAt === copy.dataAt &&
          o.feature === observation.feature &&
          o.method === observation.method &&
          o.observedAt === observation.observedAt,
      );
      const entry = { ...observation, copy, recordedAt: now };
      if (same < 0) entries.push(entry);
      else entries[same] = entry;
    }
    s.rehearsal = entries.slice(-100);
  });
  return rehearsalSummary(state);
}
