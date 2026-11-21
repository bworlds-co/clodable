import {
  applyMigration,
  ClodableError,
  checkDatabase,
  queryDatabase,
  runOnDatabase,
} from "@clodable/core";
import { type Context, readStdin, run } from "../context.js";
import { tr } from "../i18n.js";
import { ash, celadon } from "../ui.js";

/** SQL from the argument, or piped in (long statements, quotes that a shell would mangle). */
async function sqlInput(arg: string | undefined): Promise<string | undefined> {
  if (arg) return arg;
  return (await readStdin())?.trim() || undefined;
}

/**
 * The app's own database: `query` reads, `run` changes data, `apply` applies a migration from
 * supabase/migrations/. Claude runs them; the builder confirms each change first.
 */
export async function dbCommand(ctx: Context, options: { action?: string; arg?: string }) {
  switch (options.action) {
    case "query":
      return run(
        ctx,
        async () => queryDatabase(await ctx.workspace(), await sqlInput(options.arg)),
        (data) => {
          for (const row of data.rows) ctx.out.line(JSON.stringify(row));
          ctx.out.line(
            ash(tr("{0}{1} rows", { "0": data.rows.length, "1": data.truncated ? "+" : "" })),
          );
        },
      );
    case "check":
      return run(
        ctx,
        async () => checkDatabase(await ctx.workspace()),
        (data) => {
          if (data.findings.length === 0)
            ctx.out.line(tr("{0} Supabase sees nothing to fix.", { "0": celadon("✓") }));
          for (const f of data.findings) {
            ctx.out.line(
              `${f.level === "error" ? "✕" : "!"} ${f.title}${f.detail ? ash(` · ${f.detail}`) : ""}`,
            );
          }
        },
      );
    case "run":
      return run(
        ctx,
        async () => runOnDatabase(await ctx.workspace(), await sqlInput(options.arg)),
        () => ctx.out.line(tr("{0} Done.", { "0": celadon("✓") })),
      );
    case "apply":
      return run(
        ctx,
        async () => applyMigration(await ctx.workspace(), options.arg),
        (data) =>
          ctx.out.line(
            data.applied
              ? tr("{0} Applied {1}.", { "0": celadon("✓"), "1": data.name.replace(/_/g, " ") })
              : ash(tr("Already applied: {0}.", { "0": data.name.replace(/_/g, " ") })),
          ),
      );
    default:
      return run(ctx, async () => {
        throw new ClodableError({
          code: "invalid-config",
          message: tr("There's no “{0}” for the database.", { "0": options.action ?? "" }),
          hint: tr(
            'clodable db query "select …", clodable db run "update …", or clodable db apply supabase/migrations/<file>.sql',
          ),
        });
      });
  }
}
