/**
 * Creates a ready-to-open demo of the whole Cloclod experience, without touching a real GitHub
 * account. It contains a copy of the Lovable-style bakery app with the repo kit applied, a local
 * "GitHub" (a bare repository driven by Cloclod's fake adapter), and a draft with two saves.
 *
 *   pnpm build && pnpm tsx scripts/demo-workspace.mts [targetDir]
 *
 * Then open the printed folder in Claude Desktop's Code tab. The plugin must be loaded first; the
 * script prints the one setting to add.
 */
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { applyKit, detectProject, loadConfig, planKit } from "../packages/core/src/index.ts";

const repo = resolve(import.meta.dirname, "..");
const target = resolve(process.argv[2] ?? join(homedir(), "Cloclod Demo"));
const app = join(target, "crumb-site");
const origin = join(target, ".github-fake", "crumb-site.git");
const cli = join(repo, "packages/cli/dist/cloclod.mjs");
if (!existsSync(cli)) {
  console.error("Build first: pnpm build");
  process.exit(1);
}

const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", args, { cwd, stdio: "pipe" }).toString().trim();
const cloclod = (...args: string[]) =>
  execFileSync("node", [cli, ...args], {
    cwd: app,
    env: { ...process.env, CLODABLE_FAKE_GITHUB: origin },
    stdio: "pipe",
  });

rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });

// 1. The app, as Lovable would have pushed it to GitHub.
const source = join(repo, "examples/lovable-vite");
cpSync(source, app, {
  recursive: true,
  filter: (path) => !path.includes("node_modules") && !path.includes("/dist"),
});
symlinkSync(join(source, "node_modules"), join(app, "node_modules"), "dir");
git(app, "init", "-q", "-b", "main");
git(app, "config", "user.name", "Ada Builder");
git(app, "config", "user.email", "ada@example.com");
git(app, "add", "-A");
git(app, "commit", "-q", "-m", "Initial app from Lovable");
mkdirSync(join(target, ".github-fake"), { recursive: true });
execFileSync("git", ["clone", "-q", "--bare", app, origin]);
git(app, "remote", "add", "origin", origin);
git(app, "fetch", "-q", "origin");
git(app, "branch", "-q", "--set-upstream-to=origin/main", "main");

// 2. The repo kit, with the preview running Cloclod from this checkout instead of npm.
const project = await detectProject(app);
const changes = await planKit(project, await loadConfig(app), {
  devCommand: { executable: "node", args: [cli, "dev"] },
  liveUrl: "https://crumb-and-co.example",
});
await applyKit(app, changes);
// Point this demo's Claude sessions at the fake GitHub (local settings, never committed).
writeFileSync(
  join(app, ".claude/settings.local.json"),
  `${JSON.stringify({ env: { CLODABLE_FAKE_GITHUB: origin } }, null, 2)}\n`,
);
git(app, "add", "-A");
git(app, "commit", "-q", "-m", "Set up Cloclod");
git(app, "push", "-q", "origin", "main");

// 3. Two saves in a draft, so the Publish bar has something to show.
const edit = (file: string, from: string, to: string) => {
  const path = join(app, file);
  const text = execFileSync("cat", [path]).toString();
  writeFileSync(path, text.replace(from, to));
};
edit(
  "src/components/Hero.tsx",
  "Neighborhood bakery · Est. 2014",
  "Neighborhood bakery · Since 2014",
);
cloclod("save", "-m", "Say since 2014 in the hero badge");
edit("src/components/Hero.tsx", "That's the whole recipe.", "That's the whole recipe. Promise.");
cloclod("save", "-m", "Add a promise to the recipe card");

console.log(`
  Demo ready: ${app}

  1. Add Cloclod to Claude, once (Desktop picks it up too):
       claude plugin install cloclod --marketplace "${repo}"
  2. Open the folder above in Claude Desktop → Code (start a new session).
  3. Watch the Publish bar ("2 changes not live yet"), open /cloclod, try the preview toolbar,
     then click Publish. GitHub here is a local stand-in: ${origin}
`);
