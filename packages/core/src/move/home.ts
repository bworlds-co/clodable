import { randomInt } from "node:crypto";
import { ClodableError } from "../errors.js";
import { type Flow, step } from "../events.js";
import { readSecret, storeSecret } from "../local-secrets.js";
import type { Workspace } from "../workspace.js";
import { organizationChoices } from "./account.js";
import type { NewKeys } from "./fixes.js";
import { managementSql, type PgTarget, psqlSql, type Sql } from "./postgres.js";
import { loadMove, type MoveState, updateMove } from "./state.js";
import { SupabaseApi } from "./supabase-api.js";

/**
 * The new backend: the builder's own Supabase project, made by Clodable. Its keys, and how Clodable
 * reaches its database (Supabase's API for SQL, its pooler for Postgres's tools).
 */

export const passwordKey = (ref: string) => `db-password:${ref}`;

export function newPassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  return Array.from({ length: 32 }, () => alphabet[randomInt(alphabet.length)]).join("");
}

/** Create the builder's own Supabase project, wait until it's up, and remember it. */
export async function* createHome(
  ws: Workspace,
  options: { org?: string; region?: string; name?: string },
): Flow<NonNullable<MoveState["home"]>> {
  const state = await loadMove(ws.root);
  const api = await SupabaseApi.required();
  if (state.home) {
    yield step("move:create", "running", "Checking your new backend");
    const project = await api.project(state.home.ref);
    if (project.status === "INACTIVE" || project.status === "GOING_DOWN") {
      throw new ClodableError({
        code: "move-not-ready",
        message: "Your new backend is paused.",
        hint: "Restore it on its page in Supabase, then try this step again. Your live app hasn't changed.",
      });
    }
    await waitUntilUp(api, state.home.ref);
    yield step("move:create", "done", "Your new backend is ready", state.home.name);
    return state.home;
  }
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
    createdAt: new Date().toISOString(),
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
  await waitUntilUp(api, created.ref);
  yield step("move:create", "done", "Your new backend is ready", home.name);
  return home;
}

/** Wait until a new project is up: its database, sign-in, API and files all answer. */
export async function waitUntilUp(api: SupabaseApi, ref: string): Promise<void> {
  const started = Date.now();
  while (true) {
    const project = await api.project(ref);
    if (project?.status === "INIT_FAILED") {
      throw new ClodableError({
        code: "supabase-failed",
        message: "Supabase couldn't start your new backend.",
        hint: "Delete it in Supabase, then create it again from Clodable.",
      });
    }
    if (project?.status === "ACTIVE_HEALTHY") {
      const health = await api.health(ref, ["db", "auth", "rest", "storage"]).catch(() => []);
      if (health.length > 0 && health.every((s) => s.healthy)) return;
    }
    if (Date.now() - started > 15 * 60_000)
      throw new ClodableError({
        code: "supabase-failed",
        message: "Your new backend is taking unusually long to start.",
        hint: "Check it in Supabase, then try this step again: Clodable picks up where it was.",
      });
    await new Promise((done) => setTimeout(done, 5000));
  }
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
export async function homeConnection(
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
export function localTarget(): PgTarget | undefined {
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
