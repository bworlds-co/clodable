import { confirm, isCancel } from "@clack/prompts";
import { checksFailed, publish, runChecks, undoPublish } from "@clodable/core";
import pc from "picocolors";
import { type Context, drive, run } from "../context.js";
import { ash, celadon, link, ochre } from "../ui.js";

export async function publishCommand(
  ctx: Context,
  options: { message?: string; skipChecks?: boolean },
) {
  const ws = await ctx.workspace().catch((e) => e as Error);
  ctx.out.header(ws instanceof Error ? "publishing" : `publishing ${ws.project.name}`);
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
          `${celadon("●")} ${pc.bold("You're live")}${result.url ? `  ${link(result.url)}` : ""}`,
        );
      } else if (result.deploy === "pending") {
        out.line(
          `${ochre("●")} ${pc.bold("Published")}. Your host is still putting it live${result.url ? `: ${link(result.url)}` : "."}`,
        );
      } else {
        out.line(
          `${celadon("●")} ${pc.bold("Published")}${result.url ? `  ${link(result.url)}` : ""}`,
        );
      }
      out.line(ash(`  “${result.title}”`));
      for (const warning of result.warnings) out.line(`${ochre("!")} ${warning}`);
      if (result.functions.pending.length > 0) {
        out.line(
          `${ochre("!")} Backend functions to update: ${result.functions.pending.join(", ")}. Ask Claude to deploy them.`,
        );
      }
      out.line();
      out.line(ash("Changed your mind?  cloclod undo"));
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
      message: `Undo “${last?.subject ?? "your last publish"}”? The previous version goes live again.`,
    });
    if (isCancel(ok) || !ok) {
      ctx.out.line(ash("Nothing changed."));
      return;
    }
    ctx.out.line(ash("Database changes aren't undone. Only the app's pages and code are."));
  }
  ctx.out.header("undoing your last publish");
  await run(
    ctx,
    async () => {
      if (ws instanceof Error) throw ws;
      return drive(ctx, undoPublish(ws, options.sha ? { sha: options.sha } : {}));
    },
    (result) => {
      ctx.out.line();
      ctx.out.line(
        `${celadon("●")} ${pc.bold("Undone")}. “${result.undid.title}” is no longer live.${result.url ? `  ${link(result.url)}` : ""}`,
      );
      if (result.conflicts?.length) {
        ctx.out.line(
          `${ochre("!")} Your draft overlaps with what was undone. Ask Claude to combine them: ${result.conflicts.join(", ")}`,
        );
      }
      ctx.out.line();
    },
  );
}

export async function checkCommand(ctx: Context) {
  ctx.out.header("checking your app");
  await run(
    ctx,
    async () => {
      const ws = await ctx.workspace();
      const results = await drive(ctx, runChecks(ws.project, ws.config));
      const failed = results.filter((r) => r.status === "failed");
      if (failed.length > 0) throw checksFailed(failed, "Ask Claude to fix it.");
      return results;
    },
    () => {
      ctx.out.line();
      ctx.out.line(`${celadon("●")} ${pc.bold("Ready to publish")}`);
      ctx.out.line();
    },
  );
}
