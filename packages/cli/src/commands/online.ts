import {
  backendChoices,
  ClodableError,
  connectNetlify,
  connectSupabase,
  createBackend,
  NETLIFY_TOKENS_PAGE,
  putSiteOnline,
  reconnectSite,
  siteChoices,
  TOKENS_PAGE,
} from "@clodable/core";
import { type Context, drive, run, secretInput } from "../context.js";
import { tr } from "../i18n.js";
import { ash, celadon, link } from "../ui.js";

/** Connect Supabase or Netlify on this computer: the token is piped in, or typed hidden. */
export async function connectCommand(ctx: Context, service: string) {
  if (service === "supabase") {
    await run(
      ctx,
      async () => {
        await ctx.workspace();
        return connectSupabase(
          await secretInput(
            ctx,
            tr("Your Supabase access token (create one at {0})", { "0": TOKENS_PAGE }),
          ),
        );
      },
      (data) => {
        ctx.out.line(tr("{0} Supabase is connected on this computer.", { "0": celadon("✓") }));
        for (const org of data.organizations)
          ctx.out.line(ash(tr("  {0} · {1} plan", { "0": org.name, "1": org.plan })));
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
            tr("Your Netlify access token (create one at {0})", { "0": NETLIFY_TOKENS_PAGE }),
          ),
        );
      },
      (data) => {
        ctx.out.line(tr("{0} Netlify is connected on this computer.", { "0": celadon("✓") }));
        for (const account of data.accounts)
          ctx.out.line(ash(`  ${account.name} (${account.slug})`));
      },
    );
    return;
  }
  await run(ctx, async () => {
    throw new ClodableError({
      code: "invalid-config",
      message: tr("Clodable can't connect “{0}”.", { "0": service }),
      hint: tr("Use supabase or netlify."),
    });
  });
}

/** The app's site: where it stands, or put it online on the builder's own Netlify (`create`). */
export async function siteCommand(ctx: Context, options: { action?: string; team?: string }) {
  if (options.action === "reconnect") {
    await run(
      ctx,
      async () => reconnectSite(await ctx.workspace()),
      () => {
        ctx.out.line(
          tr("{0} Your app's publishing connection is updated. You can retry Publish.", {
            "0": celadon("✓"),
          }),
        );
      },
    );
    return;
  }
  if (options.action === "create") {
    await run(
      ctx,
      async () =>
        drive(
          ctx,
          putSiteOnline(await ctx.workspace(), options.team ? { team: options.team } : {}),
        ),
      (outcome) => {
        ctx.out.line(
          `  ${link(outcome.site.url)} ${ash(tr("· goes online at your next Publish"))}`,
        );
        if (outcome.files.length > 0)
          ctx.out.line(ash(tr("  Added: {0}", { "0": outcome.files.join(", ") })));
        const missing = outcome.settings.wanted.filter((n) => !outcome.settings.set.includes(n));
        if (missing.length > 0) {
          ctx.out.line(
            ash(tr("  Settings your app reads, to fill in: {0}", { "0": missing.join(", ") })),
          );
        }
      },
    );
    return;
  }
  await run(
    ctx,
    async () => {
      if (options.action) {
        throw new ClodableError({
          code: "invalid-config",
          message: tr("“{0}” isn't something site does.", { "0": options.action }),
          hint: tr("Use clodable site to see where it stands, or clodable site create."),
        });
      }
      return siteChoices(await ctx.workspace());
    },
    (choices) => {
      if (choices.site)
        ctx.out.line(tr("{0} Your site: {1}", { "0": celadon("●"), "1": link(choices.site.url) }));
      else ctx.out.line(ash(tr("Your site isn't online with Clodable yet.")));
      if (!choices.connected) ctx.out.line(ash(tr("Netlify isn't connected on this computer.")));
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
        throw new ClodableError({
          code: "invalid-config",
          message: tr("“{0}” isn't something backend does.", { "0": options.action }),
          hint: tr("Use clodable backend to see your choices, or clodable backend create."),
        });
      }
      await ctx.workspace();
      return backendChoices();
    },
    (choices) => {
      if (!choices.connected) {
        ctx.out.line(ash(tr("Supabase isn't connected on this computer.")));
        return;
      }
      for (const org of choices.organizations ?? []) {
        ctx.out.line(`${org.name} ${ash(`(${org.slug}) · ${choices.costs?.[org.slug] ?? ""}`)}`);
      }
      if (choices.region)
        ctx.out.line(ash(tr("Suggested region: {0}", { "0": choices.region.name })));
    },
  );
}
