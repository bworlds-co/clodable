import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { type ProjectConfig, saveConfig } from "../config.js";
import { ClodableError, messageOf } from "../errors.js";
import { type Flow, step } from "../events.js";
import { applyKit, planKit } from "../kit/index.js";
import { detectProject } from "../project.js";
import type { Workspace } from "../workspace.js";
import { textFiles } from "./assess.js";
import { backendEnv, backendOf } from "./backend.js";
import { type ExportSummary, JOBS_FILE } from "./export.js";
import { literal, type NewKeys, repoint, tableName } from "./fixes.js";
import { homeKeys, homeSql } from "./home.js";
import type { Sql } from "./postgres.js";
import { liveSignIn } from "./sign-in.js";
import { forgetMoveFiles, loadMove, type MoveState, moveDir, updateMove } from "./state.js";
import { SupabaseApi } from "./supabase-api.js";

/**
 * The switch: the live app moves from Lovable to the builder's own Supabase and Netlify site.
 *
 * 1. Pause: the builder pastes one line in Lovable; the live app keeps showing everything but
 *    takes no new writes, and its scheduled jobs stop. One more line undoes it.
 * 2. A fresh export, copied over the copy for good, with the app's grants as they were before the
 *    pause (the export carries the pause) and its scheduled jobs.
 * 3. Go live: sign-in for real people, the app's files and Clodable's settings point at the new
 *    backend and site; the builder's next Publish puts it live.
 * 4. In Lovable, only once everything works: remove Cloud, stop its GitHub sync.
 */

/** The writes Supabase's API roles have, per table, from the export taken before the pause. */
function writeGrants(grants: Record<string, Record<string, string[]>>) {
  const lines: Array<{ table: string; role: string; privileges: string[] }> = [];
  for (const [table, roles] of Object.entries(grants)) {
    for (const [role, privileges] of Object.entries(roles)) {
      if (role !== "anon" && role !== "authenticated") continue;
      const writes = privileges.filter((p) => ["INSERT", "UPDATE", "DELETE"].includes(p));
      if (writes.length > 0) lines.push({ table, role, privileges: writes });
    }
  }
  return lines;
}

/**
 * The pause's own guard on sign-ups, password and email changes (Auth writes them as itself, so a
 * revoke can't). Named `clodable_pause`: the export reader leaves it out, so it never reaches the
 * new backend.
 */
export const PAUSE_NAME = "clodable_pause";

/** What stops the live app's scheduled jobs in Lovable (the quick way: going live starts them here). */
export const STOP_LOVABLE_JOBS = "select cron.alter_job(jobid, active := false) from cron.job;";

const PAUSE_AUTH = `do $pause$ begin
  execute $f$create or replace function public.${PAUSE_NAME}() returns trigger language plpgsql as $b$ begin raise exception 'This app is moving to a new home: try again in a few minutes.'; end $b$$f$;
  execute 'drop trigger if exists ${PAUSE_NAME} on auth.users';
  execute 'create trigger ${PAUSE_NAME} before insert or update of encrypted_password, email on auth.users for each row execute function public.${PAUSE_NAME}()';
exception when others then raise notice 'Sign-ups stay open: %', sqlerrm;
end $pause$;`;

const RESUME_AUTH = `do $$ begin
  execute 'drop trigger if exists ${PAUSE_NAME} on auth.users';
  execute 'drop function if exists public.${PAUSE_NAME}()';
exception when others then raise notice '%', sqlerrm;
end $$;`;

/** Uploads: where Lovable lets the editor revoke them (Storage owns the table). */
const PAUSE_STORAGE = `do $$ begin
  revoke insert, update, delete on storage.objects from anon, authenticated;
exception when others then raise notice 'Uploads stay open: %', sqlerrm;
end $$;`;

const RESUME_STORAGE = `do $$ begin
  grant insert, update, delete on storage.objects to anon, authenticated;
exception when others then raise notice '%', sqlerrm;
end $$;`;

/**
 * What the builder pastes in Lovable to pause the live app, and to undo the pause: the app's own
 * writes (exact grants when the export recorded them, otherwise every table in public), new
 * sign-ups and password or email changes, uploads, and scheduled jobs. Reading and signing in
 * keep working.
 */
export function freezeSql(
  grants: Record<string, Record<string, string[]>> | undefined,
  hasJobs: boolean,
): { freeze: string; undo: string } {
  const exact = grants ? writeGrants(grants) : [];
  const pause =
    exact.length > 0
      ? exact.map(
          (g) =>
            `revoke ${g.privileges.join(", ").toLowerCase()} on ${tableName(g.table)} from ${g.role};`,
        )
      : ["revoke insert, update, delete on all tables in schema public from anon, authenticated;"];
  const resume =
    exact.length > 0
      ? exact.map(
          (g) =>
            `grant ${g.privileges.join(", ").toLowerCase()} on ${tableName(g.table)} to ${g.role};`,
        )
      : ["grant insert, update, delete on all tables in schema public to anon, authenticated;"];
  return {
    freeze: [
      "-- Clodable: pause changes on the live app while it moves. Reading and signing in keep working.",
      ...pause,
      ...(hasJobs ? ["select cron.alter_job(jobid, active := false) from cron.job;"] : []),
      PAUSE_AUTH,
      PAUSE_STORAGE,
    ].join("\n"),
    undo: [
      "-- Clodable: undo the pause (only if you're not switching after all).",
      ...resume,
      ...(hasJobs ? ["select cron.alter_job(jobid, active := true) from cron.job;"] : []),
      RESUME_AUTH,
      RESUME_STORAGE,
    ].join("\n"),
  };
}

const ZONES: Record<string, string> = {
  UTC: "+00:00",
  GMT: "+00:00",
  CET: "+01:00",
  CEST: "+02:00",
  BST: "+01:00",
  EST: "-05:00",
  EDT: "-04:00",
  CST: "-06:00",
  CDT: "-05:00",
  PST: "-08:00",
  PDT: "-07:00",
};

/** When Postgres made the export ("2026-10-10 17:13:16 CEST"), if its time zone is a known one. */
export function exportTime(madeAt: string | undefined): Date | undefined {
  const match = madeAt?.match(
    /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})\s*([A-Z]+|[+-]\d{2}(?::?\d{2})?)?$/,
  );
  if (!match) return undefined;
  const zone = match[3] ?? "UTC";
  const offset = /^[+-]/.test(zone)
    ? zone.length === 3
      ? `${zone}:00`
      : zone.replace(/^([+-]\d{2}):?(\d{2})$/, "$1:$2")
    : ZONES[zone];
  if (!offset) return undefined;
  const time = new Date(`${match[1]}T${match[2]}${offset}`);
  return Number.isNaN(time.getTime()) ? undefined : time;
}

/**
 * Whether an export was made after the pause. The pause took the app's writes away, so they're
 * gone from an export made after it; failing that, the export's own time says. `undefined`: no way
 * to tell.
 */
export function madeAfterPause(
  summary: ExportSummary,
  before: Record<string, Record<string, string[]>> | undefined,
  frozenAt: string,
): boolean | undefined {
  const paused = writeGrants(before ?? {});
  const now = summary.grants ?? {};
  if (paused.length > 0 && summary.grants) {
    return paused.every(
      (g) => !g.privileges.some((p) => (now[g.table]?.[g.role] ?? []).includes(p)),
    );
  }
  const made = exportTime(summary.madeAt);
  return made ? made.getTime() >= new Date(frozenAt).getTime() - 60_000 : undefined;
}

/**
 * How the live app moves: carefully (a pause and a last export, nothing people write is lost), or
 * in one go (a prototype). It can change until the pause or going live.
 */
export async function setMoveMethod(
  ws: Workspace,
  method: string | undefined,
): Promise<{ method: NonNullable<MoveState["method"]> }> {
  if (method !== "careful" && method !== "quick") {
    throw new ClodableError({
      code: "invalid-config",
      message: "Careful or quick?",
      hint: "clodable move method careful (a pause at the end, nothing lost) or quick (in one go).",
    });
  }
  const state = await loadMove(ws.root);
  if (state.switch?.liveAt) {
    throw new ClodableError({
      code: "move-not-ready",
      message: "Your app is live on its new home already.",
    });
  }
  if (method === "quick" && state.switch?.frozenAt) {
    throw new ClodableError({
      code: "move-not-ready",
      message: "Your live app is paused already: finish the careful way.",
      hint: "Or undo the pause in Lovable first, with the line the panel shows.",
    });
  }
  await updateMove(ws.root, (s) => {
    s.method = method;
  });
  return { method };
}

/** The pause, as the panel shows it, with when Lovable allows the next export. */
export async function switchPlan(ws: Workspace) {
  const state = await loadMove(ws.root);
  const summary = state.export?.summary;
  // Once paused, the latest export carries the pause: the grants from before it are kept.
  const sql = freezeSql(
    state.switch?.grants ?? summary?.grants,
    (summary?.scheduledJobs.length ?? 0) > 0,
  );
  const lastExport = summary?.madeAt;
  return { ...sql, ...(lastExport ? { lastExport } : {}) };
}

/** The builder pasted the pause in Lovable. The grants from before it are kept for the new backend. */
export async function markFrozen(ws: Workspace): Promise<{ frozenAt: string }> {
  const state = await loadMove(ws.root);
  if (!state.site || !state.data?.ok) {
    throw new ClodableError({
      code: "move-not-ready",
      message: "Get the copy and your site on Netlify ready first.",
      hint: "The pause should be as short as possible: everything else is done before it.",
    });
  }
  if (state.switch?.frozenAt) return { frozenAt: state.switch.frozenAt };
  const frozenAt = new Date().toISOString();
  await updateMove(ws.root, (s) => {
    s.switch = { ...s.switch, frozenAt, ...(s.export ? { grants: s.export.summary.grants } : {}) };
  });
  return { frozenAt };
}

/** The app's write grants as they were before the pause, on the new backend. */
export async function giveBackGrants(
  sql: Sql,
  grants: Record<string, Record<string, string[]>>,
): Promise<number> {
  const lines = writeGrants(grants);
  if (lines.length === 0) return 0;
  await sql.run(
    lines
      .map(
        (g) =>
          `grant ${g.privileges.join(", ").toLowerCase()} on ${tableName(g.table)} to ${g.role};`,
      )
      .join("\n"),
  );
  return lines.length;
}

/**
 * The scheduled jobs from the export, on the new backend: pointed at it, and at the new site when
 * they called the app on Lovable's hosting. Returns the names of jobs that still mention Lovable.
 */
export async function recreateJobs(
  sql: Sql,
  dir: string,
  from: { ref: string },
  to: { ref: string; siteUrl?: string },
  keys: NewKeys,
): Promise<{ created: number; check: string[] }> {
  const path = join(dir, JOBS_FILE);
  if (!existsSync(path)) return { created: 0, check: [] };
  const jobs = JSON.parse(await readFile(path, "utf8")) as Array<Record<string, string | null>>;
  const site = to.siteUrl ? new URL(to.siteUrl).origin : undefined;
  // A second final copy finds them there already.
  const existing = new Set(
    (
      await sql.rows<{ schedule: string; command: string }>(
        "select schedule, command from cron.job",
      )
    ).map((j) => `${j.schedule}\n${j.command}`),
  );
  let created = 0;
  const check: string[] = [];
  for (const job of jobs) {
    if (!job.schedule || !job.command) continue;
    let command = repoint(job.command, from.ref, to.ref, keys).text;
    if (site) command = command.replace(/https:\/\/[a-z0-9-]+\.lovable\.app/g, site);
    if (/lovable/i.test(command)) check.push(job.jobname ?? `#${job.jobid}`);
    if (existing.has(`${job.schedule}\n${command}`)) continue;
    await sql.run(
      job.jobname
        ? `select cron.schedule(${literal(job.jobname)}, ${literal(job.schedule)}, ${literal(command)});`
        : `select cron.schedule(${literal(job.schedule)}, ${literal(command)});`,
    );
    created++;
  }
  return { created, check };
}

// ── Going live ───────────────────────────────────────────────────────────────

export interface GoLiveOutcome {
  url: string;
  files: string[];
  confirmEmail: boolean;
  /** Whether anyone may create an account (false: only people the builder invites). */
  signUp: boolean;
  /** The quick way: the scheduled jobs started here, those still naming Lovable, a failure. */
  jobs?: { created: number; check: string[]; error?: string };
}

/** `.env` lines that name the backend: the new one's public address and key. */
function rewriteEnv(text: string, values: Record<string, string>): string {
  return text
    .split("\n")
    .map((line) => {
      const match = line.match(/^(\s*(?:export\s+)?)([A-Z0-9_]+)(\s*=\s*)(["']?)(.*?)\4\s*$/);
      if (!match || !(match[2]! in values)) return line;
      return `${match[1]}${match[2]}${match[3]}${match[4]}${values[match[2]!]}${match[4]}`;
    })
    .join("\n");
}

export async function* goLive(
  ws: Workspace,
  options: { confirmEmail?: boolean; signUp?: boolean } = {},
): Flow<GoLiveOutcome> {
  const state = await loadMove(ws.root);
  const quick = state.method === "quick";
  const frozenAt = state.switch?.frozenAt;
  if (!state.home || !state.site) {
    throw new ClodableError({
      code: "move-not-ready",
      message: "Put your site on Netlify first.",
      hint: "Going live points your app and its sign-in at it.",
    });
  }
  if (quick && !state.data?.ok) {
    throw new ClodableError({
      code: "move-not-ready",
      message: "Some things on your new backend need a look first.",
      hint: "Ask Claude to run clodable move diagnose.",
    });
  }
  if (!quick && !frozenAt) {
    throw new ClodableError({
      code: "move-not-ready",
      message: "Pause changes on your live app first.",
      hint: "Going live comes after the pause and the final copy.",
    });
  }
  if (!quick && (!state.data?.ok || state.data.at < frozenAt!)) {
    throw new ClodableError({
      code: "move-not-ready",
      message: "Copy your data in for good first: export again from Lovable, then copy it.",
      hint: "That copy is what keeps everything written before the pause.",
    });
  }
  const supabase = await SupabaseApi.required();

  const keys = await homeKeys(supabase, state.home.ref);
  const url = state.site.url;
  const emails = Boolean(state.emails?.connectedAt);
  // Without emails, confirming is impossible: people would wait for a message that never comes.
  const confirmEmail = emails ? (options.confirmEmail ?? true) : false;

  yield step("move:golive", "running", "Switching to your new backend", "Sign-in for real people");
  const signUp = options.signUp ?? true;
  await liveSignIn(supabase, state.home.ref, url, confirmEmail, signUp);

  // The careful way started them with the final copy; the quick way has had no final copy.
  let jobs: GoLiveOutcome["jobs"];
  if (quick && state.source) {
    yield step("move:golive", "running", "Switching to your new backend", "Your scheduled jobs");
    jobs = await recreateJobs(
      homeSql(supabase, state.home.ref),
      await moveDir(ws.root),
      { ref: state.source.ref },
      { ref: state.home.ref, siteUrl: url },
      keys.legacy,
    ).catch((error: unknown) => ({
      created: 0,
      check: [],
      error: messageOf(error),
    }));
  }

  yield step("move:golive", "running", "Switching to your new backend", "Your app's files");
  const files: string[] = [];
  const from = state.source?.ref;
  const backend = backendOf(state.home.ref, keys);
  // Never the service key: these files go to GitHub with the app.
  const { SUPABASE_SERVICE_ROLE_KEY: _, ...values } = backendEnv(backend);
  for (const name of [".env", ".env.local", ".env.production"]) {
    const path = join(ws.root, name);
    if (!existsSync(path)) continue;
    const before = await readFile(path, "utf8");
    const after = rewriteEnv(before, values);
    if (after !== before) {
      await writeFile(path, after);
      files.push(name);
    }
  }
  if (from) {
    const toml = join(ws.root, "supabase", "config.toml");
    if (existsSync(toml)) {
      const before = await readFile(toml, "utf8");
      const after = before.replace(
        /^project_id\s*=\s*"[^"]*"/m,
        `project_id = "${state.home.ref}"`,
      );
      if (after !== before) {
        await writeFile(toml, after);
        files.push("supabase/config.toml");
      }
    }
    // Older Lovable apps write the backend's address and key in their code.
    for (const file of await textFiles(ws.root, ["src"])) {
      if (!file.text.includes(from)) continue;
      const next = repoint(file.text, from, state.home.ref, { ...keys.legacy, anon: backend.anon });
      if (next.text !== file.text) {
        await writeFile(join(ws.root, file.path), next.text);
        files.push(file.path.replace(/^\//, ""));
      }
    }
  }

  yield step("move:golive", "running", "Switching to your new backend", "Clodable's settings");
  const config: ProjectConfig = {
    ...ws.config,
    backend: "supabase",
    hosting: "github",
    liveUrl: url,
    supabase: { ...ws.config.supabase, projectRef: state.home.ref },
  };
  await saveConfig(ws.root, config);
  await applyKit(ws.root, await planKit(await detectProject(ws.root), config));
  await updateMove(ws.root, (s) => {
    s.preview = "live";
    s.switch = { ...s.switch, liveAt: new Date().toISOString() };
  });
  yield step("move:golive", "done", "Ready to go live", `Publish to put it live at ${url}`);
  return { url, files, confirmEmail, signUp, ...(jobs ? { jobs } : {}) };
}

/**
 * The builder removed Lovable Cloud and stopped Lovable's GitHub sync. The export (every person's
 * password hash in it) has nothing left to do on this computer: it goes now.
 */
export async function markFinished(
  ws: Workspace,
): Promise<{ finishedAt: string; exportDeleted: true }> {
  const state = await loadMove(ws.root);
  if (!state.switch?.liveAt) {
    throw new ClodableError({
      code: "move-not-ready",
      message: "Go live first: Lovable Cloud stays until your app works on its new home.",
    });
  }
  const finishedAt = new Date().toISOString();
  await updateMove(ws.root, (s) => {
    s.switch = { ...s.switch, finishedAt };
  });
  await forgetMoveFiles(ws.root);
  return { finishedAt, exportDeleted: true };
}
