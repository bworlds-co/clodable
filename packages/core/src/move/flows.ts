import { randomInt } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, readdir, readFile, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import { ClodableError, messageOf } from "../errors.js";
import { type Flow, step } from "../events.js";
import { readSecret, storeSecret } from "../local-secrets.js";
import type { Workspace } from "../workspace.js";
import { textFiles } from "./assess.js";
import { type ExportSummary, findExport, readExport } from "./export.js";
import { factsSummary, type RecordedFacts } from "./facts.js";
import { copyFiles, type FilesOutcome } from "./files.js";
import { literal, type NewKeys, setVaultSecret } from "./fixes.js";
import {
  type DeployOutcome,
  deployFunctions,
  functionSecrets,
  localFunctions,
  stripeWebhooks,
} from "./functions.js";
import { type GoogleStatus, googleStatus } from "./google.js";
import { NETLIFY_TOKEN } from "./netlify-api.js";
import { managementSql, type PgTarget, psqlSql, type Sql, waitForConnection } from "./postgres.js";
import { RESEND_KEY } from "./resend-api.js";
import { copyExport } from "./restore.js";
import {
  type ServicesStatus,
  servicesLeft,
  servicesStatus,
  usesLovableServices,
} from "./services.js";
import { appSettings } from "./site.js";
import { loadMove, type MoveCheck, type MoveState, moveDir, updateMove } from "./state.js";
import {
  MOVE_PERMISSIONS,
  type Organization,
  projectUrl,
  SUPABASE_TOKEN,
  SupabaseApi,
  type SupabaseProject,
} from "./supabase-api.js";
import {
  exportTime,
  giveBackGrants,
  liveSignIn,
  madeAfterPause,
  recreateJobs,
  STOP_LOVABLE_JOBS,
} from "./switch.js";
import { parseToc } from "./toc.js";
import { verifyCopy } from "./verify.js";

/**
 * The move off Lovable, as steps a builder takes one at a time. Each is safe to run again, and
 * none touches the live app: the new backend is a working copy until the builder switches.
 */

const passwordKey = (ref: string) => `db-password:${ref}`;

function newPassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  return Array.from({ length: 32 }, () => alphabet[randomInt(alphabet.length)]).join("");
}

const now = () => new Date().toISOString();

// ── 1. Connect ───────────────────────────────────────────────────────────────

export interface OrganizationChoice {
  slug: string;
  name: string;
  plan: string;
  /** Free organizations: how many more active free projects the account may have (at most 2). */
  freeLeft?: number;
}

/** Check a Supabase access token and keep it on this computer. */
export async function connectSupabase(
  token: string,
): Promise<{ organizations: OrganizationChoice[] }> {
  const trimmed = token.trim();
  if (!/^sbp_[A-Za-z0-9_-]{20,}$/.test(trimmed)) {
    throw new ClodableError({
      code: "supabase-auth",
      message: "That doesn't look like a Supabase access token.",
      hint: "It starts with sbp_. Create one in Supabase: Account → Access Tokens → Generate new token.",
    });
  }
  const api = new SupabaseApi(trimmed);
  const organizations = await organizationChoices(api);
  await storeSecret(SUPABASE_TOKEN, trimmed);
  return { organizations };
}

export async function organizationChoices(api: SupabaseApi): Promise<OrganizationChoice[]> {
  return (await accountChoices(api)).organizations;
}

/** Free projects running now, which count toward Supabase's limit of 2 per person. */
export interface RunningFreeProject {
  name: string;
  organization: string;
}

async function accountChoices(
  api: SupabaseApi,
): Promise<{ organizations: OrganizationChoice[]; freeProjects: RunningFreeProject[] }> {
  const [organizations, projects] = await Promise.all([api.organizations(), api.projects()]);
  const detailed = await Promise.all(
    organizations.map(async (o: Organization) => ({
      ...o,
      plan: (await api.organization(o.slug).catch(() => o)).plan ?? "free",
    })),
  );
  // Free projects count across every free organization the person runs.
  const running = new Set([
    "ACTIVE_HEALTHY",
    "ACTIVE_UNHEALTHY",
    "COMING_UP",
    "UNKNOWN",
    "RESTORING",
  ]);
  const freeSlugs = new Set(detailed.filter((o) => o.plan === "free").map((o) => o.slug));
  const freeProjects = projects
    .filter((p: SupabaseProject) => freeSlugs.has(p.organization_slug) && running.has(p.status))
    .map((p) => ({
      name: p.name,
      organization: detailed.find((o) => o.slug === p.organization_slug)?.name ?? "",
    }));
  return {
    organizations: detailed.map((o) => ({
      slug: o.slug,
      name: o.name,
      plan: o.plan,
      ...(o.plan === "free" ? { freeLeft: Math.max(0, 2 - freeProjects.length) } : {}),
    })),
    freeProjects,
  };
}

// ── 2. The new backend ───────────────────────────────────────────────────────

export interface HomeChoices {
  organizations: OrganizationChoice[];
  /** The free projects already running: the ones to pause when the limit is reached. */
  freeProjects: RunningFreeProject[];
  /** Where Supabase suggests, from this computer's location. */
  region?: { code: string; name: string };
  regions: Array<{ code: string; name: string }>;
}

export async function homeChoices(): Promise<HomeChoices> {
  const api = await SupabaseApi.required();
  const { organizations, freeProjects } = await accountChoices(api);
  const first = organizations[0];
  if (!first) return { organizations, freeProjects, regions: [] };
  const regions = await api.regions(first.slug).catch(() => ({ all: [] }) as { all: never[] });
  return {
    organizations,
    freeProjects,
    ...("recommended" in regions && regions.recommended
      ? { region: { code: regions.recommended.code, name: regions.recommended.name } }
      : {}),
    regions: regions.all.map((r) => ({ code: r.code, name: r.name })),
  };
}

/** What a new project costs in this organization, in plain words. */
export function costOf(org: OrganizationChoice): string {
  if (org.plan === "free") return "Free";
  return "About $10 a month, added to your Supabase plan";
}

/** Create the builder's own Supabase project, wait until it's up, and remember it. */
export async function* createHome(
  ws: Workspace,
  options: { org?: string; region?: string; name?: string },
): Flow<NonNullable<MoveState["home"]>> {
  const state = await loadMove(ws.root);
  if (state.home) {
    yield step("move:create", "done", "Your new backend is ready", state.home.name);
    return state.home;
  }
  const api = await SupabaseApi.required();
  yield step("move:create", "running", "Creating your new backend");
  const organizations = await organizationChoices(api);
  const org =
    organizations.find((o) => o.slug === options.org) ??
    (organizations.length === 1 ? organizations[0] : undefined);
  if (!org) {
    throw new ClodableError({
      code: "move-not-ready",
      message: "Which Supabase organization should it go in?",
      hint: `Pick one: ${organizations.map((o) => o.name).join(", ")}.`,
    });
  }
  const region =
    options.region ?? (await api.regions(org.slug).catch(() => undefined))?.recommended?.code;
  if (!region) {
    throw new ClodableError({
      code: "move-not-ready",
      message: "Which part of the world should your backend run in?",
      hint: "Pick the region closest to your users.",
    });
  }
  const password = newPassword();
  const created = await api.createProject({
    name: (options.name ?? ws.project.name).slice(0, 60),
    org: org.slug,
    password,
    region,
  });
  await storeSecret(passwordKey(created.ref), password);
  const home = {
    ref: created.ref,
    name: created.name,
    region: created.region,
    createdAt: now(),
    createdByClodable: true,
  };
  await updateMove(ws.root, (s) => {
    s.org = { slug: org.slug, name: org.name, plan: org.plan };
    s.home = home;
  });

  yield step(
    "move:create",
    "running",
    "Creating your new backend",
    "Starting it up: about 2 minutes",
  );
  const started = Date.now();
  while (true) {
    const project = await api.project(created.ref).catch(() => undefined);
    if (project?.status === "INIT_FAILED") {
      throw new ClodableError({
        code: "supabase-failed",
        message: "Supabase couldn't start your new backend.",
        hint: "Delete it in Supabase, then create it again from Clodable.",
      });
    }
    if (project?.status === "ACTIVE_HEALTHY") {
      const health = await api
        .health(created.ref, ["db", "auth", "rest", "storage"])
        .catch(() => []);
      if (health.length > 0 && health.every((s) => s.healthy)) break;
    }
    if (Date.now() - started > 15 * 60_000) {
      throw new ClodableError({
        code: "supabase-failed",
        message: "Your new backend is taking unusually long to start.",
        hint: "Check it in Supabase, then try this step again: Clodable picks up where it was.",
      });
    }
    await new Promise((done) => setTimeout(done, 5000));
  }
  yield step("move:create", "done", "Your new backend is ready", home.name);
  return home;
}

/** The new project's keys: publishable for the app, secret for copying files, legacy for old code. */
export async function homeKeys(
  api: SupabaseApi,
  ref: string,
): Promise<{ publishable: string; secret: string; legacy: NewKeys }> {
  let keys = await api.apiKeys(ref);
  const find = (type: string, name?: string) =>
    keys.find((k) => k.type === type && (!name || k.name === name))?.api_key;
  if (!find("publishable")) {
    await api.createApiKey(ref, "publishable");
    keys = await api.apiKeys(ref);
  }
  if (!find("secret")) {
    await api.createApiKey(ref, "secret");
    keys = await api.apiKeys(ref);
  }
  const anon = find("legacy", "anon");
  const serviceRole = find("legacy", "service_role");
  return {
    publishable: find("publishable")!,
    secret: find("secret")!,
    legacy: {
      ...(anon ? { anon } : {}),
      ...(serviceRole ? { serviceRole } : {}),
    },
  };
}

/** How Postgres tools reach the new project: its session pooler, with the password kept here. */
async function homeConnection(
  api: SupabaseApi,
  home: NonNullable<MoveState["home"]>,
): Promise<PgTarget> {
  const local = localTarget();
  if (local) return local;
  let password = await readSecret(passwordKey(home.ref));
  if (!password) {
    if (!home.createdByClodable) {
      throw new ClodableError({
        code: "move-not-ready",
        message: "Clodable doesn't have this backend's database password.",
        hint: "Run the move from the computer that created it.",
      });
    }
    // Clodable made this project: a new password changes nothing for anyone else.
    password = newPassword();
    await api.setPassword(home.ref, password);
    await storeSecret(passwordKey(home.ref), password);
  }
  const pooler = await api.pooler(home.ref);
  if (!pooler) {
    throw new ClodableError({
      code: "supabase-failed",
      message: "Supabase didn't say how to connect to your new database.",
      hint: "Try again in a minute.",
    });
  }
  return {
    host: pooler.db_host,
    // Session mode: what pg_restore and psql need, on the pooler's port 5432 (IPv4).
    port: 5432,
    user: pooler.db_user,
    password,
    database: pooler.db_name || "postgres",
    ssl: true,
  };
}

/** A database URL to talk to instead of Supabase (tests, local runs). */
function localTarget(): PgTarget | undefined {
  const local = process.env.CLODABLE_MOVE_DATABASE_URL;
  if (!local) return undefined;
  const url = new URL(local);
  return {
    host: url.hostname,
    port: Number(url.port || 5432),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.slice(1) || "postgres",
    ssl: url.searchParams.get("sslmode") === "require",
  };
}

/** SQL on the new project: Supabase's API, or the local database in tests. */
export function homeSql(api: SupabaseApi, ref: string): Sql {
  const local = localTarget();
  return local ? psqlSql(local) : managementSql(api, ref);
}

// ── 3. The export ────────────────────────────────────────────────────────────

export async function* importExport(
  ws: Workspace,
  options: { file?: string } = {},
): Flow<ExportSummary> {
  yield step("move:export", "running", "Reading your export");
  const file = options.file ?? (await findExport());
  if (!file) {
    throw new ClodableError({
      code: "export-not-found",
      message: "Clodable didn't find your Lovable export in Downloads.",
      hint: "In Lovable: More → Cloud → Overview → Advanced settings → Export data, then Export on the Database card, then Start export. Download the zip from the email Lovable sends (or from Cloud → Storage).",
    });
  }
  const dir = await moveDir(ws.root);
  const before = await loadMove(ws.root);
  const pausedAt = before.switch?.liveAt ? undefined : before.switch?.frozenAt;
  // During the pause, the export is read aside first: one made before the pause would lose what
  // people wrote since, so it never replaces the one the final copy uses.
  const target = pausedAt ? await mkdtemp(join(dir, "incoming-")) : dir;
  let summary: ExportSummary;
  try {
    summary = (await readExport(file, target)).summary;
    if (pausedAt) {
      if (madeAfterPause(summary, before.switch?.grants, pausedAt) === false) {
        throw new ClodableError({
          code: "move-not-ready",
          message: "That export was made before the pause: it would miss what people wrote since.",
          hint: "Check the pause is in place in Lovable, export again, download the new zip, then read it.",
        });
      }
      for (const name of await readdir(target)) {
        await rm(join(dir, name), { recursive: true, force: true });
        await rename(join(target, name), join(dir, name));
      }
    }
  } finally {
    if (pausedAt) await rm(target, { recursive: true, force: true });
  }
  const sourceRef = ws.project.supabase.projectRef ?? summary.sourceRefs[0];
  await updateMove(ws.root, (s) => {
    s.export = { file: summary.file, importedAt: now(), summary };
    if (sourceRef) s.source = { ref: sourceRef };
  });
  yield step("move:export", "done", "Read your export", describeExport(summary));
  return summary;
}

const count = (n: number, one: string, many = `${one}s`) =>
  `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

export function describeExport(summary: ExportSummary): string {
  const tables = Object.keys(summary.rows).length;
  const files = summary.buckets.reduce((a, b) => a + b.files, 0);
  return [
    count(tables, "table"),
    count(summary.people.total, "person", "people"),
    ...(files > 0 ? [count(files, "file")] : []),
  ].join(" · ");
}

// ── 4. The copy ──────────────────────────────────────────────────────────────

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
    throw new ClodableError({
      code: "move-not-ready",
      message: "Create your new backend first.",
      hint: "It's the step before this one.",
    });
  }
  if (!state.export) {
    throw new ClodableError({
      code: "move-not-ready",
      message: "Export your data from Lovable first.",
      hint: "It's the step before this one.",
    });
  }
  const api = await SupabaseApi.required();
  const dir = await moveDir(ws.root);
  const backup = join(dir, "export.backup");
  if (!existsSync(backup)) {
    throw new ClodableError({
      code: "export-not-found",
      message: "The export Clodable read is gone from this computer.",
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
  const checks = await verifyCopy(sql, before, {
    ...(state.source ? { sourceRef: state.source.ref } : {}),
  });
  if (!localTarget()) checks.push(await apiSeesTables(api, sql, state.home.ref, summary));
  const ok = checks.every((c) => c.ok);
  await updateMove(ws.root, (s) => {
    s.data = { at: now(), ok, problems: outcome.problems.slice(0, 50), fixes: outcome.fixes };
    s.checks = { at: now(), ok, items: checks };
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
 * Can the app's API reach its tables? It keeps its own list of them, refreshed when the database
 * tells it to; until then it answers "table not found" and every page shows nothing.
 */
async function apiSeesTables(
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

// ── Diagnosis, for whoever runs the move (Claude, in the builder's conversation) ──

/** One thing looked at: what's true, and the way forward when it isn't. */
export interface MoveFinding extends MoveCheck {
  /** What to do about it, when it isn't fine. */
  fix?: string;
  /** `--fix` just put it right. */
  fixed?: boolean;
}

/**
 * Everything worth knowing about the copy when something seems off, in safe facts only: counts,
 * times, settings and names; never a key, a password or a row. `fix` applies Clodable's own
 * fixes on the copy (its API's list of tables, the preview's sign-in settings); nothing else.
 */
export async function diagnoseCopy(
  ws: Workspace,
  options: { fix?: boolean } = {},
): Promise<{ findings: MoveFinding[] }> {
  const state = await loadMove(ws.root);
  if (!state.home) {
    throw new ClodableError({
      code: "move-not-ready",
      message: "There's no new backend to look at yet.",
      hint: "Create it first: it's an early step of the move.",
    });
  }
  const api = await SupabaseApi.required();
  const ref = state.home.ref;
  const findings: MoveFinding[] = [];

  const project = await api.project(ref).catch(() => undefined);
  const running = project?.status === "ACTIVE_HEALTHY";
  findings.push({
    id: "running",
    ok: running,
    label: running
      ? "Your new backend is running"
      : `Your new backend isn't running (${project?.status ?? "Supabase didn't answer"})`,
    ...(running
      ? {}
      : { fix: "If it's paused, restore it on its page in Supabase, then look again." }),
  });
  if (!running) return { findings };
  const sql = homeSql(api, ref);

  if (state.export && !localTarget()) {
    const check = await apiSeesTables(api, sql, ref, state.export.summary, {
      refresh: Boolean(options.fix),
    });
    findings.push({
      ...check,
      ...(check.ok
        ? options.fix
          ? { fixed: true }
          : {}
        : {
            fix: "Run `clodable move diagnose --fix`: it asks the API to refresh its list of tables.",
          }),
    });
  }

  const auth = await api.authConfig(ref);
  const site = state.switch?.liveAt ? state.site?.url : undefined;
  if (site) {
    // Live: sign-in links go to the site. Whether people confirm their email was the builder's
    // choice when going live, so it's left alone.
    const comesBack =
      auth.site_url === site && String(auth.uri_allow_list ?? "").includes(`${site}/**`);
    if (!comesBack && options.fix) await liveSignIn(api, ref, site);
    const ok = comesBack || Boolean(options.fix);
    findings.push({
      id: "sign-in",
      ok,
      label: ok
        ? "Sign-in links come back to your site"
        : "Sign-in links don't come back to your site",
      ...(ok
        ? comesBack
          ? {}
          : { fixed: true }
        : {
            detail: `they go to ${String(auth.site_url ?? "Supabase's default")}`,
            fix: "Run `clodable move diagnose --fix`.",
          }),
    });
  }
  const comesBack = String(auth.uri_allow_list ?? "").includes("http://localhost:*");
  const noEmailWait = auth.mailer_autoconfirm === true;
  let signInFixed = false;
  if (!site && (!comesBack || !noEmailWait) && options.fix) {
    await prepareCopySignIn(api, ref);
    signInFixed = true;
  }
  const signInOk = (comesBack && noEmailWait) || signInFixed;
  if (!site)
    findings.push({
      id: "sign-in",
      ok: signInOk,
      label: signInOk
        ? "The preview can sign people in on the copy"
        : "Sign-ins on the copy don't come back to the preview",
      ...(signInOk
        ? signInFixed
          ? { fixed: true }
          : {}
        : {
            detail: [
              comesBack
                ? ""
                : `sign-in links go to ${String(auth.site_url ?? "Supabase's default")}`,
              noEmailWait
                ? ""
                : "new people must confirm by email, which Supabase's test mailer rarely sends",
            ]
              .filter(Boolean)
              .join("; "),
            fix: "Run `clodable move diagnose --fix`.",
          }),
    });

  const [people] = await sql.rows<{
    people: number;
    last_signup: string | null;
    last_sign_in: string | null;
  }>(
    "select count(*)::int as people, max(created_at)::text as last_signup, max(last_sign_in_at)::text as last_sign_in from auth.users",
  );
  findings.push({
    id: "people",
    ok: true,
    label: `${count(Number(people?.people ?? 0), "person", "people")} on the copy`,
    detail: `last sign-up ${people?.last_signup?.slice(0, 19) ?? "never"}, last sign-in ${people?.last_sign_in?.slice(0, 19) ?? "never"} (UTC)`,
  });

  if (state.export) {
    const checks = await verifyCopy(sql, state.export.summary, {
      ...(state.source ? { sourceRef: state.source.ref } : {}),
      files: Boolean(state.files),
      exact: false,
    });
    const failing = checks.filter((c) => !c.ok);
    if (failing.length === 0) {
      findings.push({ id: "data", ok: true, label: "Your data's checks pass" });
    } else {
      findings.push(
        ...failing.map((c) => ({
          ...c,
          fix: "Copying again from a fresh export usually puts it right.",
        })),
      );
    }
  }
  if (state.data && state.data.problems.length > 0) {
    findings.push({
      id: "copy-notes",
      ok: true,
      label: `The copy noted ${count(state.data.problems.length, "message")} from Postgres`,
      detail: state.data.problems.slice(0, 5).join("; "),
    });
  }
  findings.push({
    id: "preview",
    ok: true,
    label:
      state.preview === "copy"
        ? "The preview uses the copy"
        : "The preview uses your live data (on Lovable Cloud)",
  });
  return { findings };
}

/** Check the copy again, without copying (after files, or any time). */
export async function* checkCopy(ws: Workspace): Flow<{ ok: boolean; checks: MoveCheck[] }> {
  const state = await loadMove(ws.root);
  if (!state.home || !state.export) {
    throw new ClodableError({
      code: "move-not-ready",
      message: "There's no copy to check yet.",
      hint: "Copy your data first.",
    });
  }
  const api = await SupabaseApi.required();
  yield step("move:checks", "running", "Checking everything is there");
  const sql = homeSql(api, state.home.ref);
  const checks = await verifyCopy(sql, state.export.summary, {
    ...(state.source ? { sourceRef: state.source.ref } : {}),
    files: Boolean(state.files),
    exact: false,
  });
  if (!localTarget())
    checks.push(await apiSeesTables(api, sql, state.home.ref, state.export.summary));
  const ok = checks.every((c) => c.ok);
  await updateMove(ws.root, (s) => {
    s.checks = { at: now(), ok, items: checks };
  });
  yield step(
    "move:checks",
    ok ? "done" : "warning",
    ok ? "Everything is there" : "Some things need a look",
  );
  return { ok, checks };
}

// ── Where the move stands ────────────────────────────────────────────────────

export interface MoveStep {
  id:
    | "facts"
    | "connect"
    | "create"
    | "export"
    | "copy"
    | "files"
    | "functions"
    | "secrets"
    | "try"
    | "netlify"
    | "site"
    | "emails"
    | "services"
    | "google"
    | "freeze"
    | "final-export"
    | "final-copy"
    | "golive"
    | "domain"
    | "lovable";
  state: "done" | "next" | "later" | "attention";
  title: string;
  detail?: string;
}

export interface MoveProgress {
  steps: MoveStep[];
  home?: { ref: string; name: string; url: string; dashboard: string };
  preview: "live" | "copy";
  checks?: MoveCheck[];
  /** What the last file copy left: private folders waiting for Lovable Cloud's key, and more. */
  files?: { waiting: string[]; tooBig: number; failed: number };
  /**
   * The export says the app keeps Lovable Cloud's service key in its vault (Lovable's emails do):
   * the builder can read it there, which private folders need.
   */
  vaultKey: boolean;
  /** Backend functions in the app. */
  functions: number;
  /** Until Supabase is connected: what a scoped token needs, for people who'd rather not give full access. */
  tokenPermissions?: string[];
  /** The website's new home, once it's on Netlify; `liveAt`: the last Publish that updated it. */
  site?: { name: string; url: string; admin: string; liveAt?: string };
  /** Resend is connected on this computer. */
  resend: boolean;
  /** Emails for real people, through the builder's Resend account. */
  emails?: {
    domain: string;
    sender: string;
    status: string;
    records: Array<{ type: string; name: string; value: string; priority?: number }>;
    connected: boolean;
  };
  /** How the live app moves, once the builder chose. */
  method?: "careful" | "quick";
  /** The switch, as far as it went. `lastExport`: when Lovable made the latest export. */
  switch?: {
    frozenAt?: string;
    liveAt?: string;
    finishedAt?: string;
    noEmails?: boolean;
  };
  lastExport?: string;
  /**
   * In one go: the scheduled jobs that start on the new backend at go-live, and the line that
   * stops them in Lovable first, so they don't run twice.
   */
  lovableJobs?: { count: number; stop: string };
  /**
   * After going live: whether the app has sign-in, and the last sign-in on the new backend since.
   * Lovable's last steps wait for one: proof the app works there before its old home goes.
   */
  signIn?: { needed: boolean; at?: string };
  /**
   * On Supabase's free plan, when the app is larger than it holds (500 MB of data, 1 GB of files):
   * said before copying, while upgrading is still easy.
   */
  plan?: { data: number; dataLimit: number; files: number; filesLimit: number };
  /**
   * Backend functions that receive Stripe's webhooks, with their new address: the builder changes
   * it in Stripe and pastes the endpoint's new signing secret.
   */
  stripeWebhooks?: Array<{ name: string; url: string }>;
  /** Google sign-in: where it stands, and the redirect the builder's Google client allows. */
  google?: GoogleStatus;
  /** Lovable's own services the app uses, and what's left to switch. */
  services?: ServicesStatus & { left: string[] };
  /** The app's own domain while its records aren't seen yet: what to set at its provider. */
  domain?: { name: string; records: Array<{ type: string; name: string; value: string }> };
  /**
   * What keeps a step open after its main part is done (names only): the app's settings the site
   * doesn't have, the functions' secrets, the database's encrypted secrets.
   */
  settingsLeft?: string[];
  secretsLeft?: string[];
  vaultLeft?: string[];
  /** What the app uses, as Claude found it before the move started. */
  facts?: RecordedFacts;
  /**
   * The app's scheduled jobs call it with a key Lovable keeps (LOVABLE_CRON_SECRET): before going
   * live, Claude gives them one of the builder's own.
   */
  cronKey?: boolean;
}

/** Supabase's free plan: 500 MB of database, 1 GB of files. */
const FREE_DATA = 500 * 1024 ** 2;
const FREE_FILES = 1024 ** 3;

/**
 * When the app is larger than the free plan holds. The export is compressed: its data takes about
 * three times its size in the database, so that's what's compared.
 */
export function planLimits(
  state: MoveState,
): { data: number; dataLimit: number; files: number; filesLimit: number } | undefined {
  if (state.org?.plan !== "free" || !state.export) return undefined;
  const data = state.export.summary.bytes * 3;
  const files = state.export.summary.buckets.reduce((a, b) => a + b.bytes, 0);
  if (data <= FREE_DATA && files <= FREE_FILES) return undefined;
  return { data, dataLimit: FREE_DATA, files, filesLimit: FREE_FILES };
}

/** The latest sign-in on the new backend after `since`, if Clodable can look. */
async function signInSince(state: MoveState, since: string): Promise<string | undefined> {
  if (!state.home) return undefined;
  const api = await SupabaseApi.onThisComputer();
  if (!api) return undefined;
  const [row] = await homeSql(api, state.home.ref)
    .rows<{ at: string | null }>(
      `select max(last_sign_in_at)::text as at from auth.users where last_sign_in_at > ${literal(since)}::timestamptz`,
    )
    .catch(() => [] as Array<{ at: string | null }>);
  return row?.at ?? undefined;
}

/** Whether the app signs people in (its code calls Supabase Auth). */
async function usesSignIn(root: string): Promise<boolean> {
  const files = await textFiles(root, ["src"]);
  return files.some((f) =>
    /\.auth\.(signIn|signUp|getUser|getSession|onAuthStateChange)\b/.test(f.text),
  );
}

export async function moveProgress(ws: Workspace): Promise<MoveProgress> {
  const state = await loadMove(ws.root);
  const connected = Boolean(await readSecret(SUPABASE_TOKEN));
  const fns = await localFunctions(ws.root);
  const functionCount = fns.length;
  const stripe = await stripeWebhooks(ws.root, fns);
  const steps: MoveStep[] = [];
  const add = (s: Omit<MoveStep, "state">, done: boolean, attention = false) => {
    const before = steps.some((x) => x.state === "next" || x.state === "attention");
    steps.push({
      ...s,
      state: done ? "done" : attention ? "attention" : before ? "later" : "next",
    });
  };
  // First, Claude reads the app's code: what it uses decides the steps that follow.
  add(
    {
      id: "facts",
      title: "Look at your app",
      ...(state.facts ? { detail: factsSummary(state.facts) } : {}),
    },
    Boolean(state.facts),
  );
  // Accounts are connected per computer, not per app: one connected for another app shows done.
  const onThisComputer = { detail: "Connected on this computer" };
  add(
    { id: "connect", title: "Connect your Supabase account", ...(connected ? onThisComputer : {}) },
    connected,
  );
  add(
    {
      id: "create",
      title: "Create your new backend",
      ...(state.home ? { detail: `${state.home.name} · ${state.home.region}` } : {}),
    },
    Boolean(state.home),
  );
  add(
    {
      id: "export",
      title: "Export your data from Lovable",
      ...(state.export ? { detail: describeExport(state.export.summary) } : {}),
    },
    Boolean(state.export),
  );
  // What's still to do in a step keeps it open, unless the builder goes on without it.
  const vaultLeft = state.data
    ? (state.export?.summary.vaultSecrets ?? [])
        .filter((n) => !AUTO_VAULT.has(n) && !(state.vault ?? []).includes(n))
        .sort()
    : [];
  const vaultOpen = vaultLeft.length > 0 && !state.skipped?.vault;
  add(
    {
      id: "copy",
      title: "Copy it into your new backend",
      ...(state.data
        ? {
            detail: !state.data.ok
              ? "Some things need a look"
              : vaultOpen
                ? `${count(vaultLeft.length, "database secret")} to add`
                : "Everything is there",
          }
        : {}),
    },
    Boolean(state.data?.ok) && !vaultOpen,
    Boolean(state.data && !state.data.ok),
  );
  const fileCount = state.export?.summary.buckets.reduce((a, b) => a + b.files, 0) ?? 0;
  if (fileCount > 0) {
    add(
      {
        id: "files",
        title: "Copy your uploaded files",
        detail: state.files
          ? `${state.files.copied.toLocaleString("en-US")} of ${state.files.total.toLocaleString("en-US")} copied`
          : `${count(fileCount, "file")}`,
      },
      Boolean(state.files && state.files.copied >= state.files.total),
      Boolean(state.files && state.files.copied < state.files.total),
    );
  }
  const secretsLeft = (state.functions?.missing ?? []).filter(
    (n) => !(state.secrets ?? []).includes(n),
  );
  const secretsOpen = secretsLeft.length > 0 && !state.skipped?.secrets;
  if (functionCount > 0) {
    add(
      {
        id: "functions",
        title: "Deploy your backend functions",
        ...(state.functions
          ? {
              detail: secretsOpen
                ? `${count(secretsLeft.length, "secret key")} to add`
                : count(state.functions.deployed.length, "function"),
            }
          : {}),
      },
      Boolean(state.functions && state.functions.failed.length === 0) && !secretsOpen,
      Boolean(state.functions && state.functions.failed.length > 0),
    );
  }
  // In one go, going live is how the preview gets the new backend: no separate try.
  const method = state.method ?? (state.switch?.frozenAt ? "careful" : undefined);
  const onNewBackend = state.preview === "copy" || Boolean(state.switch?.liveAt);
  if (method !== "quick") {
    add(
      {
        id: "try",
        title: "Try your app on the copy",
        detail: onNewBackend
          ? "The preview uses your new backend"
          : "The preview still uses Lovable Cloud",
      },
      onNewBackend,
    );
  }
  const netlifyConnected = Boolean(await readSecret(NETLIFY_TOKEN));
  add(
    {
      id: "netlify",
      title: "Connect your Netlify account",
      ...(netlifyConnected ? onThisComputer : {}),
    },
    netlifyConnected,
  );
  const { wanted: settingsWanted, lovable: lovableKeys } = await appSettings(ws.root);
  const settingsLeft = state.site
    ? settingsWanted.filter((n) => !(state.siteSettings ?? []).includes(n))
    : [];
  const settingsOpen = settingsLeft.length > 0 && !state.skipped?.settings;
  add(
    {
      id: "site",
      title: "Put your site on Netlify",
      ...(state.site
        ? {
            detail: settingsOpen
              ? `${count(settingsLeft.length, "setting")} to add`
              : state.site.url,
          }
        : {}),
    },
    Boolean(state.site) && !settingsOpen,
  );
  // Lovable's AI, email API and connectors stop working off Lovable: switched before going live.
  const services = await servicesStatus(ws);
  const servicesToDo = servicesLeft(
    services,
    Boolean(state.emails?.connectedAt),
    Boolean(state.switch?.noEmailsAt),
  );
  // Google sign-in: Lovable's broker only works on Lovable.
  const google = await googleStatus(ws);
  const frozenAt = state.switch?.frozenAt;
  add(
    {
      id: "emails",
      title: "Set up emails for your users",
      ...(state.emails?.connectedAt
        ? { detail: `From ${state.emails.sender}` }
        : state.switch?.noEmailsAt
          ? { detail: "Skipped for now: no password-reset emails" }
          : state.emails
            ? { detail: `${state.emails.domain}: waiting for its records` }
            : {}),
    },
    Boolean(state.emails?.connectedAt || state.switch?.noEmailsAt),
    Boolean(state.emails && !state.emails.connectedAt && !state.switch?.noEmailsAt),
  );
  if (usesLovableServices(services)) {
    const skipped = Boolean(state.services?.skippedAt) && servicesToDo.length > 0;
    add(
      {
        id: "services",
        title: "Switch off Lovable's services",
        ...(skipped
          ? {
              detail: `Skipped: ${servicesToDo.join(", ")} ${servicesToDo.length === 1 ? "stops" : "stop"} with Lovable`,
            }
          : servicesToDo.length > 0
            ? { detail: servicesToDo.join(" · ") }
            : {}),
      },
      servicesToDo.length === 0 || skipped,
    );
  }
  if (google.used) {
    add(
      {
        id: "google",
        title: "Google sign-in",
        ...(google.skipped && !google.configured
          ? { detail: "Skipped: it stays off on your new site" }
          : google.configured && !google.brokerOnly
            ? { detail: "On your new backend" }
            : {}),
      },
      (google.configured && !google.brokerOnly) || (google.skipped && !google.configured),
    );
  }
  // The quick way goes live from the first export: no pause, no last export.
  if (method !== "quick") {
    add(
      {
        id: "freeze",
        title: "Pause changes on your live app",
        ...(frozenAt ? { detail: `Since ${frozenAt.slice(11, 16)} UTC` } : {}),
      },
      Boolean(frozenAt),
    );
    const finalExport = Boolean(frozenAt && state.export && state.export.importedAt > frozenAt);
    add(
      {
        id: "final-export",
        title: "Export your data again",
        ...(finalExport && state.export ? { detail: describeExport(state.export.summary) } : {}),
      },
      finalExport,
    );
    const finalCopy = Boolean(frozenAt && state.data && state.data.at > frozenAt);
    add(
      { id: "final-copy", title: "Copy it in for good" },
      Boolean(finalCopy && state.data?.ok),
      Boolean(finalCopy && !state.data?.ok),
    );
  }
  add(
    {
      id: "golive",
      title: "Go live on your new backend and site",
      // Switched: Publish puts it live; once a Publish has, where it is.
      ...(state.switch?.liveAt
        ? {
            detail:
              state.site?.liveAt && state.site.liveAt > state.switch.liveAt
                ? `Live at ${state.site.url}`
                : "Publish puts it live",
          }
        : {}),
    },
    Boolean(state.switch?.liveAt),
  );
  const domain = state.domain;
  add(
    {
      id: "domain",
      title: "Your app's address",
      ...(domain?.readyAt && domain.name
        ? { detail: domain.name }
        : domain?.skipped && state.site
          ? { detail: new URL(state.site.url).host }
          : domain?.name
            ? { detail: `${domain.name}: waiting for its records` }
            : {}),
    },
    Boolean(domain?.readyAt || domain?.skipped),
    Boolean(domain?.name && !domain.readyAt),
  );
  add({ id: "lovable", title: "Finish in Lovable" }, Boolean(state.switch?.finishedAt));
  // Before Lovable goes: has someone signed in on the new site? (Lovable's steps wait for it.)
  const finishing = Boolean(state.switch?.liveAt && !state.switch.finishedAt);
  const signIn = finishing ? await signInSince(state, state.switch!.liveAt!) : undefined;
  return {
    steps,
    ...(usesLovableServices(services) ? { services: { ...services, left: servicesToDo } } : {}),
    ...(planLimits(state) ? { plan: planLimits(state)! } : {}),
    ...(google.used ? { google } : {}),
    ...(state.home && stripe.length > 0
      ? {
          stripeWebhooks: stripe.map((name) => ({
            name,
            url: `${projectUrl(state.home!.ref)}/functions/v1/${name}`,
          })),
        }
      : {}),
    ...(finishing
      ? { signIn: { needed: await usesSignIn(ws.root), ...(signIn ? { at: signIn } : {}) } }
      : {}),
    ...(domain?.name && !domain.readyAt
      ? { domain: { name: domain.name, records: domain.records ?? [] } }
      : {}),
    ...(state.facts ? { facts: state.facts } : {}),
    ...(settingsOpen ? { settingsLeft } : {}),
    ...(secretsOpen ? { secretsLeft } : {}),
    ...(vaultOpen ? { vaultLeft } : {}),
    ...(!state.switch?.liveAt &&
    (state.facts
      ? state.facts.scheduledJobs.length > 0
      : (state.export?.summary.scheduledJobs.length ?? 0) > 0) &&
    lovableKeys.some((k) => k.startsWith("LOVABLE_CRON"))
      ? { cronKey: true }
      : {}),
    ...(state.home
      ? {
          home: {
            ref: state.home.ref,
            name: state.home.name,
            url: projectUrl(state.home.ref),
            dashboard: `https://supabase.com/dashboard/project/${state.home.ref}`,
          },
        }
      : {}),
    preview: state.preview ?? "live",
    ...(state.checks ? { checks: state.checks.items } : {}),
    ...(state.files
      ? {
          files: {
            waiting: state.files.waiting,
            tooBig: state.files.tooBig,
            failed: state.files.failed,
          },
        }
      : {}),
    vaultKey: Boolean(state.export?.summary.vaultSecrets.includes("email_queue_service_role_key")),
    functions: functionCount,
    ...(connected ? {} : { tokenPermissions: MOVE_PERMISSIONS }),
    ...(state.site
      ? {
          site: {
            name: state.site.name,
            url: state.site.url,
            admin: state.site.admin,
            ...(state.site.liveAt ? { liveAt: state.site.liveAt } : {}),
          },
        }
      : {}),
    resend: Boolean(await readSecret(RESEND_KEY)),
    ...(method ? { method } : {}),
    ...(state.emails
      ? {
          emails: {
            domain: state.emails.domain,
            sender: state.emails.sender,
            status: state.emails.status,
            records: state.emails.records.map((r) => ({
              type: r.type,
              name: r.name,
              value: r.value,
              ...(r.priority !== undefined ? { priority: r.priority } : {}),
            })),
            connected: Boolean(state.emails.connectedAt),
          },
        }
      : {}),
    ...(state.switch
      ? {
          switch: {
            ...(state.switch.frozenAt ? { frozenAt: state.switch.frozenAt } : {}),
            ...(state.switch.liveAt ? { liveAt: state.switch.liveAt } : {}),
            ...(state.switch.finishedAt ? { finishedAt: state.switch.finishedAt } : {}),
            ...(state.switch.noEmailsAt ? { noEmails: true } : {}),
          },
        }
      : {}),
    ...(method === "quick" &&
    !state.switch?.liveAt &&
    (state.export?.summary.scheduledJobs.length ?? 0) > 0
      ? {
          lovableJobs: {
            count: state.export?.summary.scheduledJobs.length ?? 0,
            stop: STOP_LOVABLE_JOBS,
          },
        }
      : {}),
    ...(exportTime(state.export?.summary.madeAt)
      ? { lastExport: exportTime(state.export?.summary.madeAt)!.toISOString() }
      : {}),
  };
}

// ── Trying the app on the copy ───────────────────────────────────────────────

/** Point the preview at the copy, or back at the live backend. Takes effect when it restarts. */
export async function setPreview(ws: Workspace, target: "live" | "copy"): Promise<void> {
  const state = await loadMove(ws.root);
  if (target === "copy" && !state.data) {
    throw new ClodableError({
      code: "move-not-ready",
      message: "Copy your data first: the preview would show an empty app.",
    });
  }
  // Once live, the app's own settings use the new backend: there's nothing left to choose.
  if (state.switch?.liveAt) return;
  // Copies made before this setting existed get it now (it's idempotent).
  if (target === "copy" && state.home) {
    const api = await SupabaseApi.required();
    await prepareCopySignIn(api, state.home.ref).catch(() => {});
  }
  await updateMove(ws.root, (s) => {
    s.preview = target;
  });
}

/** Where Lovable's templates serve the app locally, Desktop's preview included. */
const PREVIEW_ORIGIN = "http://localhost:8080";
const PREVIEW_REDIRECTS = ["http://localhost:*/**", "http://127.0.0.1:*/**"];

/**
 * Sign-ins on the copy, while the builder tries it in the preview. Links from sign-up and reset
 * emails come back to the preview (any local port), not to Supabase's default localhost:3000.
 * New people don't wait for a confirmation email: Supabase's built-in mailer only writes to the
 * project's own team, twice an hour. The switch sets all of this to match the live app.
 */
export async function prepareCopySignIn(api: SupabaseApi, ref: string): Promise<void> {
  const current = await api.authConfig(ref);
  const allowed = new Set(
    String(current.uri_allow_list ?? "")
      .split(",")
      .map((url) => url.trim())
      .filter(Boolean),
  );
  for (const url of PREVIEW_REDIRECTS) allowed.add(url);
  await api.updateAuthConfig(ref, {
    site_url: PREVIEW_ORIGIN,
    uri_allow_list: [...allowed].join(","),
    mailer_autoconfirm: true,
  });
}

/**
 * What the dev server needs to talk to the copy instead of Lovable Cloud: its address and keys,
 * fetched fresh (the secret key only ever lives in the dev server's memory). Undefined when the
 * preview uses the live backend. Throws when the copy is wanted but its keys can't be had: better
 * no preview than one that quietly shows live data.
 */
export async function previewBackend(root: string): Promise<
  | {
      from?: string;
      ref: string;
      url: string;
      publishable: string;
      anon: string;
      serviceRole: string;
    }
  | undefined
> {
  const state = await loadMove(root);
  if (state.preview !== "copy" || !state.home) return undefined;
  const api = await SupabaseApi.required();
  const keys = await homeKeys(api, state.home.ref);
  return {
    ...(state.source ? { from: state.source.ref } : {}),
    ref: state.home.ref,
    url: projectUrl(state.home.ref),
    publishable: keys.publishable,
    anon: keys.legacy.anon ?? keys.publishable,
    serviceRole: keys.legacy.serviceRole ?? keys.secret,
  };
}

// ── 5. Files, functions, secrets ─────────────────────────────────────────────

/** The steps after the data need a copy to work on. */
async function readyCopy(ws: Workspace) {
  const state = await loadMove(ws.root);
  if (!state.home || !state.export || !state.data) {
    throw new ClodableError({
      code: "move-not-ready",
      message: "Copy your data first.",
      hint: "Files, functions and secrets go into the copy, once it exists.",
    });
  }
  return { state, home: state.home, summary: state.export.summary };
}

/**
 * Copy the uploaded files. `sourceKey`: Lovable Cloud's service key, for private folders; it's used
 * for this run only and never saved.
 */
export async function* copyUploads(
  ws: Workspace,
  options: { sourceKey?: string } = {},
): Flow<FilesOutcome> {
  const { state, home, summary } = await readyCopy(ws);
  if (!state.source) {
    throw new ClodableError({
      code: "move-not-ready",
      message: "Clodable doesn't know which Lovable Cloud backend the files are in.",
      hint: "Read your export again: it says where your files are.",
    });
  }
  const api = await SupabaseApi.required();
  const keys = await homeKeys(api, home.ref);
  // As large as the biggest file, if the plan allows; otherwise what it allows.
  const largest = Math.max(0, ...summary.buckets.map((b) => b.largest));
  let maxBytes = (await api.storageConfig(home.ref).catch(() => ({ fileSizeLimit: 0 })))
    .fileSizeLimit;
  if (largest > maxBytes) {
    const wanted = Math.min(largest, 50 * 1024 ** 3);
    await api
      .updateStorageConfig(home.ref, { fileSizeLimit: wanted })
      .then(() => {
        maxBytes = wanted;
      })
      .catch(() => {});
  }
  const dir = await moveDir(ws.root);
  const outcome = yield* copyFiles(
    {
      from: state.source.ref,
      to: home.ref,
      secretKey: keys.secret,
      ...(options.sourceKey ? { sourceKey: options.sourceKey.trim() } : {}),
      maxBytes: maxBytes || 50 * 1024 ** 2,
      sql: homeSql(api, home.ref),
    },
    dir,
    summary.buckets,
  );
  await updateMove(ws.root, (s) => {
    s.files = {
      at: now(),
      copied: outcome.copied,
      total: outcome.total,
      waiting: outcome.waiting,
      tooBig: outcome.tooBig,
      failed: outcome.failed,
    };
  });
  return outcome;
}

export async function* deployBackendFunctions(ws: Workspace): Flow<DeployOutcome> {
  const { home } = await readyCopy(ws);
  const api = await SupabaseApi.required();
  const outcome = yield* deployFunctions(api, home.ref, ws.root);
  await updateMove(ws.root, (s) => {
    s.functions = {
      at: now(),
      deployed: outcome.deployed,
      failed: outcome.failed,
      missing: outcome.missingSecrets,
    };
  });
  return outcome;
}

/** The secrets the functions need on the new backend, and which ones it has. */
export async function functionSecretStatus(
  ws: Workspace,
): Promise<{ wanted: string[]; set: string[] }> {
  const { home } = await readyCopy(ws);
  const api = await SupabaseApi.required();
  const wanted = await functionSecrets(ws.root, await localFunctions(ws.root));
  const have = new Set(await api.secretNames(home.ref));
  const set = wanted.filter((name) => have.has(name));
  await updateMove(ws.root, (s) => {
    s.secrets = [...new Set([...(s.secrets ?? []), ...set])].sort();
  });
  return { wanted, set };
}

/**
 * Going on without what's left of a step (a prototype that doesn't need it): the settings on the
 * site, the functions' secrets, or the database's encrypted secrets. The step then counts as done.
 */
export async function skipLeftovers(
  ws: Workspace,
  what: "settings" | "secrets" | "vault",
): Promise<{ skipped: typeof what }> {
  await updateMove(ws.root, (s) => {
    s.skipped = { ...s.skipped, [what]: now() };
  });
  return { skipped: what };
}

/** Vault secrets Clodable fills in itself (the email queue's key is the new project's own). */
const AUTO_VAULT = new Set(["email_queue_service_role_key"]);

/**
 * The database's own secrets (Supabase Vault). They're encrypted with the old project's key, so
 * their values never come with the export: the builder reads them in Lovable and pastes each.
 */
export async function vaultStatus(
  ws: Workspace,
): Promise<{ wanted: string[]; set: string[]; query?: string }> {
  const state = await loadMove(ws.root);
  const wanted = (state.export?.summary.vaultSecrets ?? [])
    .filter((n) => !AUTO_VAULT.has(n))
    .sort();
  if (wanted.length === 0 || !state.home) return { wanted, set: [] };
  const api = await SupabaseApi.required();
  const names = wanted.map(literal).join(", ");
  const rows = await homeSql(api, state.home.ref).rows<{ name: string }>(
    `select name from vault.secrets where name in (${names})`,
  );
  const set = rows.map((r) => r.name).sort();
  await updateMove(ws.root, (s) => {
    s.vault = set;
  });
  return {
    wanted,
    set,
    query: `select name, decrypted_secret from vault.decrypted_secrets where name in (${names});`,
  };
}

/** One of them, its value on stdin: straight into the new backend's vault. */
export async function setVaultValue(
  ws: Workspace,
  name: string | undefined,
  value: string,
): Promise<{ wanted: string[]; set: string[] }> {
  const state = await loadMove(ws.root);
  const wanted = (state.export?.summary.vaultSecrets ?? []).filter((n) => !AUTO_VAULT.has(n));
  if (!name || !wanted.includes(name)) {
    throw new ClodableError({
      code: "invalid-config",
      message: name ? `Your database has no secret called “${name}”.` : "Which secret?",
      ...(wanted.length > 0 ? { hint: `It has: ${wanted.join(", ")}.` } : {}),
    });
  }
  if (!value.trim() || !state.home) {
    throw new ClodableError({ code: "invalid-config", message: "That secret is empty." });
  }
  const api = await SupabaseApi.required();
  await setVaultSecret(homeSql(api, state.home.ref), name, value.replace(/\r?\n$/, ""));
  const status = await vaultStatus(ws);
  return { wanted: status.wanted, set: status.set };
}

/** Set one secret on the new backend. The value goes straight to Supabase, never to a file. */
export async function setFunctionSecret(
  ws: Workspace,
  name: string,
  value: string,
): Promise<{ wanted: string[]; set: string[] }> {
  if (!/^[A-Z][A-Z0-9_]*$/.test(name) || name.startsWith("SUPABASE_")) {
    throw new ClodableError({
      code: "invalid-config",
      message: `“${name}” isn't a secret name Supabase accepts.`,
      hint: "Use capitals, digits and underscores, not starting with SUPABASE_.",
    });
  }
  if (!value.trim()) {
    throw new ClodableError({ code: "invalid-config", message: "That secret is empty." });
  }
  const { home } = await readyCopy(ws);
  const api = await SupabaseApi.required();
  await api.setSecrets(home.ref, [{ name, value: value.replace(/\r?\n$/, "") }]);
  await updateMove(ws.root, (s) => {
    s.secrets = [...new Set([...(s.secrets ?? []), name])].sort();
  });
  return functionSecretStatus(ws);
}
