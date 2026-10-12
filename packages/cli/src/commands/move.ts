import { isCancel, password } from "@clack/prompts";
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
} from "@clodable/core";
import { type Context, drive, run } from "../context.js";
import { ash, celadon, clay, link, ochre } from "../ui.js";

const SETTINGS = {
  backend: ["lovable-cloud", "supabase", "none"],
  hosting: ["lovable", "github"],
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

export const MOVE_STEPS = [
  "check",
  "facts",
  "status",
  "connect",
  "choices",
  "create",
  "export",
  "copy",
  "verify",
  "diagnose",
  "files",
  "functions",
  "secrets",
  "secret",
  "vault",
  "vault-secret",
  "preview",
  "netlify",
  "teams",
  "site",
  "settings",
  "setting",
  "method",
  "resend",
  "emails",
  "services",
  "ai",
  "app-emails",
  "google",
  "pause",
  "paused",
  "golive",
  "domain",
  "finished",
  "forget",
  "disconnect",
] as const;

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

/** Everything piped in, for values that must never be command-line arguments (keys, tokens). */
async function readStdin(): Promise<string | undefined> {
  if (process.stdin.isTTY) return undefined;
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  const text = Buffer.concat(chunks).toString("utf8").trim();
  return text || undefined;
}

/** A value from stdin, or typed in a hidden prompt in a terminal. */
async function secretInput(ctx: Context, message: string): Promise<string> {
  const piped = await readStdin();
  if (piped) return piped;
  if (!ctx.out.json && process.stdin.isTTY) {
    const typed = await password({ message });
    if (!isCancel(typed) && typed.trim()) return typed.trim();
  }
  throw new ClodableError({
    code: "invalid-config",
    message: "Nothing was given.",
    hint: "Pipe the value in (never as an argument), or run this in a terminal to type it.",
  });
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

/** Moving off Lovable, step by step. Every step is safe to run again. */
export async function moveCommand(ctx: Context, options: MoveOptions) {
  const step = options.step;
  if (!(MOVE_STEPS as readonly string[]).includes(step)) {
    await run(ctx, async () => {
      throw new ClodableError({
        code: "not-found",
        message: `There's no move step called “${step}”.`,
        hint: `Use one of: ${MOVE_STEPS.join(", ")}.`,
      });
    });
    return;
  }

  switch (step) {
    case "check":
      return run(
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
      );

    case "status":
      return run(
        ctx,
        async () => moveProgress(await ctx.workspace()),
        (progress) => renderProgress(ctx, progress),
      );

    case "connect":
      return run(
        ctx,
        async () => {
          await ctx.workspace();
          const token = await secretInput(
            ctx,
            `Your Supabase access token (create one at ${TOKENS_PAGE})`,
          );
          return connectSupabase(token);
        },
        (data) => {
          ctx.out.line(`${celadon("✓")} Supabase is connected on this computer.`);
          for (const org of data.organizations) {
            ctx.out.line(ash(`  ${org.name} · ${org.plan} plan`));
          }
        },
      );

    case "choices":
      return run(
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
      );

    case "create":
      return run(
        ctx,
        async () => {
          const ws = await ctx.workspace();
          return drive(
            ctx,
            createHome(ws, {
              ...(options.org ? { org: options.org } : {}),
              ...(options.region ? { region: options.region } : {}),
              ...(options.name ? { name: options.name } : {}),
            }),
          );
        },
        (home) => ctx.out.line(ash(`  ${home.name} · ${home.region}`)),
      );

    case "export":
      return run(ctx, async () => {
        const ws = await ctx.workspace();
        return drive(ctx, importExport(ws, options.file ? { file: options.file } : {}));
      });

    case "copy":
      return run(ctx, async () => drive(ctx, copyData(await ctx.workspace())));

    case "verify":
      return run(
        ctx,
        async () => drive(ctx, checkCopy(await ctx.workspace())),
        (result) => {
          for (const check of result.checks) {
            ctx.out.line(`${check.ok ? celadon("✓") : ochre("!")} ${check.label}`);
            if (check.detail) ctx.out.line(ash(`  ${check.detail}`));
          }
        },
      );

    case "diagnose":
      return run(
        ctx,
        async () => diagnoseCopy(await ctx.workspace(), { fix: Boolean(options.fix) }),
        (result) => {
          ctx.out.header("your new backend");
          for (const finding of result.findings) {
            const mark = finding.fixed ? celadon("✓") : finding.ok ? celadon("✓") : ochre("!");
            ctx.out.line(
              `${mark} ${finding.label}${finding.fixed ? ash(" · fixed just now") : ""}`,
            );
            if (finding.detail) ctx.out.line(ash(`  ${finding.detail}`));
            if (finding.fix) ctx.out.line(ash(`  → ${finding.fix}`));
          }
        },
      );

    case "files":
      return run(ctx, async () => {
        const ws = await ctx.workspace();
        const sourceKey = options.private
          ? await secretInput(ctx, "Lovable Cloud's service key")
          : undefined;
        return drive(ctx, copyUploads(ws, sourceKey ? { sourceKey } : {}));
      });

    case "functions":
      return run(ctx, async () => drive(ctx, deployBackendFunctions(await ctx.workspace())));

    case "secrets":
      if (options.skip)
        return run(ctx, async () => skipLeftovers(await ctx.workspace(), "secrets"));
      return run(
        ctx,
        async () => functionSecretStatus(await ctx.workspace()),
        (status) => {
          for (const name of status.wanted) {
            ctx.out.line(`${status.set.includes(name) ? celadon("✓") : clay("●")} ${name}`);
          }
        },
      );

    case "facts":
      if (options.set) {
        return run(
          ctx,
          async () => {
            const json = await readStdin();
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
        );
      }
      return run(
        ctx,
        async () => moveFacts(await ctx.workspace()),
        ({ hints, facts }) => {
          ctx.out.header("what your app uses");
          ctx.out.line(facts ? factsSummary(facts) : ash("Not checked yet."));
          ctx.out.line("");
          ctx.out.line(ash("Clodable's scan, for Claude to check:"));
          ctx.out.line(JSON.stringify(hints, null, 2));
        },
      );

    case "secret":
      return run(
        ctx,
        async () => {
          const ws = await ctx.workspace();
          if (!options.arg) {
            throw new ClodableError({
              code: "invalid-config",
              message: "Which secret?",
              hint: "clodable move secret RESEND_API_KEY, with the value piped in.",
            });
          }
          const value = await secretInput(ctx, `The value of ${options.arg}`);
          return setFunctionSecret(ws, options.arg, value);
        },
        () => ctx.out.line(`${celadon("✓")} Saved in your new backend.`),
      );

    case "preview":
      return run(
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
      );

    case "netlify":
      return run(
        ctx,
        async () => {
          await ctx.workspace();
          const token = await secretInput(
            ctx,
            `Your Netlify access token (create one at ${NETLIFY_TOKENS_PAGE})`,
          );
          return connectNetlify(token);
        },
        (data) => {
          ctx.out.line(`${celadon("✓")} Netlify is connected on this computer.`);
          for (const account of data.accounts)
            ctx.out.line(ash(`  ${account.name} (${account.slug})`));
        },
      );

    case "teams":
      return run(
        ctx,
        async () => {
          await ctx.workspace();
          const api = await NetlifyApi.required();
          return { accounts: (await api.accounts()).map((a) => ({ slug: a.slug, name: a.name })) };
        },
        (data) => {
          for (const account of data.accounts)
            ctx.out.line(`${account.name} ${ash(`(${account.slug})`)}`);
        },
      );

    case "site":
      return run(
        ctx,
        async () => {
          const ws = await ctx.workspace();
          return drive(
            ctx,
            putSiteOnNetlify(ws, options.account ? { account: options.account } : {}),
          );
        },
        (outcome) => {
          ctx.out.line(ash(`  ${outcome.site.url}`));
          if (outcome.files.length > 0) ctx.out.line(ash(`  Added: ${outcome.files.join(", ")}`));
          const missing = outcome.settings.wanted.filter((n) => !outcome.settings.set.includes(n));
          if (missing.length > 0)
            ctx.out.line(ash(`  Settings your app reads, to fill in: ${missing.join(", ")}`));
          if (outcome.settings.lovable.length > 0) {
            ctx.out.line(ash(`  Lovable's own, for later: ${outcome.settings.lovable.join(", ")}`));
          }
        },
      );

    case "settings":
      if (options.skip) {
        return run(ctx, async () => skipLeftovers(await ctx.workspace(), "settings"));
      }
      return run(
        ctx,
        async () => siteSettings(await ctx.workspace()),
        (status) => {
          for (const name of status.wanted) {
            ctx.out.line(`${status.set.includes(name) ? celadon("✓") : clay("●")} ${name}`);
          }
          for (const name of status.lovable)
            ctx.out.line(`${ash("·")} ${name} ${ash("(Lovable's own)")}`);
        },
      );

    case "setting":
      return run(
        ctx,
        async () => {
          const ws = await ctx.workspace();
          if (!options.arg) {
            throw new ClodableError({
              code: "invalid-config",
              message: "Which setting?",
              hint: "clodable move setting GREETING, with the value piped in.",
            });
          }
          const value = await secretInput(ctx, `The value of ${options.arg}`);
          // For the preview too, not only the site: one paste, both places.
          await setSetting(ws, options.arg, value);
          return siteSettings(ws);
        },
        () => ctx.out.line(`${celadon("✓")} Saved on your Netlify site.`),
      );

    case "method":
      return run(
        ctx,
        async () => setMoveMethod(await ctx.workspace(), options.arg),
        (data) =>
          ctx.out.line(
            `${celadon("✓")} ${data.method === "quick" ? "In one go: no pause, no last export." : "Carefully: a short pause at the end, nothing lost."}`,
          ),
      );

    case "vault":
      if (options.skip) return run(ctx, async () => skipLeftovers(await ctx.workspace(), "vault"));
      return run(
        ctx,
        async () => vaultStatus(await ctx.workspace()),
        (status) => {
          for (const name of status.wanted) {
            ctx.out.line(`${status.set.includes(name) ? celadon("✓") : clay("●")} ${name}`);
          }
        },
      );

    case "vault-secret":
      return run(
        ctx,
        async () => {
          const ws = await ctx.workspace();
          const value = await secretInput(ctx, `The value of ${options.arg ?? "the secret"}`);
          return setVaultValue(ws, options.arg, value);
        },
        () => ctx.out.line(`${celadon("✓")} Saved in your new backend's vault.`),
      );

    case "resend":
      return run(
        ctx,
        async () => {
          await ctx.workspace();
          const key = await secretInput(
            ctx,
            `Your Resend key, with Full access (${RESEND_KEYS_PAGE})`,
          );
          return connectResend(key);
        },
        () => ctx.out.line(`${celadon("✓")} Resend is connected on this computer.`),
      );

    case "emails":
      return run(
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
      );

    case "services":
      if (options.skip) return run(ctx, async () => skipServices(await ctx.workspace()));
      return run(
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
          line(status.hook, status.hookOn, "Sign-in emails: your own templates (auth-email-hook)");
          for (const name of status.connectors)
            ctx.out.line(`${clay("●")} ${name}, through Lovable's connectors`);
        },
      );

    case "ai":
      return run(
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
      );

    case "google":
      return run(
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
      );

    case "app-emails":
      return run(
        ctx,
        async () => provisionAppEmails(await ctx.workspace()),
        (data) =>
          ctx.out.line(
            `${celadon("✓")} Your app has its own Resend key (RESEND_API_KEY), sending from ${data.sender}.`,
          ),
      );

    case "pause":
      return run(
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
      );

    case "paused":
      return run(
        ctx,
        async () => markFrozen(await ctx.workspace()),
        () =>
          ctx.out.line(
            `${celadon("✓")} Paused. Next: export from Lovable once more, then copy it in.`,
          ),
      );

    case "golive":
      return run(
        ctx,
        async () => {
          const ws = await ctx.workspace();
          return drive(
            ctx,
            goLive(ws, {
              ...(options.confirmEmail !== undefined ? { confirmEmail: options.confirmEmail } : {}),
              ...(options.signUp !== undefined ? { signUp: options.signUp } : {}),
            }),
          );
        },
        (outcome) => {
          if (outcome.files.length > 0) ctx.out.line(ash(`  Updated: ${outcome.files.join(", ")}`));
          if (outcome.jobs?.created)
            ctx.out.line(ash(`  Started ${outcome.jobs.created} scheduled job(s)`));
          ctx.out.line(`Publish to put it live at ${outcome.url}.`);
        },
      );

    case "domain":
      return run(
        ctx,
        async () => {
          const ws = await ctx.workspace();
          if (options.skip) return skipDomain(ws);
          return setDomain(ws, options.arg);
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
      );

    case "finished":
      return run(
        ctx,
        async () => markFinished(await ctx.workspace()),
        () =>
          ctx.out.line(
            `${celadon("✓")} Your app is off Lovable. Clodable deleted its copy of your export from this computer.`,
          ),
      );

    case "forget":
      return run(
        ctx,
        async () => {
          const ws = await ctx.workspace();
          await forgetMoveFiles(ws.root);
          return { forgotten: true };
        },
        () =>
          ctx.out.line(
            `${celadon("✓")} Removed the export and the move's files from this computer.`,
          ),
      );

    case "disconnect":
      return run(
        ctx,
        async () => {
          await forgetSecret(SUPABASE_TOKEN);
          return { disconnected: true };
        },
        () =>
          ctx.out.line(
            `${celadon("✓")} Supabase is disconnected here. Delete the token in Supabase too: ${TOKENS_PAGE}`,
          ),
      );
  }
}
