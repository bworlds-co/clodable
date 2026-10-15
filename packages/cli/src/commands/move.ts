import {
  applyKit,
  assessMove,
  ClodableError,
  checkCopy,
  connectNetlify,
  connectResend,
  connectSupabase,
  copyData,
  copyUploads,
  costOf,
  createHome,
  deployBackendFunctions,
  diagnoseCopy,
  enableEmailHook,
  factsSummary,
  forgetMoveFiles,
  forgetSecret,
  functionSecretStatus,
  goLive,
  homeChoices,
  importExport,
  loadMove,
  type MoveAssessment,
  type MoveProgress,
  markFinished,
  markFrozen,
  moveFacts,
  moveProgress,
  NETLIFY_TOKENS_PAGE,
  NetlifyApi,
  type ProjectConfig,
  planKit,
  provisionAppEmails,
  putSiteOnNetlify,
  RESEND_KEYS_PAGE,
  recordFacts,
  SUPABASE_TOKEN,
  saveConfig,
  servicesStatus,
  setAiProvider,
  setDomain,
  setFunctionSecret,
  setGoogleSignIn,
  setMoveMethod,
  setPreview,
  setSetting,
  setUpEmails,
  setVaultValue,
  siteSettings,
  skipDomain,
  skipEmails,
  skipGoogle,
  skipLeftovers,
  skipServices,
  switchPlan,
  TOKENS_PAGE,
  vaultStatus,
  type Workspace,
} from "@clodable/core";
import { type Context, drive, readStdin, run, secretInput } from "../context.js";
import { ash, celadon, clay, link, ochre } from "../ui.js";

const SETTINGS = {
  backend: ["lovable-cloud", "supabase", "none"],
  hosting: ["lovable", "github", "none"],
} as const;
type Setting = keyof typeof SETTINGS;

/**
 * Read or change where the app's data and live site are. Changing one also updates the files that
 * depend on it (AGENTS.md, .mcp.json), so Claude's instructions match at once.
 */
export async function configCommand(ctx: Context, options: { key?: string; value?: string }) {
  await run(
    ctx,
    async () => {
      const ws = await ctx.workspace();
      const current = { backend: ws.config.backend, hosting: ws.config.hosting };
      if (!options.key) return current;
      if (!(options.key in SETTINGS)) {
        throw new ClodableError({
          code: "invalid-config",
          message: `There's no setting called “${options.key}”.`,
          hint: "Use backend or hosting.",
        });
      }
      const key = options.key as Setting;
      if (options.value === undefined) return { [key]: current[key] };
      const allowed: readonly string[] = SETTINGS[key];
      if (!allowed.includes(options.value)) {
        throw new ClodableError({
          code: "invalid-config",
          message: `“${options.value}” isn't a value for ${key}.`,
          hint: `Use one of: ${allowed.join(", ")}.`,
        });
      }
      const config: ProjectConfig = { ...ws.config, [key]: options.value };
      await saveConfig(ws.root, config);
      await applyKit(ws.root, await planKit(ws.project, config));
      return { backend: config.backend, hosting: config.hosting };
    },
    (data) => {
      for (const [key, value] of Object.entries(data)) {
        ctx.out.line(`${ash(key.padEnd(8))} ${value}`);
      }
    },
  );
}

const LEVEL: Record<MoveAssessment["level"], string> = {
  simple: "A simple move: Clodable does nearly everything, and you click a few buttons.",
  "some-steps": "A move with a few steps for you, each one guided.",
  "needs-help": "A move where some parts are best done with someone technical.",
};

export interface MoveOptions {
  step: string;
  arg?: string;
  org?: string;
  region?: string;
  name?: string;
  file?: string;
  /** `files`: read Lovable Cloud's service key from stdin, for private folders. */
  private?: boolean;
  /** `diagnose`: apply Clodable's own fixes on the copy. */
  fix?: boolean;
  /** `site`: the Netlify team the site goes in. */
  account?: string;
  /** `emails`: the domain emails come from, and the sender address. */
  domain?: string;
  sender?: string;
  /** `emails`: go live without emails of their own. */
  skip?: boolean;
  /** `emails`: send sign-in emails through the app's own auth-email-hook. */
  hook?: boolean;
  set?: boolean;
  /** `golive`: whether new people confirm their email before signing in. */
  confirmEmail?: boolean;
  /** `golive`: whether anyone may sign up (no: only invited people). */
  signUp?: boolean;
}

const MARK = { done: celadon("✓"), next: clay("●"), later: ash("·"), attention: ochre("!") };

function renderProgress(ctx: Context, progress: MoveProgress) {
  ctx.out.header("move off Lovable");
  for (const step of progress.steps) {
    ctx.out.line(`${MARK[step.state]} ${step.title}${step.detail ? ash(` · ${step.detail}`) : ""}`);
  }
  if (progress.home) {
    ctx.out.line("");
    ctx.out.line(`${ash("new backend")} ${link(progress.home.dashboard)}`);
  }
}

/** Names the move wants a value for, each marked set or not. */
function checklist(ctx: Context, status: { wanted: string[]; set: string[] }) {
  for (const name of status.wanted) {
    ctx.out.line(`${status.set.includes(name) ? celadon("✓") : clay("●")} ${name}`);
  }
}

/** The step's argument, or what it should have been. */
function argument(options: MoveOptions, message: string, hint: string): string {
  if (!options.arg) throw new ClodableError({ code: "invalid-config", message, hint });
  return options.arg;
}

/**
 * Values the move found the app needs (secrets, settings, vault values): which are set, or with
 * --skip, going on without the ones left.
 */
function leftovers<S extends { wanted: string[]; set: string[] }>(
  kind: "secrets" | "settings" | "vault",
  status: (ws: Workspace) => Promise<S>,
  render: (ctx: Context, status: S) => void = checklist,
): MoveStepCommand["run"] {
  return (ctx, options) =>
    options.skip
      ? run(ctx, async () => skipLeftovers(await ctx.workspace(), kind))
      : run(
          ctx,
          async () => status(await ctx.workspace()),
          (s) => render(ctx, s),
        );
}

interface MoveStepCommand {
  /** How the help writes the step, when it takes more than its name. */
  usage?: string;
  run(ctx: Context, options: MoveOptions): Promise<void>;
}

/** Moving off Lovable, step by step, in the order they come. Every step is safe to run again. */
const STEPS = {
  check: {
    run: (ctx) =>
      run(
        ctx,
        async () => {
          const ws = await ctx.workspace();
          return assessMove(ws.project, ws.config, (await loadMove(ws.root)).facts);
        },
        (assessment) => {
          ctx.out.header("move off Lovable");
          ctx.out.line(LEVEL[assessment.level]);
          ctx.out.line("");
          const mark = { clodable: celadon("✓"), you: clay("●"), help: ochre("!") };
          const who = { clodable: "Clodable", you: "You", help: "Help" };
          for (const item of assessment.items) {
            ctx.out.line(`${mark[item.by]} ${item.label} ${ash(`· ${who[item.by]}`)}`);
            ctx.out.line(ash(`  ${item.detail}`));
          }
        },
      ),
  },

  facts: {
    usage: "facts [--set]",
    run: (ctx, options) =>
      options.set
        ? run(
            ctx,
            async () => {
              const json = (await readStdin())?.trim();
              if (!json) {
                throw new ClodableError({
                  code: "invalid-config",
                  message: "Nothing was given.",
                  hint: "Pipe the facts in, as one JSON object.",
                });
              }
              return recordFacts(await ctx.workspace(), json);
            },
            (facts) => ctx.out.line(`${celadon("✓")} Recorded: ${factsSummary(facts)}`),
          )
        : run(
            ctx,
            async () => moveFacts(await ctx.workspace()),
            ({ hints, facts }) => {
              ctx.out.header("what your app uses");
              ctx.out.line(facts ? factsSummary(facts) : ash("Not checked yet."));
              ctx.out.line("");
              ctx.out.line(ash("Clodable's scan, for Claude to check:"));
              ctx.out.line(JSON.stringify(hints, null, 2));
            },
          ),
  },

  status: {
    run: (ctx) =>
      run(
        ctx,
        async () => moveProgress(await ctx.workspace()),
        (progress) => renderProgress(ctx, progress),
      ),
  },

  connect: {
    run: (ctx) =>
      run(
        ctx,
        async () => {
          await ctx.workspace();
          return connectSupabase(
            await secretInput(ctx, `Your Supabase access token (create one at ${TOKENS_PAGE})`),
          );
        },
        (data) => {
          ctx.out.line(`${celadon("✓")} Supabase is connected on this computer.`);
          for (const org of data.organizations) {
            ctx.out.line(ash(`  ${org.name} · ${org.plan} plan`));
          }
        },
      ),
  },

  choices: {
    run: (ctx) =>
      run(
        ctx,
        async () => {
          await ctx.workspace();
          const choices = await homeChoices();
          return {
            ...choices,
            organizations: choices.organizations.map((o) => ({ ...o, cost: costOf(o) })),
          };
        },
        (choices) => {
          for (const org of choices.organizations) {
            ctx.out.line(`${org.name} ${ash(`(${org.slug}) · ${org.cost}`)}`);
          }
          if (choices.region) ctx.out.line(ash(`Suggested region: ${choices.region.name}`));
        },
      ),
  },

  create: {
    run: (ctx, options) =>
      run(
        ctx,
        async () =>
          drive(
            ctx,
            createHome(await ctx.workspace(), {
              ...(options.org ? { org: options.org } : {}),
              ...(options.region ? { region: options.region } : {}),
              ...(options.name ? { name: options.name } : {}),
            }),
          ),
        (home) => ctx.out.line(ash(`  ${home.name} · ${home.region}`)),
      ),
  },

  export: {
    run: (ctx, options) =>
      run(ctx, async () =>
        drive(ctx, importExport(await ctx.workspace(), options.file ? { file: options.file } : {})),
      ),
  },

  copy: {
    run: (ctx) => run(ctx, async () => drive(ctx, copyData(await ctx.workspace()))),
  },

  verify: {
    run: (ctx) =>
      run(
        ctx,
        async () => drive(ctx, checkCopy(await ctx.workspace())),
        (result) => {
          for (const check of result.checks) {
            ctx.out.line(`${check.ok ? celadon("✓") : ochre("!")} ${check.label}`);
            if (check.detail) ctx.out.line(ash(`  ${check.detail}`));
          }
        },
      ),
  },

  diagnose: {
    run: (ctx, options) =>
      run(
        ctx,
        async () => diagnoseCopy(await ctx.workspace(), { fix: Boolean(options.fix) }),
        (result) => {
          ctx.out.header("your new backend");
          for (const finding of result.findings) {
            const mark = finding.fixed || finding.ok ? celadon("✓") : ochre("!");
            ctx.out.line(
              `${mark} ${finding.label}${finding.fixed ? ash(" · fixed just now") : ""}`,
            );
            if (finding.detail) ctx.out.line(ash(`  ${finding.detail}`));
            if (finding.fix) ctx.out.line(ash(`  → ${finding.fix}`));
          }
        },
      ),
  },

  files: {
    run: (ctx, options) =>
      run(ctx, async () => {
        const ws = await ctx.workspace();
        const sourceKey = options.private
          ? await secretInput(ctx, "Lovable Cloud's service key")
          : undefined;
        return drive(ctx, copyUploads(ws, sourceKey ? { sourceKey } : {}));
      }),
  },

  functions: {
    run: (ctx) => run(ctx, async () => drive(ctx, deployBackendFunctions(await ctx.workspace()))),
  },

  secrets: { run: leftovers("secrets", functionSecretStatus) },

  secret: {
    usage: "secret <NAME>",
    run: (ctx, options) =>
      run(
        ctx,
        async () => {
          const ws = await ctx.workspace();
          const name = argument(
            options,
            "Which secret?",
            "clodable move secret RESEND_API_KEY, with the value piped in.",
          );
          return setFunctionSecret(ws, name, await secretInput(ctx, `The value of ${name}`));
        },
        () => ctx.out.line(`${celadon("✓")} Saved in your new backend.`),
      ),
  },

  vault: { run: leftovers("vault", vaultStatus) },

  "vault-secret": {
    usage: "vault-secret <NAME>",
    run: (ctx, options) =>
      run(
        ctx,
        async () => {
          const ws = await ctx.workspace();
          const value = await secretInput(ctx, `The value of ${options.arg ?? "the secret"}`);
          return setVaultValue(ws, options.arg, value);
        },
        () => ctx.out.line(`${celadon("✓")} Saved in your new backend's vault.`),
      ),
  },

  preview: {
    usage: "preview <copy|live>",
    run: (ctx, options) =>
      run(
        ctx,
        async () => {
          const ws = await ctx.workspace();
          const target = options.arg;
          if (target !== "copy" && target !== "live") {
            throw new ClodableError({
              code: "invalid-config",
              message: "Preview which backend?",
              hint: "clodable move preview copy, or clodable move preview live.",
            });
          }
          await setPreview(ws, target);
          return { preview: target };
        },
        (data) =>
          ctx.out.line(
            data.preview === "copy"
              ? `${celadon("✓")} The preview now uses your new backend.`
              : `${celadon("✓")} The preview uses your live backend again.`,
          ),
      ),
  },

  netlify: {
    run: (ctx) =>
      run(
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
          for (const account of data.accounts) {
            ctx.out.line(ash(`  ${account.name} (${account.slug})`));
          }
        },
      ),
  },

  teams: {
    run: (ctx) =>
      run(
        ctx,
        async () => {
          await ctx.workspace();
          const api = await NetlifyApi.required();
          return { accounts: (await api.accounts()).map((a) => ({ slug: a.slug, name: a.name })) };
        },
        (data) => {
          for (const account of data.accounts) {
            ctx.out.line(`${account.name} ${ash(`(${account.slug})`)}`);
          }
        },
      ),
  },

  site: {
    run: (ctx, options) =>
      run(
        ctx,
        async () =>
          drive(
            ctx,
            putSiteOnNetlify(
              await ctx.workspace(),
              options.account ? { account: options.account } : {},
            ),
          ),
        (outcome) => {
          ctx.out.line(ash(`  ${outcome.site.url}`));
          if (outcome.files.length > 0) ctx.out.line(ash(`  Added: ${outcome.files.join(", ")}`));
          const missing = outcome.settings.wanted.filter((n) => !outcome.settings.set.includes(n));
          if (missing.length > 0) {
            ctx.out.line(ash(`  Settings your app reads, to fill in: ${missing.join(", ")}`));
          }
          if (outcome.settings.lovable.length > 0) {
            ctx.out.line(ash(`  Lovable's own, for later: ${outcome.settings.lovable.join(", ")}`));
          }
        },
      ),
  },

  settings: {
    run: leftovers("settings", siteSettings, (ctx, status) => {
      checklist(ctx, status);
      for (const name of status.lovable)
        ctx.out.line(`${ash("·")} ${name} ${ash("(Lovable's own)")}`);
    }),
  },

  setting: {
    usage: "setting <NAME>",
    run: (ctx, options) =>
      run(
        ctx,
        async () => {
          const ws = await ctx.workspace();
          const name = argument(
            options,
            "Which setting?",
            "clodable move setting GREETING, with the value piped in.",
          );
          // For the preview too, not only the site: one paste, both places.
          await setSetting(ws, name, await secretInput(ctx, `The value of ${name}`));
          return siteSettings(ws);
        },
        () => ctx.out.line(`${celadon("✓")} Saved on your Netlify site.`),
      ),
  },

  method: {
    usage: "method <careful|quick>",
    run: (ctx, options) =>
      run(
        ctx,
        async () => setMoveMethod(await ctx.workspace(), options.arg),
        (data) =>
          ctx.out.line(
            `${celadon("✓")} ${data.method === "quick" ? "In one go: no pause, no last export." : "Carefully: a short pause at the end, nothing lost."}`,
          ),
      ),
  },

  resend: {
    run: (ctx) =>
      run(
        ctx,
        async () => {
          await ctx.workspace();
          return connectResend(
            await secretInput(ctx, `Your Resend key, with Full access (${RESEND_KEYS_PAGE})`),
          );
        },
        () => ctx.out.line(`${celadon("✓")} Resend is connected on this computer.`),
      ),
  },

  emails: {
    usage: "emails --domain <domain>|--hook|--skip",
    run: (ctx, options) =>
      run(
        ctx,
        async () => {
          const ws = await ctx.workspace();
          if (options.skip) {
            await skipEmails(ws);
            return { connected: false, skipped: true } as const;
          }
          if (options.hook) {
            await enableEmailHook(ws);
            return { connected: true, hook: true } as const;
          }
          return drive(
            ctx,
            setUpEmails(ws, {
              ...(options.domain ? { domain: options.domain } : {}),
              ...(options.sender ? { sender: options.sender } : {}),
            }),
          );
        },
        (outcome) => {
          if ("hook" in outcome) {
            ctx.out.line(`${celadon("✓")} Sign-in emails go out through your app's own templates.`);
            return;
          }
          if ("skipped" in outcome) {
            ctx.out.line(
              `${celadon("✓")} Going live without emails: no confirmations, no password resets.`,
            );
            return;
          }
          if (outcome.connected) return;
          ctx.out.line("");
          ctx.out.line(`Add these records at ${outcome.domain}'s DNS provider:`);
          for (const r of outcome.records) {
            const priority = r.priority !== undefined ? ash(`  (priority ${r.priority})`) : "";
            ctx.out.line(`  ${r.type.padEnd(5)} ${r.name.padEnd(22)} ${r.value}${priority}`);
          }
        },
      ),
  },

  services: {
    run: (ctx, options) =>
      options.skip
        ? run(ctx, async () => skipServices(await ctx.workspace()))
        : run(
            ctx,
            async () => servicesStatus(await ctx.workspace()),
            (status) => {
              const line = (on: boolean, done: boolean, text: string) => {
                if (on) ctx.out.line(`${done ? celadon("✓") : clay("●")} ${text}`);
              };
              line(
                status.ai,
                status.aiSwitched,
                "AI: Lovable's AI gateway → your own provider (AI_API_URL, AI_API_KEY)",
              );
              line(
                status.emails,
                status.emailsSwitched,
                "Emails: Lovable's email API → Resend (RESEND_API_KEY, EMAIL_FROM)",
              );
              line(
                status.hook,
                status.hookOn,
                "Sign-in emails: your own templates (auth-email-hook)",
              );
              for (const name of status.connectors) {
                ctx.out.line(`${clay("●")} ${name}, through Lovable's connectors`);
              }
            },
          ),
  },

  ai: {
    usage: "ai <openrouter|gemini|openai>",
    run: (ctx, options) =>
      run(
        ctx,
        async () => {
          const ws = await ctx.workspace();
          const key = await secretInput(ctx, `Your ${options.arg ?? "AI provider"} key`);
          return setAiProvider(ws, options.arg, key);
        },
        (data) =>
          ctx.out.line(
            `${celadon("✓")} Saved for your preview, your site and your backend functions: ${data.url}`,
          ),
      ),
  },

  "app-emails": {
    run: (ctx) =>
      run(
        ctx,
        async () => provisionAppEmails(await ctx.workspace()),
        (data) =>
          ctx.out.line(
            `${celadon("✓")} Your app has its own Resend key (RESEND_API_KEY), sending from ${data.sender}.`,
          ),
      ),
  },

  google: {
    usage: "google <client id>|--skip",
    run: (ctx, options) =>
      run(
        ctx,
        async () => {
          const ws = await ctx.workspace();
          if (options.skip) return skipGoogle(ws);
          const secret = await secretInput(ctx, "Your Google client secret");
          return setGoogleSignIn(ws, options.arg, secret);
        },
        (data) =>
          ctx.out.line(
            "skipped" in data
              ? `${celadon("✓")} Google sign-in stays off on your new site.`
              : `${celadon("✓")} Google sign-in is on in your new backend.`,
          ),
      ),
  },

  pause: {
    run: (ctx) =>
      run(
        ctx,
        async () => switchPlan(await ctx.workspace()),
        (plan) => {
          ctx.out.line(
            "Paste this in Lovable (More → Cloud → SQL editor) to pause changes on your live app:",
          );
          ctx.out.line(plan.freeze);
          ctx.out.line("");
          ctx.out.line(ash("To undo the pause:"));
          ctx.out.line(ash(plan.undo));
        },
      ),
  },

  paused: {
    run: (ctx) =>
      run(
        ctx,
        async () => markFrozen(await ctx.workspace()),
        () =>
          ctx.out.line(
            `${celadon("✓")} Paused. Next: export from Lovable once more, then copy it in.`,
          ),
      ),
  },

  golive: {
    run: (ctx, options) =>
      run(
        ctx,
        async () =>
          drive(
            ctx,
            goLive(await ctx.workspace(), {
              ...(options.confirmEmail !== undefined ? { confirmEmail: options.confirmEmail } : {}),
              ...(options.signUp !== undefined ? { signUp: options.signUp } : {}),
            }),
          ),
        (outcome) => {
          if (outcome.files.length > 0) ctx.out.line(ash(`  Updated: ${outcome.files.join(", ")}`));
          if (outcome.jobs?.created) {
            ctx.out.line(ash(`  Started ${outcome.jobs.created} scheduled job(s)`));
          }
          ctx.out.line(`Publish to put it live at ${outcome.url}.`);
        },
      ),
  },

  domain: {
    usage: "domain [name|--skip]",
    run: (ctx, options) =>
      run(
        ctx,
        async () => {
          const ws = await ctx.workspace();
          return options.skip ? skipDomain(ws) : setDomain(ws, options.arg);
        },
        (outcome) => {
          if ("skipped" in outcome) {
            ctx.out.line(`${celadon("✓")} Your app keeps its Netlify address.`);
            return;
          }
          if (outcome.ready) {
            ctx.out.line(
              `${celadon("✓")} ${outcome.name} points to your site. Sign-in links use it now.`,
            );
            return;
          }
          ctx.out.line(
            `At ${outcome.name}'s provider, replace the records that point to Lovable with:`,
          );
          for (const r of outcome.records) {
            ctx.out.line(`  ${r.type.padEnd(5)} ${r.name.padEnd(6)} ${r.value}`);
          }
        },
      ),
  },

  finished: {
    run: (ctx) =>
      run(
        ctx,
        async () => markFinished(await ctx.workspace()),
        () =>
          ctx.out.line(
            `${celadon("✓")} Your app is off Lovable. Clodable deleted its copy of your export from this computer.`,
          ),
      ),
  },

  forget: {
    run: (ctx) =>
      run(
        ctx,
        async () => {
          await forgetMoveFiles((await ctx.workspace()).root);
          return { forgotten: true };
        },
        () =>
          ctx.out.line(
            `${celadon("✓")} Removed the export and the move's files from this computer.`,
          ),
      ),
  },

  disconnect: {
    run: (ctx) =>
      run(
        ctx,
        async () => {
          await forgetSecret(SUPABASE_TOKEN);
          return { disconnected: true };
        },
        () =>
          ctx.out.line(
            `${celadon("✓")} Supabase is disconnected here. Delete the token in Supabase too: ${TOKENS_PAGE}`,
          ),
      ),
  },
} satisfies Record<string, MoveStepCommand>;

type MoveStepName = keyof typeof STEPS;
const COMMANDS: Record<MoveStepName, MoveStepCommand> = STEPS;
const MOVE_STEPS = Object.keys(COMMANDS) as MoveStepName[];

/** The move's line in `clodable --help`: every step, in order, with what it takes. */
export const MOVE_HELP = `Move off Lovable, step by step: ${MOVE_STEPS.map((name) => COMMANDS[name].usage ?? name).join(", ")}`;

/** Moving off Lovable, step by step. Every step is safe to run again. */
export async function moveCommand(ctx: Context, options: MoveOptions) {
  if (!Object.hasOwn(COMMANDS, options.step)) {
    return run(ctx, async () => {
      throw new ClodableError({
        code: "not-found",
        message: `There's no move step called “${options.step}”.`,
        hint: `Use one of: ${MOVE_STEPS.join(", ")}.`,
      });
    });
  }
  return COMMANDS[options.step as MoveStepName].run(ctx, options);
}
