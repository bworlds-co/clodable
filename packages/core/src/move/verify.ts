import type { ExportSummary } from "./export.js";
import { functionsNaming, literal, SEQUENCES_BEHIND, tableName, triggersNaming } from "./fixes.js";
import type { Sql } from "./postgres.js";
import type { MoveCheck } from "./state.js";
import { isManaged } from "./toc.js";
import { count } from "./words.js";

/**
 * Is everything there? The copy is compared with the export, never with itself: rows per table,
 * people and their passwords, the rules and triggers per schema (the incidents of past moves all
 * showed up there first), counters, and nothing still pointing at the old backend.
 */

export interface VerifyOptions {
  /** The Lovable Cloud project, which nothing in the copy should still call. */
  sourceRef?: string;
  /** Count uploaded files per bucket too (once they're copied). */
  files?: boolean;
  /**
   * Right after a copy, rows must match exactly (a doubled row is a bug). Later, the builder may
   * have tried the app on the copy, so at least as many is enough.
   */
  exact?: boolean;
}

export async function verifyCopy(
  sql: Sql,
  summary: ExportSummary,
  options: VerifyOptions = {},
): Promise<MoveCheck[]> {
  const exact = options.exact !== false;
  const checks = [
    await tablesCheck(sql, summary, exact),
    await peopleCheck(sql, summary, exact),
    ...(await structureChecks(sql, summary)),
    await accessCheck(sql, summary),
    await countersCheck(sql),
    options.sourceRef ? await oldBackendCheck(sql, options.sourceRef) : undefined,
    await extensionsCheck(sql, summary),
    await filesCheck(sql, summary, Boolean(options.files)),
  ];
  return checks.filter((check) => check !== undefined);
}

/** Every table, every row: exactly as many right after a copy, at least as many later. */
async function tablesCheck(
  sql: Sql,
  summary: ExportSummary,
  exact: boolean,
): Promise<MoveCheck | undefined> {
  const tables = Object.keys(summary.rows);
  if (tables.length === 0) return undefined;
  const counts = await sql.rows<{ t: string; n: string | null }>(
    tables
      .map(
        (t) =>
          `select ${literal(t)} as t, case when to_regclass(${literal(tableName(t))}) is null then null else (xpath('/row/n/text()', query_to_xml(${literal(`select count(*) as n from ${tableName(t)}`)}, false, true, '')))[1]::text end as n`,
      )
      .join(" union all "),
  );
  const missing = counts.filter((r) => r.n === null).map((r) => r.t);
  const short = counts.filter((r) => {
    if (r.n === null) return false;
    const want = Number(summary.rows[r.t] ?? 0);
    return exact ? Number(r.n) !== want : Number(r.n) < want;
  });
  const rows = Object.values(summary.rows).reduce((a, b) => a + b, 0);
  const wrong = missing.length + short.length;
  return {
    id: "tables",
    ok: wrong === 0,
    label:
      wrong === 0
        ? `All ${count(tables.length, "table")} and their ${count(rows, "row")} are there`
        : `${count(wrong, "table")} didn't copy fully`,
    ...(wrong > 0
      ? {
          detail: [
            ...missing.map((t) => `${t}: missing`),
            ...short.map((r) => `${r.t}: ${r.n} of ${summary.rows[r.t]} rows`),
          ]
            .slice(0, 8)
            .join("; "),
        }
      : {}),
  };
}

/** People, and whether they can still sign in with the password they know. */
async function peopleCheck(
  sql: Sql,
  summary: ExportSummary,
  exact: boolean,
): Promise<MoveCheck | undefined> {
  if (summary.people.total === 0) return undefined;
  const [people] = await sql.rows<{ total: number; with_password: number }>(
    "select count(*)::int as total, count(*) filter (where encrypted_password ~ '^\\$(2[aby]|argon2)')::int as with_password from auth.users",
  );
  const total = Number(people?.total ?? 0);
  const withPassword = Number(people?.with_password ?? 0);
  const ok = exact
    ? total === summary.people.total && withPassword === summary.people.withPassword
    : total >= summary.people.total && withPassword >= summary.people.withPassword;
  return {
    id: "people",
    ok,
    label: ok
      ? `${count(total, "person", "people")} can sign in as before`
      : `${count(total, "person", "people")} of ${summary.people.total.toLocaleString("en-US")} came over`,
    ...(summary.people.withoutPassword > 0
      ? {
          detail: `${count(summary.people.withoutPassword, "person", "people")} sign in without a password (Google and the like, or invited).`,
        }
      : {}),
  };
}

/**
 * Rules and triggers, per schema: what went missing in past moves without anyone noticing. Two
 * checks: the access rules, then the links between tables and the automatic actions.
 */
async function structureChecks(sql: Sql, summary: ExportSummary): Promise<MoveCheck[]> {
  const [counts] = await sql.rows<{
    policies: Record<string, number> | null;
    triggers: Record<string, number> | null;
    keys: Record<string, number> | null;
    rls: Record<string, number> | null;
  }>(`select
    (select json_object_agg(schemaname, n) from (select schemaname, count(*)::int as n from pg_policies group by 1) p) as policies,
    (select json_object_agg(s, n) from (select n.nspname as s, count(*)::int as n from pg_trigger g join pg_class c on c.oid = g.tgrelid join pg_namespace n on n.oid = c.relnamespace where not g.tgisinternal group by 1) t) as triggers,
    (select json_object_agg(s, n) from (select connamespace::regnamespace::text as s, count(*)::int as n from pg_constraint where contype = 'f' group by 1) k) as keys,
    (select json_object_agg(s, n) from (select n.nspname as s, count(*)::int as n from pg_class c join pg_namespace n on n.oid = c.relnamespace where c.relrowsecurity group by 1) r) as rls`);
  const missingRules = [
    ...fewer(summary.policies, counts?.policies ?? null, true).map((s) => `access rules in ${s}`),
    ...fewer(summary.rowSecurity, counts?.rls ?? null).map((s) => `protected tables in ${s}`),
  ];
  const appTriggers = Object.fromEntries(
    Object.entries(summary.triggers).filter(([schema]) => !isManaged(schema)),
  );
  const missingLinks = [
    ...fewer(appTriggers, counts?.triggers ?? null).map((s) => `triggers in ${s}`),
    ...fewer(summary.foreignKeys, counts?.keys ?? null).map((s) => `links between tables in ${s}`),
  ];
  if (summary.appTriggers.length > 0) {
    const [auth] = await sql.rows<{ n: number }>(
      "select count(*)::int as n from pg_trigger g join pg_class c on c.oid = g.tgrelid join pg_namespace n on n.oid = c.relnamespace join pg_proc p on p.oid = g.tgfoid join pg_namespace pn on pn.oid = p.pronamespace where not g.tgisinternal and n.nspname in ('auth', 'storage') and pn.nspname not in ('auth', 'storage')",
    );
    if (Number(auth?.n ?? 0) < summary.appTriggers.length) {
      missingLinks.push(
        `the app's triggers on sign-ins and files: ${auth?.n ?? 0} of ${summary.appTriggers.length}`,
      );
    }
  }
  return [
    {
      id: "rules",
      ok: missingRules.length === 0,
      label:
        missingRules.length === 0
          ? "Every access rule is in place"
          : "Some access rules are missing",
      ...(missingRules.length > 0 ? { detail: missingRules.join("; ") } : {}),
    },
    {
      id: "links",
      ok: missingLinks.length === 0,
      label:
        missingLinks.length === 0
          ? "Links between tables and automatic actions are in place"
          : "Some links or automatic actions are missing",
      ...(missingLinks.length > 0 ? { detail: missingLinks.join("; ") } : {}),
    },
  ];
}

/**
 * Schemas with fewer of something than the export had: "public: 2 of 5". Supabase's own schemas
 * count only with `all`.
 */
function fewer(
  want: Record<string, number>,
  have: Record<string, number> | null,
  all = false,
): string[] {
  return Object.entries(want)
    .filter(([schema]) => all || !isManaged(schema))
    .filter(([schema, n]) => (have?.[schema] ?? 0) < n)
    .map(([schema, n]) => `${schema}: ${have?.[schema] ?? 0} of ${n}`);
}

/** What the app's API may do on each table, as before: without it, every page shows nothing. */
async function accessCheck(sql: Sql, summary: ExportSummary): Promise<MoveCheck | undefined> {
  const wanted = Object.entries(summary.grants ?? {});
  if (wanted.length === 0) return undefined;
  const rows = await sql.rows<{ t: string; role: string; privilege: string }>(
    "select table_schema || '.' || table_name as t, grantee as role, privilege_type as privilege from information_schema.role_table_grants where grantee in ('anon', 'authenticated', 'service_role')",
  );
  const have = new Set(rows.map((r) => `${r.t} ${r.role} ${r.privilege}`));
  const missing: string[] = [];
  for (const [table, roles] of wanted) {
    for (const [role, privileges] of Object.entries(roles)) {
      const lacking = privileges
        .filter((p) => API_PRIVILEGES.has(p))
        .filter((p) => !have.has(`${table} ${role} ${p}`));
      if (lacking.length > 0)
        missing.push(`${table} for ${role}: ${lacking.join(", ").toLowerCase()}`);
    }
  }
  return {
    id: "access",
    ok: missing.length === 0,
    label:
      missing.length === 0
        ? "Your app can reach its tables as before"
        : "Your app can't reach some of its tables",
    ...(missing.length > 0 ? { detail: missing.slice(0, 6).join("; ") } : {}),
  };
}

/** Counters ahead of their rows, so the next sign-in or insert doesn't collide. */
async function countersCheck(sql: Sql): Promise<MoveCheck> {
  const behind = await sql.rows<{ seq: string }>(SEQUENCES_BEHIND);
  return {
    id: "counters",
    ok: behind.length === 0,
    label: behind.length === 0 ? "New rows will save cleanly" : "Some counters are behind",
    ...(behind.length > 0 ? { detail: behind.map((r) => r.seq).join(", ") } : {}),
  };
}

/** Nothing still calling the old backend. */
async function oldBackendCheck(sql: Sql, sourceRef: string): Promise<MoveCheck> {
  const naming = [
    ...(await functionsNaming(sql, sourceRef)),
    ...(await triggersNaming(sql, sourceRef)),
  ];
  return {
    id: "old-backend",
    ok: naming.length === 0,
    label:
      naming.length === 0
        ? "Nothing calls Lovable Cloud anymore"
        : `${count(naming.length, "database function or webhook")} still call Lovable Cloud`,
    ...(naming.length > 0 ? { detail: naming.join(", ") } : {}),
  };
}

/** Extensions the app had turned on. */
async function extensionsCheck(sql: Sql, summary: ExportSummary): Promise<MoveCheck | undefined> {
  if (summary.extensions.length === 0) return undefined;
  const have = new Set(
    (await sql.rows<{ extname: string }>("select extname from pg_extension")).map((r) => r.extname),
  );
  const missing = summary.extensions.filter((e) => !have.has(e));
  return {
    id: "extensions",
    ok: missing.length === 0,
    label: missing.length === 0 ? "Database extensions are on" : "Some database extensions are off",
    ...(missing.length > 0 ? { detail: missing.join(", ") } : {}),
  };
}

/** The file folders, with the right access; and their files, once they're copied. */
async function filesCheck(
  sql: Sql,
  summary: ExportSummary,
  files: boolean,
): Promise<MoveCheck | undefined> {
  if (summary.buckets.length === 0) return undefined;
  const rows = await sql.rows<{ id: string; public: boolean; files: number }>(
    "select b.id, b.public, (select count(*)::int from storage.objects o where o.bucket_id = b.id) as files from storage.buckets b",
  );
  const have = new Map(rows.map((r) => [r.id, r]));
  const problems: string[] = [];
  for (const bucket of summary.buckets) {
    const found = have.get(bucket.id);
    if (!found) problems.push(`${bucket.id}: missing`);
    else if (Boolean(found.public) !== bucket.public) problems.push(`${bucket.id}: wrong access`);
    else if (files && Number(found.files) < bucket.files) {
      problems.push(`${bucket.id}: ${found.files} of ${bucket.files} files`);
    }
  }
  const total = summary.buckets.reduce((a, b) => a + b.files, 0);
  return {
    id: "files",
    ok: problems.length === 0,
    label:
      problems.length > 0
        ? files
          ? "Some files are missing"
          : "Some file folders are missing"
        : files
          ? `All ${count(total, "file")} are there`
          : `${count(summary.buckets.length, "file folder")} ready for your files`,
    ...(problems.length > 0 ? { detail: problems.join("; ") } : {}),
  };
}

/** What the app's API does with a table; the others (TRUNCATE, MAINTAIN…) never reach a page. */
const API_PRIVILEGES = new Set(["SELECT", "INSERT", "UPDATE", "DELETE"]);
