import { confirm, isCancel } from "@clack/prompts";
import { checksFailed, publish, runChecks, undoPublish } from "@clodable/core";
import pc from "picocolors";
import { type Context, drive, run } from "../context.js";
import { tr } from "../i18n.js";
import { ash, celadon, link, ochre } from "../ui.js";

export async function publishCommand(
  ctx: Context,
  options: { message?: string; skipChecks?: boolean },
) {
  const ws = await ctx.workspace().catch((e) => e as Error);
  ctx.out.header(
    ws instanceof Error ? tr("publishing") : tr("publishing {0}", { "0": ws.project.name }),
  );
  await run(
    ctx,
    async () => {
      if (ws instanceof Error) throw ws;
      return drive(
        ctx,
        publish(ws, {
          ...(options.message ? { message: options.message } : {}),
          ...(options.skipChecks ? { skipChecks: true } : {}),
        }),
      );
    },
    (result) => {
      const { out } = ctx;
      out.line();
      if (result.deploy === "live") {
        out.line(
          `${celadon("●")} ${pc.bold(tr("You're live"))}${result.url ? `  ${link(result.url)}` : ""}`,
        );
      } else if (result.deploy === "pending") {
        out.line(
          tr("{0} {1}. Your host is still putting it live{2}", {
            "0": ochre("●"),
            "1": pc.bold(tr("Published")),
            "2": result.url ? `: ${link(result.url)}` : ".",
          }),
        );
      } else {
        out.line(
          `${celadon("●")} ${pc.bold(tr("Published"))}${result.url ? `  ${link(result.url)}` : ""}`,
        );
      }
      out.line(ash(`  “${result.title}”`));
      for (const warning of result.warnings) out.line(`${ochre("!")} ${warning}`);
      if (result.functions.pending.length > 0) {
        out.line(
          tr("{0} Backend functions to update: {1}. Ask Claude to put them live.", {
            "0": ochre("!"),
            "1": result.functions.pending.join(", "),
          }),
        );
      }
      out.line();
      out.line(ash(tr("Changed your mind?  clodable undo")));
      out.line();
    },
  );
}

export async function undoCommand(ctx: Context, options: { yes?: boolean; sha?: string }) {
  const ws = await ctx.workspace().catch((e) => e as Error);
  if (!(ws instanceof Error) && !ctx.out.json && !options.yes && process.stdin.isTTY) {
    await ws.git.fetch(ws.remote, ws.liveBranch);
    const [last] = await ws.git.log(ws.liveRef, { firstParent: true, limit: 1 });
    const ok = await confirm({
      message: tr("Undo “{0}”? The previous version goes live again.", {
        "0": last?.subject ?? tr("your last publish"),
      }),
    });
    if (isCancel(ok) || !ok) {
      ctx.out.line(ash(tr("Nothing changed.")));
      return;
    }
    ctx.out.line(ash(tr("Database changes aren't undone. Only the app's pages and code are.")));
  }
  ctx.out.header(tr("undoing your last publish"));
  await run(
    ctx,
    async () => {
      if (ws instanceof Error) throw ws;
      return drive(ctx, undoPublish(ws, options.sha ? { sha: options.sha } : {}));
    },
    (result) => {
      ctx.out.line();
      ctx.out.line(
        tr("{0} {1}. “{2}” is no longer live.{3}", {
          "0": celadon("●"),
          "1": pc.bold(tr("Undone")),
          "2": result.undid.title,
          "3": result.url ? `  ${link(result.url)}` : "",
        }),
      );
      if (result.conflicts?.length) {
        ctx.out.line(
          tr("{0} Your draft overlaps with what was undone. Ask Claude to combine them: {1}", {
            "0": ochre("!"),
            "1": result.conflicts.join(", "),
          }),
        );
      }
      ctx.out.line();
    },
  );
}

export async function checkCommand(ctx: Context) {
  ctx.out.header(tr("checking your app"));
  await run(
    ctx,
    async () => {
      const ws = await ctx.workspace();
      const results = await drive(ctx, runChecks(ws.project, ws.config));
      const failed = results.filter((r) => r.status === "failed");
      if (failed.length > 0) throw checksFailed(failed, tr("Ask Claude to fix it."));
      return results;
    },
    () => {
      ctx.out.line();
      ctx.out.line(`${celadon("●")} ${pc.bold(tr("Ready to publish"))}`);
      ctx.out.line();
    },
  );
}
