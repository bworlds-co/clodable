import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { supabaseRef } from "./config.js";
import { CloclodError, messageOf } from "./errors.js";
import { type Flow, log, step } from "./events.js";
import { exec, hasCommand } from "./exec.js";
import { localFunctions, uploadFunction } from "./move/functions.js";
import { SupabaseApi } from "./move/supabase-api.js";
import type { Workspace } from "./workspace.js";

/** The app's backend functions (Supabase edge functions) go live at Publish, never earlier. */

export interface FunctionsOutcome {
  deployed: string[];
  /** Changed edge functions that still need deploying (no Supabase CLI login on this computer). */
  pending: string[];
  failed: string[];
}

/** Names of edge functions touched by a commit. A change to `_shared` touches every function. */
export async function changedFunctions(ws: Workspace, sha: string): Promise<string[]> {
  const files = await ws.git.diffNames(`${sha}^..${sha}`);
  const names = new Set<string>();
  let shared = false;
  for (const file of files) {
    const match = file.match(/^supabase\/functions\/([^/]+)\//);
    if (!match) continue;
    if (match[1] === "_shared") shared = true;
    else names.add(match[1]!);
  }
  if (shared) {
    const dir = join(ws.root, "supabase", "functions");
    if (existsSync(dir)) {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        if (entry.isDirectory() && !entry.name.startsWith("_")) names.add(entry.name);
      }
    }
  }
  return [...names].sort();
}

export async function* deployChangedFunctions(ws: Workspace, sha: string): Flow<FunctionsOutcome> {
  const outcome: FunctionsOutcome = { deployed: [], pending: [], failed: [] };
  // On Lovable Cloud, Lovable owns the backend: nothing here can deploy to it.
  if (ws.config.backend === "lovable-cloud") return outcome;
  // The merge was made on GitHub: this computer needs it to see what it changed.
  await ws.git.fetch(ws.remote, ws.liveBranch).catch(() => {});
  const names = await changedFunctions(ws, sha);
  if (names.length === 0) return outcome;
  const ref = supabaseRef(ws.config, ws.project);
  yield step(
    "functions",
    "running",
    `Updating ${names.length} backend function${names.length > 1 ? "s" : ""}`,
  );
  const api = ref ? await SupabaseApi.onThisComputer() : undefined;
  if (ref && api) yield* deployThroughApi(api, ref, ws.root, names, outcome);
  else if (ref && (await hasCommand("supabase", ws.root))) {
    yield* deployThroughCli(ref, ws.root, names, outcome);
  } else {
    outcome.pending = names;
    yield step("functions", "warning", "Backend functions need one more step", names.join(", "));
    return outcome;
  }
  const state = outcome.failed.length > 0 || outcome.pending.length > 0 ? "warning" : "done";
  yield step(
    "functions",
    state,
    state === "done" ? "Backend functions updated" : "Some backend functions need attention",
    [...outcome.pending, ...outcome.failed].join(", ") || undefined,
  );
  return outcome;
}

/**
 * With the Supabase account connected on this computer (a move off Lovable connects it), through
 * Supabase's API: no other tool or sign-in needed. A token that can't deploy leaves it waiting.
 */
async function* deployThroughApi(
  api: SupabaseApi,
  ref: string,
  root: string,
  names: string[],
  outcome: FunctionsOutcome,
): Flow<void> {
  const local = new Map((await localFunctions(root)).map((fn) => [fn.name, fn]));
  for (const name of names) {
    const fn = local.get(name);
    if (!fn) continue;
    try {
      await uploadFunction(api, ref, root, fn);
      outcome.deployed.push(name);
    } catch (error) {
      if (error instanceof CloclodError && error.code === "supabase-auth") {
        outcome.pending.push(name);
      } else {
        outcome.failed.push(name);
        yield log("warn", `Function ${name}: ${messageOf(error)}`);
      }
    }
  }
}

/** With the Supabase CLI and its own sign-in. Not signed in leaves it waiting. */
async function* deployThroughCli(
  ref: string,
  root: string,
  names: string[],
  outcome: FunctionsOutcome,
): Flow<void> {
  for (const name of names) {
    const result = await exec("supabase", ["functions", "deploy", name, "--project-ref", ref], {
      cwd: root,
      timeout: 5 * 60_000,
    });
    if (result.exitCode === 0) outcome.deployed.push(name);
    else if (/login|access token|unauthorized/i.test(result.stderr)) outcome.pending.push(name);
    else {
      outcome.failed.push(name);
      yield log("warn", `Function ${name}: ${result.stderr.trim().split("\n").pop() ?? "failed"}`);
    }
  }
}
