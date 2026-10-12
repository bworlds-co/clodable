import {
  applyMigration,
  ClodableError,
  checkDatabase,
  queryDatabase,
  runOnDatabase,
} from "@clodable/core";
import { type Context, run } from "../context.js";
import { ash, celadon } from "../ui.js";

/** SQL from the argument, or piped in (long statements, quotes that a shell would mangle). */
async function sqlInput(arg: string | undefined): Promise<string | undefined> {
  if (arg) return arg;
  if (process.stdin.isTTY) return undefined;
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8").trim() || undefined;
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
          ctx.out.line(ash(`${data.rows.length}${data.truncated ? "+" : ""} rows`));
        },
      );
    case "check":
      return run(
        ctx,
        async () => checkDatabase(await ctx.workspace()),
        (data) => {
          if (data.findings.length === 0)
            ctx.out.line(`${celadon("✓")} Supabase sees nothing to fix.`);
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
        () => ctx.out.line(`${celadon("✓")} Done.`),
      );
    case "apply":
      return run(
        ctx,
        async () => applyMigration(await ctx.workspace(), options.arg),
        (data) =>
          ctx.out.line(
            data.applied
              ? `${celadon("✓")} Applied ${data.name.replace(/_/g, " ")}.`
              : ash(`Already applied: ${data.name.replace(/_/g, " ")}.`),
          ),
      );
    default:
      return run(ctx, async () => {
        throw new ClodableError({
          code: "invalid-config",
          message: `There's no “${options.action ?? ""}” for the database.`,
          hint: 'clodable db query "select …", clodable db run "update …", or clodable db apply supabase/migrations/<file>.sql',
        });
      });
  }
}
