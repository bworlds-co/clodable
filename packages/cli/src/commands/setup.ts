import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { confirm, isCancel, select, spinner } from "@clack/prompts";
import {
  applyKit,
  ClodableError,
  detectProject,
  exec,
  GhCli,
  GITLEAKS_VERSION,
  Git,
  gitleaksBinary,
  hasCommand,
  type KitChange,
  loadConfig,
  loadMove,
  lovableAiLeft,
  type ProjectConfig,
  parseGitHubRemote,
  planKit,
  publish,
  save,
  supabaseRef,
} from "@clodable/core";
import pc from "picocolors";
import { type Context, drive, run } from "../context.js";
import { ash, celadon, clay, link, ochre, oxide } from "../ui.js";

export interface DoctorItem {
  id: string;
  label: string;
  status: "ok" | "warn" | "fail" | "info";
  detail?: string;
  fix?: string;
}

const MIN_NODE = [20, 19] as const;

export async function doctor(cwd: string): Promise<DoctorItem[]> {
  const items: DoctorItem[] = [];
  const [major = 0, minor = 0] = process.versions.node.split(".").map(Number);
  const nodeOk = major > MIN_NODE[0] || (major === MIN_NODE[0] && minor >= MIN_NODE[1]);
  items.push({
    id: "node",
    label: "Node.js",
    status: nodeOk ? "ok" : "fail",
    detail: `v${process.versions.node}`,
    ...(nodeOk ? {} : { fix: "Install Node.js 22 or newer from https://nodejs.org" }),
  });

  const gitOk = await hasCommand("git", cwd);
  items.push({
    id: "git",
    label: "Git",
    status: gitOk ? "ok" : "fail",
    ...(gitOk
      ? {}
      : {
          fix:
            process.platform === "darwin"
              ? "Run `xcode-select --install`, then try again"
              : "Install Git from https://git-scm.com/downloads",
        }),
  });

  // Fetches the pinned gitleaks the first time, so the first save doesn't wait for it.
  const scanner = await gitleaksBinary().then(
    (path) => ({ ok: true as const, path }),
    (error: unknown) => ({ ok: false as const, reason: String((error as Error).message ?? error) }),
  );
  items.push({
    id: "secrets",
    label: "Secret-key check",
    status: scanner.ok ? "ok" : "fail",
    ...(scanner.ok
      ? {
          detail: scanner.path === "gitleaks" ? "gitleaks (yours)" : `gitleaks ${GITLEAKS_VERSION}`,
        }
      : {
          detail: scanner.reason,
          fix: "Check your internet connection. Until it works, saves stay on this computer.",
        }),
  });

  const gh = new GhCli(cwd);
  const ready = await gh.ready();
  items.push({
    id: "gh",
    label: "GitHub CLI",
    status: ready.installed ? "ok" : "fail",
    ...(ready.installed ? {} : { fix: "Install it from https://cli.github.com" }),
  });
  if (ready.installed) {
    let login: string | undefined;
    if (ready.authenticated)
      login = await gh
        .viewer()
        .then((v) => v.login)
        .catch(() => undefined);
    items.push({
      id: "github",
      label: "GitHub account",
      status: login ? "ok" : "fail",
      ...(login
        ? { detail: `@${login}` }
        : { fix: "Run `gh auth login --web` to connect your account" }),
    });
  }

  const git = new Git(cwd);
  const isRepo = gitOk && (await git.isRepo());
  const remote = isRepo ? await git.remoteUrl("origin") : undefined;
  const parsed = remote ? parseGitHubRemote(remote) : undefined;
  items.push({
    id: "repo",
    label: "Your app on GitHub",
    status: parsed ? "ok" : "fail",
    ...(parsed
      ? { detail: `${parsed.owner}/${parsed.repo}` }
      : { fix: "Run `clodable setup` in an empty folder to bring your app in from GitHub" }),
  });
  if (!isRepo) return items;

  const root = await git.root();
  const project = await detectProject(root);
  const typeLabel =
    project.appType === "tanstack-start"
      ? "TanStack Start app"
      : project.appType === "vite-spa"
        ? "Vite + React app"
        : "Unknown app type";
  items.push({
    id: "app",
    label: "App",
    status: project.appType === "unknown" ? "warn" : "ok",
    detail: `${typeLabel}${project.lovable.generated ? ", made with Lovable" : ""}`,
  });

  items.push({
    id: "deps",
    label: "App dependencies",
    status: existsSync(join(root, "node_modules")) ? "ok" : "warn",
    ...(existsSync(join(root, "node_modules"))
      ? {}
      : { fix: `Run \`${project.packageManager} install\`` }),
  });

  const config = await loadConfig(root);
  const kit = await planKit(project, config);
  const missing = kit.filter((c) => c.action === "create");
  items.push({
    id: "kit",
    label: "Clodable in this project",
    status: missing.length === 0 ? "ok" : "warn",
    ...(missing.length === 0
      ? {}
      : { detail: `${missing.length} file(s) missing`, fix: "Run `clodable kit --apply`" }),
  });

  const ref = supabaseRef(config, project);
  items.push(
    config.backend === "lovable-cloud"
      ? {
          id: "supabase",
          label: "Database",
          status: "info",
          detail: "On Lovable Cloud: Lovable owns it, so Claude can't change it from here",
          fix: "Move off Lovable, in the Clodable panel, to make it yours",
        }
      : {
          id: "supabase",
          label: "Database",
          status: ref ? "ok" : "info",
          detail: ref
            ? `Supabase project ${ref}`
            : project.supabase.used
              ? "Supabase (project not found in code)"
              : "None",
        },
  );

  // Lovable's GitHub sync commits as a bot. Recent bot commits on the live branch mean it's still
  // connected; once the move is finished (the builder disconnected it), only newer ones count.
  const recent = await git.log(`origin/${config.liveBranch}`, { firstParent: true, limit: 30 });
  const move = await loadMove(project.root);
  const since = Math.max(
    Date.now() - 7 * 24 * 3600_000,
    move.switch?.finishedAt ? Date.parse(move.switch.finishedAt) : 0,
  );
  const lovableBot = recent.some(
    (c) => /gpt-engineer-app|lovable/i.test(c.author) && Date.parse(c.date) > since,
  );
  // While the app still runs on Lovable, its link to GitHub and its AI are expected: turning them
  // off comes at the end of the move, never before.
  const onLovable =
    config.backend === "lovable-cloud" ||
    config.hosting === "lovable" ||
    config.backend === "unknown" ||
    config.hosting === "unknown";
  if (lovableBot) {
    items.push(
      onLovable
        ? {
            id: "lovable-sync",
            label: "Lovable",
            status: "info",
            detail: "Changes made in Lovable come here too, through GitHub",
          }
        : {
            id: "lovable-sync",
            label: "Lovable",
            status: "warn",
            detail: "Lovable still pushes changes straight to your live site",
            fix: "In Lovable: More → Settings → Git → GitHub → Disconnect",
          },
    );
  }
  // Lovable's AI with no key of the builder's: on Lovable, the move switches it; off it, it fails.
  const aiLeft = await lovableAiLeft(project.root);
  if (aiLeft) {
    // Claude's names can hold commas ("Summarize, on each note"): quoted, they read as names.
    const names = aiLeft.features.map((f) => `“${f}”`);
    const what =
      names.length === 0
        ? "Your app's AI features don't"
        : `${names.length === 1 ? names[0]! : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`} ${names.length === 1 ? "doesn't" : "don't"}`;
    items.push(
      onLovable
        ? {
            id: "lovable-ai",
            label: "Lovable AI",
            status: "info",
            detail: "Your app uses Lovable's AI; the move switches it to your own key",
          }
        : {
            id: "lovable-ai",
            label: "Lovable AI",
            status: "warn",
            detail: `${what} work: ${names.length === 1 ? "it calls" : "they call"} Lovable's AI, which your app no longer has`,
            fix: "Claude can switch it to an AI key of your own",
          },
    );
  }
  return items;
}

const MARK = { ok: celadon("✓"), warn: ochre("!"), fail: oxide("✕"), info: ash("·") };

function renderDoctor(ctx: Context, items: DoctorItem[]) {
  ctx.out.header("doctor");
  for (const item of items) {
    ctx.out.line(
      `${MARK[item.status]} ${item.label.padEnd(26)}${item.detail ? ash(item.detail) : ""}`,
    );
    if (item.fix && item.status !== "ok") ctx.out.line(`  ${ash("→")} ${item.fix}`);
  }
  ctx.out.line();
}

export async function doctorCommand(ctx: Context) {
  await run(
    ctx,
    () => doctor(ctx.cwd),
    (items) => renderDoctor(ctx, items),
  );
}

function renderKit(ctx: Context, changes: KitChange[], applied: boolean) {
  for (const change of changes) {
    const tag =
      change.action === "create"
        ? clay("new    ")
        : change.action === "update"
          ? ochre("update ")
          : ash("ok     ");
    ctx.out.line(`${tag} ${change.path.padEnd(24)} ${ash(change.purpose)}`);
  }
  ctx.out.line();
  if (!applied && changes.some((c) => c.action !== "unchanged")) {
    ctx.out.line(ash("Nothing written yet. Run with --apply to add these files."));
    ctx.out.line();
  }
}

export async function kitCommand(ctx: Context, options: { apply?: boolean; liveUrl?: string }) {
  let full: KitChange[] = [];
  await run(
    ctx,
    async () => {
      const ws = await ctx.workspace({ requireSetup: false });
      full = await planKit(
        ws.project,
        ws.config,
        options.liveUrl ? { liveUrl: options.liveUrl } : {},
      );
      if (options.apply) await applyKit(ws.root, full);
      return {
        applied: Boolean(options.apply),
        changes: full.map(({ path, action, purpose }) => ({ path, action, purpose })),
      };
    },
    (data) => {
      ctx.out.header(options.apply ? "repo kit added" : "repo kit");
      renderKit(ctx, full, data.applied);
    },
  );
}

/** Interactive setup for the terminal. Claude Desktop's setup wizard uses the same steps through `--json`. */
/** Ask where the data and the live site are, unless already known. No database means "none". */
async function whereItRuns(
  project: Awaited<ReturnType<typeof detectProject>>,
  current: {
    backend: ProjectConfig["backend"];
    hosting: ProjectConfig["hosting"];
    interactive: boolean;
  },
): Promise<Pick<ProjectConfig, "backend" | "hosting">> {
  let { backend, hosting } = current;
  if (backend === "unknown" && !project.supabase.used) backend = "none";
  if (backend === "unknown" && current.interactive) {
    const choice = await select({
      message: "Where does your app's data live?",
      options: [
        {
          value: "lovable-cloud" as const,
          label: "On Lovable Cloud",
          hint: "you see it under Cloud in Lovable",
        },
        {
          value: "supabase" as const,
          label: "In my own Supabase project",
          hint: "you can open it at supabase.com",
        },
      ],
    });
    if (!isCancel(choice)) backend = choice;
  }
  if (hosting === "unknown" && current.interactive) {
    const choice = await select({
      message: "Where is your site live?",
      options: [
        { value: "lovable" as const, label: "On Lovable", hint: "you click Publish in Lovable" },
        {
          value: "github" as const,
          label: "Elsewhere (Netlify, Vercel…)",
          hint: "it updates when GitHub changes",
        },
      ],
    });
    if (!isCancel(choice)) hosting = choice;
  }
  return { backend, hosting };
}

export async function setupCommand(
  ctx: Context,
  options: {
    repo?: string;
    yes?: boolean;
    publish?: boolean;
    backend?: ProjectConfig["backend"];
    hosting?: ProjectConfig["hosting"];
  },
) {
  const interactive = !ctx.out.json && process.stdin.isTTY && !options.yes;
  await run(
    ctx,
    async () => {
      ctx.out.header("let's bring your app home");
      const tools = await doctor(ctx.cwd);
      const blocking = tools.filter(
        (t) => ["node", "git", "gh", "github"].includes(t.id) && t.status === "fail",
      );
      if (!ctx.out.json)
        for (const t of tools.filter((t) => ["node", "git", "gh", "github"].includes(t.id))) {
          ctx.out.line(`${MARK[t.status]} ${t.label.padEnd(26)}${t.detail ? ash(t.detail) : ""}`);
          if (t.fix && t.status !== "ok") ctx.out.line(`  ${ash("→")} ${t.fix}`);
        }
      if (blocking.length > 0) {
        throw new ClodableError({
          code: blocking.some((b) => b.id === "github") ? "gh-auth" : "gh-missing",
          message: "A few tools are needed first.",
          hint: blocking
            .map((b) => b.fix)
            .filter(Boolean)
            .join("\n    "),
        });
      }

      let root = ctx.cwd;
      const git = new Git(ctx.cwd);
      if (!(await git.isRepo())) {
        let repo = options.repo;
        if (!repo && interactive) {
          const list = await exec(
            "gh",
            [
              "repo",
              "list",
              "--limit",
              "40",
              "--json",
              "nameWithOwner,description,updatedAt",
              "--source",
            ],
            { cwd: ctx.cwd },
          );
          const repos = JSON.parse(list.stdout || "[]") as Array<{
            nameWithOwner: string;
            description: string | null;
          }>;
          const choice = await select({
            message: "Which app should Clodable open?",
            options: repos.map((r) => ({
              value: r.nameWithOwner,
              label: r.nameWithOwner,
              hint: r.description ?? "",
            })),
          });
          if (isCancel(choice))
            throw new ClodableError({ code: "unknown", message: "Setup cancelled." });
          repo = choice;
        }
        if (!repo) {
          throw new ClodableError({
            code: "not-a-repo",
            message: "Which app should Clodable open?",
            hint: "Run `clodable setup --repo owner/name`.",
          });
        }
        const empty = readdirSync(ctx.cwd).filter((n) => !n.startsWith(".")).length === 0;
        const target = empty ? ctx.cwd : join(ctx.cwd, repo.split("/")[1]!);
        const s = interactive ? spinner() : undefined;
        s?.start(`Bringing in ${repo}`);
        const cloned = await exec("gh", ["repo", "clone", repo, target], {
          cwd: ctx.cwd,
          timeout: 10 * 60_000,
        });
        if (cloned.exitCode !== 0) {
          s?.error(`Couldn't bring in ${repo}`);
          throw new ClodableError({
            code: "not-found",
            message: `Couldn't bring in ${repo}.`,
            details: cloned.stderr,
          });
        }
        s?.stop(`Brought in ${repo}`);
        root = target;
      } else {
        root = await git.root();
      }

      const project = await detectProject(root);
      const loaded = await loadConfig(root);
      // Where the data and the live site are decides what Clodable can do for this app.
      const config = {
        ...loaded,
        ...(await whereItRuns(project, {
          backend: options.backend ?? loaded.backend,
          hosting: options.hosting ?? loaded.hosting,
          interactive,
        })),
      };
      const changes = await planKit(project, config);
      if (!ctx.out.json) {
        ctx.out.line();
        ctx.out.line(pc.bold("Clodable adds a few plain files to your project:"));
        renderKit(ctx, changes, true);
      }
      if (interactive) {
        const ok = await confirm({ message: "Add them?" });
        if (isCancel(ok) || !ok)
          throw new ClodableError({
            code: "unknown",
            message: "Setup cancelled. Nothing was changed.",
          });
      }
      await applyKit(root, changes);

      if (!existsSync(join(root, "node_modules"))) {
        const s = interactive ? spinner() : undefined;
        s?.start("Installing your app's packages (a minute or two)");
        const installed = await exec(project.packageManager, ["install"], {
          cwd: root,
          timeout: 15 * 60_000,
        });
        if (installed.exitCode === 0) s?.stop("Packages installed");
        else s?.error("Packages couldn't be installed. You can retry later with npm install.");
      }

      const ws = await (await import("@clodable/core")).Workspace.open({
        cwd: root,
        ...(ctx.github ? { github: ctx.github } : {}),
      });
      const saved = await save(ws, { message: "Set up Clodable", kind: "setup" });
      let published = false;
      if (saved.saved && (options.publish || (interactive && (await confirmPublish())))) {
        await drive(ctx, publish(ws, { message: "Set up Clodable" }));
        published = true;
      }
      return {
        root,
        appType: project.appType,
        files: changes.filter((c) => c.action !== "unchanged").map((c) => c.path),
        saved: saved.saved,
        published,
      };
    },
    (data) => {
      ctx.out.line();
      ctx.out.line(`${celadon("●")} ${pc.bold("Your app is ready.")}`);
      ctx.out.line();
      ctx.out.line(`  1. Open Claude Desktop → Code, and choose this folder: ${link(data.root)}`);
      ctx.out.line("  2. The preview starts by itself. Ask for any change, in your own words.");
      ctx.out.line("  3. When you're happy, click Publish.");
      ctx.out.line();
    },
  );
}

async function confirmPublish(): Promise<boolean> {
  const ok = await confirm({
    message: "Publish the setup now? It only adds Clodable's files. Your site looks the same.",
    initialValue: true,
  });
  return !isCancel(ok) && ok;
}
