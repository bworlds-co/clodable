import type { Sql } from "./postgres.js";
import { MANAGED_SCHEMAS } from "./toc.js";

/**
 * What a copied database needs before it works on its own, learnt the hard way on real moves:
 * counters behind their rows, functions still calling the old backend, Lovable's export bucket,
 * queues to recreate, the history of database changes. Each fix says what it did, in counts.
 */

export const literal = (value: string) => `'${value.replace(/'/g, "''")}'`;

const managedList = [...MANAGED_SCHEMAS].map(literal).join(", ");
const APP_SCHEMA = `n.nspname not in (${managedList}) and n.nspname not like 'pg\\_%' and n.nspname <> 'information_schema'`;

/** Lovable's own export folder came along with the bucket rows: drop it. */
export async function removeExportBucket(sql: Sql): Promise<number> {
  const rows = await sql.rows<{ n: number }>(
    "select count(*)::int as n from storage.buckets where id like 'database\\_export%'",
  );
  const n = Number(rows[0]?.n ?? 0);
  if (n > 0) {
    await sql.run(
      "begin; set local storage.allow_delete_query = 'true'; delete from storage.objects where bucket_id like 'database\\_export%'; delete from storage.buckets where id like 'database\\_export%'; commit;",
    );
  }
  return n;
}

/**
 * Counters (sequences) behind the highest id in their table, in every schema. Loading rows doesn't
 * move them, and the next insert then collides: sign-ins failing for half an hour after a move,
 * or every scheduled job silently stopping, both came from this.
 */
export const SEQUENCES_BEHIND = `
with sc as (
  select s.oid::regclass as seq, d.refobjid::regclass as tbl, a.attname as col
  from pg_depend d
  join pg_class s on s.oid = d.objid and s.relkind = 'S'
  join pg_attribute a on a.attrelid = d.refobjid and a.attnum = d.refobjsubid
  where d.deptype in ('a', 'i')
  union
  select substring(pg_get_expr(ad.adbin, ad.adrelid) from $r$nextval\\('([^']+)'$r$)::regclass,
         ad.adrelid::regclass, a.attname
  from pg_attrdef ad
  join pg_attribute a on a.attrelid = ad.adrelid and a.attnum = ad.adnum
  where pg_get_expr(ad.adbin, ad.adrelid) like 'nextval(%'
)
select sc.seq::text as seq, m.max_val::text as max_val
from sc
join pg_sequences ps on format('%I.%I', ps.schemaname, ps.sequencename)::regclass = sc.seq
cross join lateral (
  select (xpath('/row/m/text()', query_to_xml(format('select max(%I) as m from %s', sc.col, sc.tbl), false, true, '')))[1]::text::numeric as max_val
) m
where ps.schemaname not in ('pg_catalog', 'information_schema')
  and m.max_val > coalesce(ps.last_value, 0)`;

export async function alignSequences(sql: Sql): Promise<{ fixed: number; failed: string[] }> {
  const behind = await sql.rows<{ seq: string; max_val: string }>(SEQUENCES_BEHIND);
  let fixed = 0;
  const failed: string[] = [];
  for (const row of behind) {
    try {
      await sql.run(`select setval(${literal(row.seq)}::regclass, ${BigInt(row.max_val)});`);
      fixed++;
    } catch {
      failed.push(row.seq);
    }
  }
  return { fixed, failed };
}

/** The keys a copied function body may carry, by role, so it calls the new backend instead. */
export interface NewKeys {
  /** For "anon" tokens: the legacy anon JWT if the project has one, else the publishable key. */
  anon?: string;
  /** For "service_role" tokens: the legacy service_role JWT (a secret key isn't a JWT). */
  serviceRole?: string;
}

function jwtPayload(token: string): { ref?: string; role?: string } | undefined {
  try {
    const part = token.split(".")[1];
    if (!part) return undefined;
    return JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as {
      ref?: string;
      role?: string;
    };
  } catch {
    return undefined;
  }
}

/**
 * Point text at the new backend: its address, and any key of the old project swapped for the new
 * project's key of the same role. Returns the text and whether an old key had no new counterpart.
 */
export function repoint(
  text: string,
  from: string,
  to: string,
  keys: NewKeys,
): { text: string; leftover: boolean } {
  let leftover = false;
  const swapped = text.replace(/eyJ[\w-]+\.eyJ[\w-]+\.[\w-]+/g, (token) => {
    const payload = jwtPayload(token);
    if (payload?.ref !== from) return token;
    const next = payload.role === "service_role" ? keys.serviceRole : keys.anon;
    if (!next) {
      leftover = true;
      return token;
    }
    return next;
  });
  return { text: swapped.split(from).join(to), leftover };
}

/**
 * Functions of the app that still name the old backend (Lovable's email queue does, and swallows
 * the failure, so emails stop without a sound): rewritten to the new one.
 */
export async function repointFunctions(
  sql: Sql,
  from: string,
  to: string,
  keys: NewKeys,
): Promise<{ fixed: number; leftover: string[] }> {
  const rows = await sql.rows<{ fn: string; def: string }>(`
    select p.oid::regprocedure::text as fn, pg_get_functiondef(p.oid) as def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where ${APP_SCHEMA}
      and p.prokind in ('f', 'p')
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
      and (p.prosrc like ${literal(`%${from}%`)} or p.prosrc like '%eyJ%')`);
  let fixed = 0;
  const leftover: string[] = [];
  for (const row of rows) {
    const next = repoint(row.def, from, to, keys);
    if (next.leftover) leftover.push(row.fn);
    if (next.text === row.def) continue;
    await sql.run(`${next.text.trimEnd().replace(/;$/, "")};`);
    fixed++;
  }
  return { fixed, leftover };
}

/**
 * Database webhooks, and any trigger whose arguments name the old backend (its functions' address,
 * its keys): recreated pointing at the new one.
 */
export async function repointTriggers(
  sql: Sql,
  from: string,
  to: string,
  keys: NewKeys,
): Promise<{ fixed: number; leftover: string[] }> {
  const rows = await sql.rows<{ name: string; tbl: string; def: string }>(`
    select t.tgname as name, t.tgrelid::regclass::text as tbl, pg_get_triggerdef(t.oid) as def
    from pg_trigger t
    where not t.tgisinternal
      and (pg_get_triggerdef(t.oid) like ${literal(`%${from}%`)} or pg_get_triggerdef(t.oid) like '%eyJ%')`);
  let fixed = 0;
  const leftover: string[] = [];
  for (const row of rows) {
    const next = repoint(row.def, from, to, keys);
    if (next.leftover) leftover.push(row.name);
    if (next.text === row.def) continue;
    await sql.run(
      `begin;\ndrop trigger "${row.name.replace(/"/g, '""')}" on ${row.tbl};\n${next.text};\ncommit;`,
    );
    fixed++;
  }
  return { fixed, leftover };
}

/** Triggers (database webhooks) that still name the old backend. */
export async function triggersNaming(sql: Sql, ref: string): Promise<string[]> {
  const rows = await sql.rows<{ name: string }>(`
    select t.tgname as name from pg_trigger t
    where not t.tgisinternal and pg_get_triggerdef(t.oid) like ${literal(`%${ref}%`)}`);
  return rows.map((r) => r.name);
}

/** Functions that still name the old backend: the checks want none. */
export async function functionsNaming(sql: Sql, ref: string): Promise<string[]> {
  const rows = await sql.rows<{ fn: string }>(`
    select p.oid::regprocedure::text as fn
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where ${APP_SCHEMA}
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
      and p.prosrc like ${literal(`%${ref}%`)}`);
  return rows.map((r) => r.fn);
}

/** Queues (pgmq) live inside Supabase's part, so they're recreated empty rather than copied. */
export async function createQueues(sql: Sql, names: string[]): Promise<number> {
  if (names.length === 0) return 0;
  const existing = new Set(
    (
      await sql
        .rows<{ queue_name: string }>("select queue_name from pgmq.list_queues()")
        .catch(() => [] as Array<{ queue_name: string }>)
    ).map((r) => r.queue_name),
  );
  let created = 0;
  for (const name of names) {
    if (existing.has(name)) continue;
    await sql.run(`select pgmq.create(${literal(name)});`);
    created++;
  }
  return created;
}

/**
 * The record of which database changes ran, under the names in the app's code. Lovable records
 * them under slightly different versions, so without this Supabase would run them all again.
 */
export async function repairMigrationHistory(sql: Sql, versions: string[]): Promise<number> {
  if (versions.length === 0) return 0;
  const table = await sql.rows<{ ok: boolean }>(
    "select to_regclass('supabase_migrations.schema_migrations') is not null as ok",
  );
  if (!table[0]?.ok) {
    await sql.run(
      "create schema if not exists supabase_migrations; create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text);",
    );
  }
  const before = await sql.rows<{ n: number }>(
    "select count(*)::int as n from supabase_migrations.schema_migrations",
  );
  await sql.run(
    `insert into supabase_migrations.schema_migrations (version, name) select v, 'clodable_history' from unnest(array[${versions.map(literal).join(", ")}]::text[]) as v on conflict (version) do nothing;`,
  );
  const after = await sql.rows<{ n: number }>(
    "select count(*)::int as n from supabase_migrations.schema_migrations",
  );
  return Number(after[0]?.n ?? 0) - Number(before[0]?.n ?? 0);
}

/** A secret the app keeps in the database's vault, set by name (its value never logged). */
export async function setVaultSecret(sql: Sql, name: string, value: string): Promise<void> {
  await sql.run(`
    do $$ begin
      if exists (select 1 from vault.secrets where name = ${literal(name)}) then
        perform vault.update_secret(id, ${literal(value)}) from vault.secrets where name = ${literal(name)};
      else
        perform vault.create_secret(${literal(value)}, ${literal(name)});
      end if;
    end $$;`);
}
