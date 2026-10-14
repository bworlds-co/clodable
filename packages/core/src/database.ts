import { readFile } from "node:fs/promises";
import { basename, relative, resolve } from "node:path";
import { ClodableError } from "./errors.js";
import { literal } from "./move/fixes.js";
import { homeSql } from "./move/home.js";
import { SupabaseApi } from "./move/supabase-api.js";
import type { Workspace } from "./workspace.js";

/**
 * The app's own Supabase database, for Claude, as on Lovable: read it, change its data, and apply
 * migrations from `supabase/migrations/`. Through the Supabase connection the builder gave Clodable
 * (the Management API, as the dashboard's SQL editor), so it works in any conversation, with no
 * other sign-in. Changes are the builder's to confirm: the plugin asks before each one.
 */

const MAX_ROWS = 200;

async function database(ws: Workspace) {
  if (ws.config.backend === "lovable-cloud") {
    throw new ClodableError({
      code: "invalid-config",
      message: "Lovable owns this database: it can't be changed from here.",
      hint: "Moving off Lovable gives your app a database of its own.",
    });
  }
  const ref = ws.config.supabase.projectRef;
  if (ws.config.backend !== "supabase" || !ref) {
    throw new ClodableError({
      code: "invalid-config",
      message: "This app has no Supabase database Clodable knows of.",
      hint: "Its Supabase project goes in .clodable/config.json, under supabase.projectRef.",
    });
  }
  const api = await SupabaseApi.onThisComputer();
  if (!api) {
    throw new ClodableError({
      code: "supabase-auth",
      message: "Supabase isn't connected on this computer.",
      hint: "Connect your Supabase account in the Clodable panel: changes to your database go through it.",
    });
  }
  return { api, ref, sql: homeSql(api, ref) };
}

function statement(sql: string | undefined): string {
  const text = (sql ?? "").trim().replace(/;\s*$/, "");
  if (!text) {
    throw new ClodableError({ code: "invalid-config", message: "Which query?" });
  }
  return text;
}

/**
 * Supabase's own security advice on the database: tables anyone can read or change without access
 * rules, functions open to everyone. Run after every change to the tables.
 */
export async function checkDatabase(ws: Workspace): Promise<{
  ok: boolean;
  findings: Array<{ level: string; title: string; detail?: string; fix?: string }>;
}> {
  const { api, ref } = await database(ws);
  const lints = await api.advisors(ref, "security");
  const findings = lints
    .filter((l) => l.level === "ERROR" || l.level === "WARN")
    .map((l) => ({
      level: l.level === "ERROR" ? "error" : "warning",
      title: l.title,
      ...(l.detail ? { detail: l.detail } : {}),
      ...(l.remediation ? { fix: l.remediation } : {}),
    }));
  return { ok: !findings.some((f) => f.level === "error"), findings };
}

/** A question to the database. Inside a subquery, nothing that writes is accepted. */
export async function queryDatabase(
  ws: Workspace,
  sql: string | undefined,
): Promise<{ rows: Record<string, unknown>[]; truncated: boolean }> {
  const text = statement(sql);
  if (!/^(select|with|values|table)\b/i.test(text)) {
    throw new ClodableError({
      code: "invalid-config",
      message: "Only a query that reads goes here.",
      hint: "To change data: clodable db run. To change the tables: a migration, with clodable db apply.",
    });
  }
  const { sql: db } = await database(ws);
  const rows = await db.rows(`select * from (${text}) clodable_query limit ${MAX_ROWS + 1}`);
  return { rows: rows.slice(0, MAX_ROWS), truncated: rows.length > MAX_ROWS };
}

const SCHEMA_CHANGE = /^\s*(create|alter|drop|grant|revoke|comment|truncate)\b/im;

/** A change to the data (insert, update, delete). Changes to the tables are migrations. */
export async function runOnDatabase(
  ws: Workspace,
  sql: string | undefined,
): Promise<{ done: true }> {
  const text = statement(sql);
  if (SCHEMA_CHANGE.test(text)) {
    throw new ClodableError({
      code: "invalid-config",
      message: "That changes the tables: it goes in a migration.",
      hint: "Write it to supabase/migrations/<timestamp>_<what>.sql, then clodable db apply that file.",
    });
  }
  const { sql: db } = await database(ws);
  await db.run(`${text};`);
  return { done: true };
}

/**
 * A migration from `supabase/migrations/`, applied once and recorded in Supabase's own migration
 * history (as `supabase db push` does), in one transaction. The API then sees new tables at once.
 */
export async function applyMigration(
  ws: Workspace,
  file: string | undefined,
): Promise<{ version: string; name: string; applied: boolean }> {
  const path = resolve(ws.root, file ?? "");
  const where = relative(resolve(ws.root, "supabase", "migrations"), path);
  const match = basename(path).match(/^(\d{8,})_(.+)\.sql$/);
  if (!file || where.startsWith("..") || where.includes("/") || !match) {
    throw new ClodableError({
      code: "invalid-config",
      message: "Which migration?",
      hint: "A file in supabase/migrations/, named <timestamp>_<what>.sql.",
    });
  }
  const version = match[1]!;
  const name = match[2]!;
  const text = await readFile(path, "utf8").catch(() => {
    throw new ClodableError({ code: "not-found", message: `There's no ${file}.` });
  });
  const { sql: db } = await database(ws);
  const [history] = await db.rows<{ present: boolean }>(
    "select to_regclass('supabase_migrations.schema_migrations') is not null as present",
  );
  if (history?.present) {
    const done = await db.rows(
      `select 1 from supabase_migrations.schema_migrations where version = ${literal(version)}`,
    );
    if (done.length > 0) return { version, name, applied: false };
  }
  await db.run(
    [
      "begin;",
      text.trim().replace(/;?\s*$/, ";"),
      "create schema if not exists supabase_migrations;",
      "create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text);",
      `insert into supabase_migrations.schema_migrations (version, statements, name) values (${literal(version)}, array[${literal(text)}], ${literal(name)});`,
      "notify pgrst, 'reload schema';",
      "commit;",
    ].join("\n"),
  );
  return { version, name, applied: true };
}
