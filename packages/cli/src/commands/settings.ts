import { setSetting, settingsStatus } from "@clodable/core";
import { type Context, run, secretInput } from "../context.js";
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
          await secretInput(ctx, `The value of ${name}`, { exact: true }),
        );
      },
      () => ctx.out.line(`${celadon("✓")} Saved ${name}. The preview restarts with it.`),
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
          `${here ? celadon("✓") : clay("●")} ${name}${ash(`  ${here ? "on this computer" : "not on this computer"}${status.site ? (site ? " · on your site" : " · not on your site") : ""}`)}`,
        );
      }
      for (const name of status.lovable)
        ctx.out.line(`${ash("·")} ${name} ${ash("(Lovable's own)")}`);
    },
  );
}
