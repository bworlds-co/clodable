import { existsSync } from "node:fs";
import { mkdtemp, readdir, readFile, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import { CloclodError, messageOf } from "../errors.js";
import { type Flow, step } from "../events.js";
import type { Workspace } from "../workspace.js";
import { checkExportSource, type ExportSummary, findExport, readExport } from "./export.js";
import type { NewKeys } from "./fixes.js";
import { homeConnection, homeKeys, homeSql, localTarget } from "./home.js";
import { type Sql, waitForConnection } from "./postgres.js";
import { copyExport } from "./restore.js";
import { prepareCopySignIn } from "./sign-in.js";
import { loadMove, type MoveCheck, moveDir, updateMove } from "./state.js";
import { projectUrl, SupabaseApi } from "./supabase-api.js";
import { giveBackGrants, madeAfterPause, recreateJobs } from "./switch.js";
import { parseToc } from "./toc.js";
import { type VerifyOptions, verifyCopy } from "./verify.js";
import { count } from "./words.js";

/**
 * The data: reading Lovable's export, copying it into the new backend, and checking the copy has
 * everything, the app's API included.
 */

export async function* importExport(
  ws: Workspace,
  options: { file?: string } = {},
): Flow<ExportSummary> {
  yield step("move:export", "running", "Reading your export");
  const file = options.file ?? (await findExport(undefined, ws.project.lovable.projectUrl));
  if (!file) {
    throw new CloclodError({
      code: "export-not-found",
      message: "Cloclod couldn't match an export in Downloads to this app.",
      hint: "Download this app's export from Lovable, or tell Claude the name and location of its .zip, .backup or .dump file. Cloclod won't guess between apps.",
    });
  }
  await checkExportSource(file, ws.project.lovable.projectUrl);
  const dir = await moveDir(ws.root);
  const before = await loadMove(ws.root);
  const pausedAt = before.switch?.liveAt ? undefined : before.switch?.frozenAt;
  // A failed read or stale final export must never replace the last usable copy.
  const target = await mkdtemp(join(dir, "incoming-"));
  let summary: ExportSummary;
  try {
    summary = (await readExport(file, target)).summary;
    if (pausedAt) {
      if (madeAfterPause(summary, before.switch?.grants, pausedAt) === false) {
        throw new CloclodError({
          code: "move-not-ready",
          message: "That export was made before the pause: it would miss what people wrote since.",
          hint: "Check the pause is in place in Lovable, export again, download the new zip, then read it.",
        });
      }
    }
    for (const name of await readdir(target)) {
      await rm(join(dir, name), { recursive: true, force: true });
      await rename(join(target, name), join(dir, name));
    }
  } finally {
    await rm(target, { recursive: true, force: true });
  }
  const sourceRef = ws.project.supabase.projectRef ?? summary.sourceRefs[0];
  await updateMove(ws.root, (s) => {
    s.export = { file: summary.file, importedAt: new Date().toISOString(), summary };
    if (sourceRef) s.source = { ref: sourceRef };
  });
  yield step("move:export", "done", "Read your export", describeExport(summary));
  return summary;
}

export function describeExport(summary: ExportSummary): string {
  const tables = Object.keys(summary.rows).length;
  const files = summary.buckets.reduce((a, b) => a + b.files, 0);
  return [
    count(tables, "table"),
    count(summary.people.total, "person", "people"),
    ...(files > 0 ? [count(files, "file")] : []),
  ].join(" · ");
}

async function migrationVersions(root: string): Promise<string[]> {
  const dir = join(root, "supabase", "migrations");
  if (!existsSync(dir)) return [];
  return (await readdir(dir))
    .map((name) => name.match(/^(\d{8,})_.*\.sql$/)?.[1])
    .filter((v): v is string => Boolean(v))
    .sort();
}

export async function* copyData(ws: Workspace): Flow<{ ok: boolean; checks: MoveCheck[] }> {
  const state = await loadMove(ws.root);
  if (!state.home) {
    throw new CloclodError({
      code: "move-not-ready",
      message: "Create your new backend first.",
      hint: "It's the step before this one.",
    });
  }
  if (!state.export) {
    throw new CloclodError({
      code: "move-not-ready",
      message: "Export your data from Lovable first.",
      hint: "It's the step before this one.",
    });
  }
  const api = await SupabaseApi.required();
  const dir = await moveDir(ws.root);
  const backup = join(dir, "export.backup");
  if (!existsSync(backup)) {
    throw new CloclodError({
      code: "export-not-found",
      message: "The export Cloclod read is gone from this computer.",
      hint: "Read it again: download the export from Lovable, then run that step again.",
    });
  }
  const toc = parseToc(await readFile(join(dir, "toc.list"), "utf8"));
  const summary = state.export.summary;

  yield step("move:data", "running", "Copying your data", "Connecting to your new database");
  const pg = await homeConnection(api, state.home);
  await waitForConnection(pg);
  const sql = homeSql(api, state.home.ref);
  const keys = localTarget() ? { legacy: {} as NewKeys } : await homeKeys(api, state.home.ref);
  const versions = await migrationVersions(ws.root);
  // The switch's final copy: the export carries the pause, so the app's writes are given back,
  // and its scheduled jobs start here (never on a copy: they would run twice).
  const switching = Boolean(
    state.switch?.frozenAt && state.export.importedAt > state.switch.frozenAt,
  );
  const outcome = yield* copyExport(
    { pg, sql, ref: state.home.ref, keys: keys.legacy },
    dir,
    toc,
    summary,
    {
      ...(state.source ? { sourceRef: state.source.ref } : {}),
      migrationVersions: versions,
      again: Boolean(state.data),
      queueMessages: switching,
    },
  );
  if (switching) {
    const grants = state.switch?.grants;
    if (grants) {
      await giveBackGrants(sql, grants).then(
        (n) => {
          if (n > 0) outcome.fixes.push("Gave your app its writes back");
        },
        (error: unknown) => outcome.problems.push(`writes: ${messageOf(error)}`),
      );
    }
    if (state.source) {
      await recreateJobs(
        sql,
        dir,
        { ref: state.source.ref },
        { ref: state.home.ref, ...(state.site ? { siteUrl: state.site.url } : {}) },
        keys.legacy,
      ).then(
        ({ created, check }) => {
          if (created > 0) {
            outcome.fixes.push(`Started ${created} scheduled job${created === 1 ? "" : "s"}`);
          }
          if (check.length > 0) {
            outcome.problems.push(`scheduled jobs still naming Lovable: ${check.join(", ")}`);
          }
        },
        (error: unknown) => outcome.problems.push(`scheduled jobs: ${messageOf(error)}`),
      );
    }
  } else {
    await prepareCopySignIn(api, state.home.ref).then(
      () => outcome.fixes.push("Let the preview sign people in"),
      (error: unknown) => outcome.problems.push(`sign-in settings: ${messageOf(error)}`),
    );
  }

  yield step("move:checks", "running", "Checking everything is there");
  // The final export carries the pause: what the app could do is what it could before it.
  const before =
    switching && state.switch?.grants ? { ...summary, grants: state.switch.grants } : summary;
  const checks = await copyChecks(api, sql, state.home.ref, before, {
    ...(state.source ? { sourceRef: state.source.ref } : {}),
  });
  const ok = checks.every((c) => c.ok);
  const at = new Date().toISOString();
  await updateMove(ws.root, (s) => {
    s.data = { at, ok, problems: outcome.problems.slice(0, 50), fixes: outcome.fixes };
    s.checks = { at, ok, items: checks };
  });
  yield step(
    "move:checks",
    ok ? "done" : "warning",
    ok ? "Everything is there" : "Some things need a look",
    checks
      .filter((c) => !c.ok)
      .map((c) => c.label)
      .join(" · ") || undefined,
  );
  return { ok, checks };
}

/**
 * The copy's checks against what the export had, and whether the app's API sees its tables (a
 * local database, in tests, has no API to ask).
 */
async function copyChecks(
  api: SupabaseApi,
  sql: Sql,
  ref: string,
  expected: ExportSummary,
  options: VerifyOptions,
): Promise<MoveCheck[]> {
  const checks = await verifyCopy(sql, expected, options);
  if (!localTarget()) checks.push(await apiSeesTables(api, sql, ref, expected));
  return checks;
}

/**
 * Can the app's API reach its tables? It keeps its own list of them, refreshed when the database
 * tells it to; until then it answers "table not found" and every page shows nothing.
 */
export async function apiSeesTables(
  api: SupabaseApi,
  sql: Sql,
  ref: string,
  summary: ExportSummary,
  { refresh = true } = {},
): Promise<MoveCheck> {
  const tables = Object.keys(summary.rows)
    .filter((t) => t.startsWith("public."))
    .map((t) => t.slice("public.".length))
    .slice(0, 5);
  if (tables.length === 0) return { id: "api", ok: true, label: "Your app's API is ready" };
  const { secret } = await homeKeys(api, ref);
  let missing: string[] = [];
  for (let attempt = 0; attempt < 6; attempt++) {
    missing = [];
    for (const table of tables) {
      const response = await fetch(
        `${projectUrl(ref)}/rest/v1/${encodeURIComponent(table)}?select=*&limit=0`,
        { headers: { apikey: secret }, signal: AbortSignal.timeout(20_000) },
      ).catch(() => undefined);
      if (!response || response.status === 404) missing.push(table);
    }
    if (missing.length === 0 || !refresh) break;
    await sql.run("notify pgrst, 'reload schema';").catch(() => {});
    await new Promise((done) => setTimeout(done, 2000));
  }
  return {
    id: "api",
    ok: missing.length === 0,
    label:
      missing.length === 0
        ? "Your app's API sees every table"
        : "Your app's API doesn't see some tables yet",
    ...(missing.length > 0 ? { detail: missing.join(", ") } : {}),
  };
}

/** Check the copy again, without copying (after files, or any time). */
export async function* checkCopy(ws: Workspace): Flow<{ ok: boolean; checks: MoveCheck[] }> {
  const state = await loadMove(ws.root);
  if (!state.home || !state.export) {
    throw new CloclodError({
      code: "move-not-ready",
      message: "There's no copy to check yet.",
      hint: "Copy your data first.",
    });
  }
  const api = await SupabaseApi.required();
  yield step("move:checks", "running", "Checking everything is there");
  const sql = homeSql(api, state.home.ref);
  const checks = await copyChecks(api, sql, state.home.ref, state.export.summary, {
    ...(state.source ? { sourceRef: state.source.ref } : {}),
    files: Boolean(state.files),
    exact: false,
  });
  const ok = checks.every((c) => c.ok);
  await updateMove(ws.root, (s) => {
    s.checks = { at: new Date().toISOString(), ok, items: checks };
  });
  yield step(
    "move:checks",
    ok ? "done" : "warning",
    ok ? "Everything is there" : "Some things need a look",
  );
  return { ok, checks };
}
