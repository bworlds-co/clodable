import { join } from "node:path";
import { messageOf } from "../errors.js";
import { type Flow, step } from "../events.js";
import { BACKUP, type ExportSummary } from "./export.js";
import {
  alignSequences,
  createQueues,
  ident,
  type NewKeys,
  removeExportBucket,
  repairMigrationHistory,
  repointFunctions,
  repointTriggers,
  setVaultSecret,
} from "./fixes.js";
import { isExpected, type PgTarget, restorePass, type Sql } from "./postgres.js";
import { MANAGED_SCHEMAS, planRestore, type Toc } from "./toc.js";

/**
 * Copy Lovable's export into a fresh Supabase project, in four passes, then fix what a copy needs.
 *
 * 1. Extensions the app turned on, and its queues.
 * 2. People and buckets, as rows in Supabase's own tables.
 * 3. The app's own schemas, in the export's order (tables, rows, functions, keys, rules), with
 *    their grants: Supabase doesn't give new tables to its API roles on its own.
 * 4. The app's triggers and access rules on Supabase's tables, last, so the new-user trigger
 *    doesn't fire for people who already exist.
 *
 * Scheduled jobs are not recreated on a copy: they would run twice, next to the live app.
 */

export interface CopyTarget {
  pg: PgTarget;
  sql: Sql;
  /** The new project, and its keys for functions that carried the old ones. */
  ref: string;
  keys: NewKeys;
}

export interface CopyOutcome {
  /** Errors that aren't "Supabase already has this", terse. */
  problems: string[];
  /** What the fixes did, in the builder's words. */
  fixes: string[];
}

const managed = [...MANAGED_SCHEMAS].map((s) => `'${s}'`).join(", ");

/**
 * Empty a copy before copying a newer export into it: the app's own objects and the people go;
 * Supabase's parts, the buckets and their files stay. `public` itself stays, with the privileges
 * Supabase gave it. Only ever run on a copy, never on a backend people use.
 */
export async function emptyCopy(sql: Sql): Promise<void> {
  await sql.run(`
do $$
declare r record;
begin
  for r in
    select format('drop %s if exists %I.%I cascade',
             case c.relkind when 'v' then 'view' when 'm' then 'materialized view'
                            when 'f' then 'foreign table' when 'S' then 'sequence' else 'table' end,
             n.nspname, c.relname) as q
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'f', 'S')
      and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'e')
    order by case c.relkind when 'v' then 0 when 'm' then 1 else 2 end
  loop execute r.q; end loop;
  for r in
    select format('drop %s if exists %s cascade',
             case p.prokind when 'p' then 'procedure' when 'a' then 'aggregate' else 'function' end,
             p.oid::regprocedure) as q
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  loop execute r.q; end loop;
  for r in
    select format('drop type if exists %I.%I cascade', n.nspname, t.typname) as q
    from pg_type t join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typtype in ('e', 'c', 'd', 'r')
      and (t.typrelid = 0 or (select relkind from pg_class where oid = t.typrelid) = 'c')
      and not exists (select 1 from pg_depend d where d.objid = t.oid and d.deptype = 'e')
  loop execute r.q; end loop;
  for r in
    select format('drop schema if exists %I cascade', nspname) as q
    from pg_namespace
    where nspname not in (${managed}, 'public') and nspname not like 'pg\\_%'
      and nspname <> 'information_schema'
      and not exists (select 1 from pg_depend d where d.objid = pg_namespace.oid and d.deptype = 'e')
  loop execute r.q; end loop;
  for r in
    select format('truncate %I.%I cascade', schemaname, tablename) as q
    from pg_tables where schemaname = 'auth' and tablename <> 'schema_migrations'
  loop execute r.q; end loop;
end $$;`);
}

export async function* copyExport(
  target: CopyTarget,
  dir: string,
  toc: Toc,
  summary: ExportSummary,
  options: {
    sourceRef?: string;
    migrationVersions?: string[];
    again?: boolean;
    /** The switch's final copy: the queues' waiting messages come too (Lovable's jobs are off). */
    queueMessages?: boolean;
  } = {},
): Flow<CopyOutcome> {
  const plan = planRestore(toc, new Set(summary.appTriggers));
  const backup = join(dir, BACKUP);
  const problems: string[] = [];
  // Copying again: the buckets are already there, with their files.
  const keep = (errors: string[]) => {
    for (const error of errors) {
      if (isExpected(error)) continue;
      if (options.again && /unique constraint "buckets_pkey"/.test(error)) continue;
      problems.push(error);
    }
  };

  if (options.again) {
    yield step("move:data", "running", "Copying your data", "Clearing the earlier copy");
    await emptyCopy(target.sql);
  }

  yield step("move:data", "running", "Copying your data", "Turning on your database's extensions");
  keep(
    (await restorePass(target.pg, backup, plan.extensions, { dir, name: "1-extensions" })).errors,
  );
  if (plan.queues.length > 0) {
    await createQueues(target.sql, plan.queues).catch((error: unknown) => {
      problems.push(`queues: ${messageOf(error)}`);
    });
    if (options.queueMessages && plan.queueData.length > 0) {
      // Emails waiting to go out at the pause go out from here, once.
      await target.sql
        .run(plan.queues.map((q) => `truncate pgmq.${ident(`q_${q}`)};`).join("\n"))
        .catch(() => {});
      keep(
        (
          await restorePass(target.pg, backup, plan.queueData, {
            dir,
            name: "1-queue-messages",
            dataOnly: true,
          })
        ).errors,
      );
    }
  }

  yield step("move:data", "running", "Copying your data", "Bringing your people over");
  keep(
    (
      await restorePass(target.pg, backup, plan.managedData, {
        dir,
        name: "2-people",
        dataOnly: true,
      })
    ).errors,
  );

  yield step("move:data", "running", "Copying your data", "Copying your tables");
  keep(
    (await restorePass(target.pg, backup, plan.app, { dir, name: "3-tables", privileges: true }))
      .errors,
  );

  yield step("move:data", "running", "Copying your data", "Putting the access rules back");
  keep((await restorePass(target.pg, backup, plan.managedExtras, { dir, name: "4-rules" })).errors);
  yield step(
    "move:data",
    problems.length > 0 ? "warning" : "done",
    "Copied your data",
    problems.length > 0 ? `${problems.length} parts didn't copy cleanly` : undefined,
  );

  yield step("move:fixes", "running", "Getting the copy ready");
  const fixes: string[] = [];
  const attempt = async (what: string, work: () => Promise<string | undefined>) => {
    try {
      const done = await work();
      if (done) fixes.push(done);
    } catch (error) {
      problems.push(`${what}: ${messageOf(error)}`);
    }
  };
  await attempt("export folder", async () => {
    const n = await removeExportBucket(target.sql);
    return n > 0 ? "Removed Lovable's export folder from your files" : undefined;
  });
  await attempt("counters", async () => {
    const { fixed, failed } = await alignSequences(target.sql);
    if (failed.length > 0) problems.push(`counters left behind: ${failed.join(", ")}`);
    return fixed > 0
      ? `Moved ${fixed} counter${fixed === 1 ? "" : "s"} past their rows`
      : undefined;
  });
  if (options.sourceRef) {
    const from = options.sourceRef;
    await attempt("functions", async () => {
      const { fixed, leftover } = await repointFunctions(target.sql, from, target.ref, target.keys);
      if (leftover.length > 0) {
        problems.push(`functions holding an old key: ${leftover.join(", ")}`);
      }
      return fixed > 0
        ? `Pointed ${fixed} database function${fixed === 1 ? "" : "s"} at your new backend`
        : undefined;
    });
    await attempt("webhooks", async () => {
      const { fixed, leftover } = await repointTriggers(target.sql, from, target.ref, target.keys);
      if (leftover.length > 0) problems.push(`webhooks holding an old key: ${leftover.join(", ")}`);
      return fixed > 0
        ? `Pointed ${fixed} database webhook${fixed === 1 ? "" : "s"} at your new backend`
        : undefined;
    });
  }
  if (summary.vaultSecrets.includes("email_queue_service_role_key") && target.keys.serviceRole) {
    const key = target.keys.serviceRole;
    await attempt("email queue", async () => {
      await setVaultSecret(target.sql, "email_queue_service_role_key", key);
      return "Gave the email queue its new key";
    });
  }
  if (options.migrationVersions && options.migrationVersions.length > 0) {
    const versions = options.migrationVersions;
    await attempt("history", async () => {
      const n = await repairMigrationHistory(target.sql, versions);
      return n > 0 ? "Recorded your database changes as done" : undefined;
    });
  }
  // The copy ran with database hooks off, Supabase's included: the one that tells its API about
  // new tables never fired, so the API would still think the tables don't exist.
  await attempt("api", async () => {
    await target.sql.run("notify pgrst, 'reload schema'; notify pgrst, 'reload config';");
    return undefined;
  });
  yield step(
    "move:fixes",
    "done",
    "Got the copy ready",
    fixes.length > 0 ? fixes.join(" · ") : undefined,
  );
  return { problems, fixes };
}
