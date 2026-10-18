import {
  backendChoices,
  CloclodError,
  connectNetlify,
  connectSupabase,
  createBackend,
  NETLIFY_TOKENS_PAGE,
  putSiteOnline,
  siteChoices,
  TOKENS_PAGE,
} from "@clodable/core";
import { type Context, drive, run, secretInput } from "../context.js";
import { ash, celadon, link } from "../ui.js";

/** Connect Supabase or Netlify on this computer: the token is piped in, or typed hidden. */
export async function connectCommand(ctx: Context, service: string) {
  if (service === "supabase") {
    await run(
      ctx,
      async () => {
        await ctx.workspace();
        return connectSupabase(
          await secretInput(ctx, `Your Supabase access token (create one at ${TOKENS_PAGE})`),
        );
      },
      (data) => {
        ctx.out.line(`${celadon("✓")} Supabase is connected on this computer.`);
        for (const org of data.organizations) ctx.out.line(ash(`  ${org.name} · ${org.plan} plan`));
      },
    );
    return;
  }
  if (service === "netlify") {
    await run(
      ctx,
      async () => {
        await ctx.workspace();
        return connectNetlify(
          await secretInput(
            ctx,
            `Your Netlify access token (create one at ${NETLIFY_TOKENS_PAGE})`,
          ),
        );
      },
      (data) => {
        ctx.out.line(`${celadon("✓")} Netlify is connected on this computer.`);
        for (const account of data.accounts)
          ctx.out.line(ash(`  ${account.name} (${account.slug})`));
      },
    );
    return;
  }
  await run(ctx, async () => {
    throw new CloclodError({
      code: "invalid-config",
      message: `Cloclod can't connect “${service}”.`,
      hint: "Use supabase or netlify.",
    });
  });
}

/** The app's site: where it stands, or put it online on the builder's own Netlify (`create`). */
export async function siteCommand(ctx: Context, options: { action?: string; team?: string }) {
  if (options.action === "create") {
    await run(
      ctx,
      async () =>
        drive(
          ctx,
          putSiteOnline(await ctx.workspace(), options.team ? { team: options.team } : {}),
        ),
      (outcome) => {
        ctx.out.line(`  ${link(outcome.site.url)} ${ash("· goes online at your next Publish")}`);
        if (outcome.files.length > 0) ctx.out.line(ash(`  Added: ${outcome.files.join(", ")}`));
        const missing = outcome.settings.wanted.filter((n) => !outcome.settings.set.includes(n));
        if (missing.length > 0) {
          ctx.out.line(ash(`  Settings your app reads, to fill in: ${missing.join(", ")}`));
        }
      },
    );
    return;
  }
  await run(
    ctx,
    async () => {
      if (options.action) {
        throw new CloclodError({
          code: "invalid-config",
          message: `“${options.action}” isn't something site does.`,
          hint: "Use cloclod site to see where it stands, or cloclod site create.",
        });
      }
      return siteChoices(await ctx.workspace());
    },
    (choices) => {
      if (choices.site) ctx.out.line(`${celadon("●")} Your site: ${link(choices.site.url)}`);
      else ctx.out.line(ash("Your site isn't online with Cloclod yet."));
      if (!choices.connected) ctx.out.line(ash("Netlify isn't connected on this computer."));
      for (const team of choices.teams) ctx.out.line(`${team.name} ${ash(`(${team.slug})`)}`);
    },
  );
}

/** The app's backend: what Supabase offers, or a new one on the builder's own Supabase (`create`). */
export async function backendCommand(
  ctx: Context,
  options: { action?: string; org?: string; region?: string },
) {
  if (options.action === "create") {
    await run(
      ctx,
      async () =>
        drive(
          ctx,
          createBackend(await ctx.workspace(), {
            ...(options.org ? { org: options.org } : {}),
            ...(options.region ? { region: options.region } : {}),
          }),
        ),
      (outcome) => {
        ctx.out.line(ash(`  ${outcome.name} · ${outcome.region}`));
        ctx.out.line(`  ${link(outcome.dashboard)}`);
      },
    );
    return;
  }
  await run(
    ctx,
    async () => {
      if (options.action) {
        throw new CloclodError({
          code: "invalid-config",
          message: `“${options.action}” isn't something backend does.`,
          hint: "Use cloclod backend to see your choices, or cloclod backend create.",
        });
      }
      await ctx.workspace();
      return backendChoices();
    },
    (choices) => {
      if (!choices.connected) {
        ctx.out.line(ash("Supabase isn't connected on this computer."));
        return;
      }
      for (const org of choices.organizations ?? []) {
        ctx.out.line(`${org.name} ${ash(`(${org.slug}) · ${choices.costs?.[org.slug] ?? ""}`)}`);
      }
      if (choices.region) ctx.out.line(ash(`Suggested region: ${choices.region.name}`));
    },
  );
}
