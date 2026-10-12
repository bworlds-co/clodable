import { isCancel, password } from "@clack/prompts";
import { ClodableError, setSetting, settingsStatus } from "@clodable/core";
import { type Context, run } from "../context.js";
import { ash, celadon, clay } from "../ui.js";

/** A setting's value, piped in (never an argument), or typed in a hidden prompt in a terminal. */
async function valueInput(ctx: Context, name: string): Promise<string> {
  if (!process.stdin.isTTY) {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
    const piped = Buffer.concat(chunks).toString("utf8");
    if (piped.trim()) return piped;
  } else if (!ctx.out.json) {
    const typed = await password({ message: `The value of ${name}` });
    if (!isCancel(typed) && typed.trim()) return typed;
  }
  throw new ClodableError({
    code: "invalid-config",
    message: "Nothing was given.",
    hint: "Pipe the value in (never as an argument), or run this in a terminal to type it.",
  });
}

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
        return setSetting(ws, name, await valueInput(ctx, name));
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
