import { setSetting, settingsStatus } from "@clodable/core";
import { type Context, run, secretInput } from "../context.js";
import { tr } from "../i18n.js";
import { ash, celadon, clay } from "../ui.js";

/**
 * The settings the app's server code reads (`process.env.X`): which have a value on this computer
 * (for the preview) and on the site. `setting <NAME>` sets one, its value on stdin.
 */
export async function settingsCommand(ctx: Context, options: { name?: string }) {
  if (options.name) {
    const name = options.name;
    return run(
      ctx,
      async () => {
        const ws = await ctx.workspace();
        return setSetting(
          ws,
          name,
          await secretInput(ctx, tr("The value of {0}", { "0": name }), { exact: true }),
        );
      },
      () =>
        ctx.out.line(
          tr("{0} Saved {1}. The preview restarts with it.", { "0": celadon("✓"), "1": name }),
        ),
    );
  }
  return run(
    ctx,
    async () => settingsStatus(await ctx.workspace()),
    (status) => {
      for (const name of status.wanted) {
        const here = status.local.includes(name);
        const site = status.site?.includes(name);
        ctx.out.line(
          `${here ? celadon("✓") : clay("●")} ${name}${ash(`  ${here ? tr("on this computer") : tr("not on this computer")}${status.site ? (site ? tr(" · on your site") : tr(" · not on your site")) : ""}`)}`,
        );
      }
      for (const name of status.lovable)
        ctx.out.line(`${ash("·")} ${name} ${ash(tr("(Lovable's own)"))}`);
    },
  );
}
