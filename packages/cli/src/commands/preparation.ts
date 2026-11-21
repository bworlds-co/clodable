import { backupOriginal, ClodableError } from "@clodable/core";
import { type Context, run } from "../context.js";
import { tr } from "../i18n.js";

/** A verified, private snapshot before Claude prepares a local app; no setup or account access. */
export async function preparationCommand(ctx: Context, action: string): Promise<void> {
  await run(
    ctx,
    () => {
      if (action !== "backup") {
        throw new ClodableError({
          code: "invalid-config",
          message: tr("That preparation step isn't available."),
        });
      }
      return backupOriginal(ctx.cwd);
    },
    () => ctx.out.line(tr("Your original app is backed up on this computer.")),
  );
}
