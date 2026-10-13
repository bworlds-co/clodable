import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { ClodableError } from "../errors.js";
import { type Flow, step } from "../events.js";
import { readSecret, storeSecret } from "../local-secrets.js";
import { type PackageManager, type ProjectInfo, runScriptCommand } from "../project.js";
import { localSettings } from "../settings.js";
import type { Workspace } from "../workspace.js";
import { textFiles } from "./assess.js";
import { backendEnv, backendOf } from "./backend.js";
import { homeKeys } from "./flows.js";
import { NETLIFY_TOKEN, type NetlifyAccount, NetlifyApi } from "./netlify-api.js";
import { loadMove, updateMove } from "./state.js";
import { SupabaseApi } from "./supabase-api.js";

/**
 * The website's new home: a Netlify site, deployed by a GitHub Actions workflow on each Publish.
 * Netlify's free plan can't watch a private repository owned by a GitHub organization, and the
 * workflow can: it builds the app the way Lovable built it (the same package versions, from the
 * public registry when the lockfile names Lovable's private mirror) and records a GitHub deployment,
 * which is how Publish knows the site is live.
 */

export const NETLIFY_CLI = "netlify-cli@27.12.0";
export const WORKFLOW_PATH = ".github/workflows/clodable-netlify.yml";
export const NETLIFY_TOML = "netlify.toml";

/** Lovable's private package mirror, in any region: same packages, same checksums as npm's. */
export const LOVABLE_MIRROR = "https://[a-z0-9-]+-npm\\.pkg\\.dev/lovable-core-prod/[a-z0-9-]+/";

// ── Connecting Netlify ───────────────────────────────────────────────────────

export async function connectNetlify(token: string): Promise<{ accounts: NetlifyAccount[] }> {
  const trimmed = token.trim();
  if (!/^[A-Za-z0-9_-]{20,}$/.test(trimmed)) {
    throw new ClodableError({
      code: "netlify-auth",
      message: "That doesn't look like a Netlify access token.",
      hint: "In Netlify: User settings → Applications → Personal access tokens → New access token.",
    });
  }
  const api = new NetlifyApi(trimmed);
  await api.user();
  const accounts = await api.accounts();
  await storeSecret(NETLIFY_TOKEN, trimmed);
  return { accounts: accounts.map((a) => ({ id: a.id, slug: a.slug, name: a.name })) };
}

// ── The files Netlify and GitHub need ────────────────────────────────────────

function lockfileOf(root: string): string | undefined {
  return ["bun.lock", "package-lock.json", "pnpm-lock.yaml", "yarn.lock", "bun.lockb"].find((f) =>
    existsSync(join(root, f)),
  );
}

/** netlify.toml: how Netlify builds this app (Lovable's TanStack template, or a plain Vite app). */
export function netlifyToml(project: ProjectInfo, buildScript: string): string {
  const [command, args] = runScriptCommand(project.packageManager, buildScript);
  const build = [command, ...args.filter((a) => a !== "--silent")].join(" ");
  if (project.appType === "tanstack-start") {
    return `# How Netlify builds this app (set up by Clodable). Lovable's TanStack Start preset targets
# Cloudflare by default; NITRO_PRESET switches its server part to Netlify Functions.
[build]
  command = "${build}"
  publish = "dist"

[build.environment]
  NITRO_PRESET = "netlify"
`;
  }
  return `# How Netlify builds this app (set up by Clodable).
[build]
  command = "${build}"
  publish = "dist"

# A single-page app: every address loads it, and it shows the right page.
[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
`;
}

function installSteps(pm: PackageManager, lockfile: string | undefined): string[] {
  const rewrite = (file: string) =>
    `          sed -E -i 's#${LOVABLE_MIRROR}#https://registry.npmjs.org/#g' ${file} || true`;
  switch (pm) {
    case "bun":
      return [
        "      - uses: oven-sh/setup-bun@v2",
        "      - name: Install the app's packages",
        "        run: |",
        "          # Lovable's lockfiles can name its private package mirror: the same versions come from npm.",
        ...(lockfile === "bun.lock"
          ? [rewrite("bun.lock"), "          bun install --frozen-lockfile"]
          : ["          bun install"]),
      ];
    case "pnpm":
      return [
        "      - name: Install the app's packages",
        "        run: |",
        rewrite("pnpm-lock.yaml"),
        "          corepack enable",
        "          pnpm install --frozen-lockfile",
      ];
    case "yarn":
      return [
        "      - name: Install the app's packages",
        "        run: |",
        rewrite("yarn.lock"),
        "          corepack enable",
        "          yarn install --frozen-lockfile",
      ];
    default:
      return [
        "      - name: Install the app's packages",
        "        run: |",
        ...(lockfile === "package-lock.json"
          ? [rewrite("package-lock.json"), "          npm ci"]
          : ["          npm install"]),
      ];
  }
}

/**
 * The workflow that puts the site live on each Publish (a push to main): install, build and deploy
 * with Netlify's own tool, and tell GitHub about the deployment so Clodable's Publish can follow it.
 */
/** A GitHub Actions expression, written out for the workflow file. */
const gha = (expression: string) => ["$", "{{ ", expression, " }}"].join("");

export function netlifyWorkflow(project: ProjectInfo, liveBranch: string, siteUrl: string): string {
  const lockfile = lockfileOf(project.root);
  const repoApi = `repos/${gha("github.repository")}/deployments`;
  return [
    "# Puts the site live on Netlify each time it's published (set up by Clodable).",
    "# Netlify's free plan can't watch a private repository owned by an organization; this can.",
    "name: Netlify",
    "on:",
    "  push:",
    `    branches: [${liveBranch}]`,
    "  workflow_dispatch:",
    "permissions:",
    "  contents: read",
    "  deployments: write",
    "concurrency:",
    "  group: netlify-production",
    "  cancel-in-progress: false",
    "jobs:",
    "  live:",
    "    runs-on: ubuntu-latest",
    "    steps:",
    "      - uses: actions/checkout@v5",
    "      - uses: actions/setup-node@v5",
    "        with:",
    "          node-version: 22",
    "      - name: Tell GitHub a deployment started",
    "        id: start",
    "        env:",
    `          GH_TOKEN: ${gha("github.token")}`,
    "        run: |",
    `          id=$(echo '{"ref":"${gha("github.sha")}","environment":"production","production_environment":true,"auto_merge":false,"required_contexts":[]}' | gh api ${repoApi} --input - --jq .id)`,
    `          gh api ${repoApi}/$id/statuses -f state=in_progress > /dev/null`,
    '          echo "id=$id" >> "$GITHUB_OUTPUT"',
    ...installSteps(project.packageManager, lockfile),
    "      - name: Build and put it live on Netlify",
    "        env:",
    `          NETLIFY_AUTH_TOKEN: ${gha("secrets.NETLIFY_AUTH_TOKEN")}`,
    `          NETLIFY_SITE_ID: ${gha("secrets.NETLIFY_SITE_ID")}`,
    `          VERSION: ${gha("github.sha")}`,
    `        run: npx --yes ${NETLIFY_CLI} deploy --build --prod --message "Published $VERSION"`,
    "      - name: Tell GitHub it's live",
    "        if: success()",
    "        env:",
    `          GH_TOKEN: ${gha("github.token")}`,
    `        run: gh api ${repoApi}/${gha("steps.start.outputs.id")}/statuses -f state=success -f environment_url=${siteUrl} -f log_url=${gha("github.server_url")}/${gha("github.repository")}/actions/runs/${gha("github.run_id")} > /dev/null`,
    "      - name: Tell GitHub it didn't go live",
    "        if: failure() && steps.start.outputs.id",
    "        env:",
    `          GH_TOKEN: ${gha("github.token")}`,
    `        run: gh api ${repoApi}/${gha("steps.start.outputs.id")}/statuses -f state=failure -f log_url=${gha("github.server_url")}/${gha("github.repository")}/actions/runs/${gha("github.run_id")} > /dev/null`,
    "",
  ].join("\n");
}

// ── The app's own settings ───────────────────────────────────────────────────

/** Settings the host provides on its own, or that Clodable sets from the new backend. */
const PROVIDED =
  /^(NODE_ENV|PORT|CI|HOST|NETLIFY.*|CONTEXT|URL|DEPLOY_URL|VERCEL.*|SUPABASE_[A-Z_]+|VITE_[A-Z_]+)$/;

/**
 * The settings the app's server code reads (`process.env.X`): on Lovable's hosting, Lovable keeps
 * them; now the builder gives them to the site. Lovable's own (LOVABLE_*) are listed apart: they
 * only work on Lovable, and their features need switching to the builder's own service.
 */
export async function appSettings(root: string): Promise<{ wanted: string[]; lovable: string[] }> {
  const files = await textFiles(root, ["src", "server", "app"]);
  const names = new Set<string>();
  for (const file of files) {
    for (const match of file.text.matchAll(
      /process\.env(?:\.([A-Z][A-Z0-9_]*)|\[\s*["'`]([A-Z][A-Z0-9_]*)["'`]\s*\])/g,
    )) {
      const name = (match[1] ?? match[2])!;
      if (!PROVIDED.test(name)) names.add(name);
    }
    // `const { STRIPE_KEY, RESEND_KEY: resend } = process.env`
    for (const match of file.text.matchAll(/\{([^{}]+)\}\s*=\s*process\.env\b/g)) {
      for (const part of match[1]!.split(",")) {
        const name = part.split(":")[0]!.split("=")[0]!.trim();
        if (/^[A-Z][A-Z0-9_]*$/.test(name) && !PROVIDED.test(name)) names.add(name);
      }
    }
  }
  const all = [...names].sort();
  return {
    wanted: all.filter((n) => !n.startsWith("LOVABLE_")),
    lovable: all.filter((n) => n.startsWith("LOVABLE_")),
  };
}

// ── Creating the site ────────────────────────────────────────────────────────

const siteName = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "app";

export interface SiteOutcome {
  site: { name: string; url: string; admin: string };
  files: string[];
  settings: { wanted: string[]; set: string[]; lovable: string[] };
}

export async function* putSiteOnNetlify(
  ws: Workspace,
  options: { account?: string } = {},
): Flow<SiteOutcome> {
  const state = await loadMove(ws.root);
  if (!state.home) {
    throw new ClodableError({
      code: "move-not-ready",
      message: "Create your new backend first: the site needs it.",
      hint: "It's one of the first steps of the move.",
    });
  }
  const netlify = await NetlifyApi.required();
  const supabase = await SupabaseApi.required();
  const token = (await readSecret(NETLIFY_TOKEN))!;

  yield step("move:site", "running", "Putting your site on Netlify", "Creating the site");
  let site = state.site ? await netlify.site(state.site.id).catch(() => undefined) : undefined;
  if (!site) {
    const accounts = await netlify.accounts();
    const account =
      accounts.find((a) => a.slug === options.account) ??
      (accounts.length === 1 ? accounts[0] : undefined);
    if (!account) {
      throw new ClodableError({
        code: "move-not-ready",
        message: "Which Netlify team should the site go in?",
        hint: `Pick one: ${accounts.map((a) => `${a.name} (${a.slug})`).join(", ")}.`,
      });
    }
    const base = siteName(ws.project.name);
    for (const name of [base, `${base}-${Math.random().toString(36).slice(2, 6)}`]) {
      site = await netlify.createSite(account.slug, name).catch((error: unknown) => {
        if (error instanceof ClodableError && /422/.test(error.details ?? "")) return undefined;
        throw error;
      });
      if (site) break;
    }
    if (!site) {
      throw new ClodableError({
        code: "netlify-failed",
        message: "Netlify didn't accept a name for your site.",
        hint: "Try again: Clodable picks another name.",
      });
    }
  }
  const url = site.ssl_url || site.url;
  await updateMove(ws.root, (s) => {
    s.site = {
      id: site!.id,
      name: site!.name,
      url,
      admin: site!.admin_url,
      account: site!.account_slug,
    };
  });

  yield step(
    "move:site",
    "running",
    "Putting your site on Netlify",
    "Pointing it at your new backend",
  );
  const backend = backendOf(state.home.ref, await homeKeys(supabase, state.home.ref));
  const existing = await netlify.envKeys(site.account_slug, site.id);
  for (const [key, value] of Object.entries(backendEnv(backend))) {
    await netlify.setEnv(site.account_slug, site.id, key, value, {
      secret: key === "SUPABASE_SERVICE_ROLE_KEY",
      existing,
    });
  }
  // Settings already pasted on this computer (for the preview) go to the site too. VITE_ ones are
  // built into the page on purpose: kept as secrets, Netlify's scan for leaked secrets would stop
  // the deploy.
  const { wanted } = await appSettings(ws.root);
  const mine = await localSettings(ws.root);
  const carried = wanted.filter((name) => mine[name] !== undefined);
  for (const name of carried) {
    await netlify.setEnv(site.account_slug, site.id, name, mine[name]!, {
      secret: !name.startsWith("VITE_"),
      existing,
    });
  }
  if (carried.length > 0) {
    await updateMove(ws.root, (s) => {
      s.siteSettings = [...new Set([...(s.siteSettings ?? []), ...carried])].sort();
    });
  }

  yield step("move:site", "running", "Putting your site on Netlify", "Setting up Publish");
  const files: string[] = [];
  if (!existsSync(join(ws.root, NETLIFY_TOML))) {
    await writeFile(
      join(ws.root, NETLIFY_TOML),
      netlifyToml(ws.project, ws.config.app.buildScript),
    );
    files.push(NETLIFY_TOML);
  }
  const workflow = netlifyWorkflow(ws.project, ws.config.liveBranch, url);
  const workflowPath = join(ws.root, WORKFLOW_PATH);
  const before = existsSync(workflowPath) ? await readFile(workflowPath, "utf8") : "";
  if (before !== workflow) {
    await mkdir(dirname(workflowPath), { recursive: true });
    await writeFile(workflowPath, workflow);
    files.push(WORKFLOW_PATH);
  }
  await ws.github.setSecret("NETLIFY_AUTH_TOKEN", token);
  await ws.github.setSecret("NETLIFY_SITE_ID", site.id);

  const settings = await siteSettingsOf(netlify, site.account_slug, site.id, ws.root);
  yield step("move:site", "done", "Your site is ready on Netlify", `Publish to see it at ${url}`);
  return { site: { name: site.name, url, admin: site.admin_url }, files, settings };
}

async function siteSettingsOf(netlify: NetlifyApi, account: string, siteId: string, root: string) {
  const { wanted, lovable } = await appSettings(root);
  const have = new Set(await netlify.envKeys(account, siteId));
  return { wanted, set: wanted.filter((n) => have.has(n)), lovable };
}

/** The app's settings on the site: which it reads, which are set (names only). */
export async function siteSettings(
  ws: Workspace,
): Promise<{ wanted: string[]; set: string[]; lovable: string[] }> {
  const state = await loadMove(ws.root);
  if (!state.site) {
    throw new ClodableError({
      code: "move-not-ready",
      message: "Put your site on Netlify first.",
    });
  }
  return siteSettingsOf(await NetlifyApi.required(), state.site.account, state.site.id, ws.root);
}

/** Set one of the app's settings on the site. The value goes straight to Netlify, kept secret. */
export async function setSiteSetting(ws: Workspace, name: string, value: string) {
  if (!/^[A-Z][A-Z0-9_]*$/.test(name)) {
    throw new ClodableError({
      code: "invalid-config",
      message: `“${name}” isn't a setting name.`,
      hint: "Use capitals, digits and underscores.",
    });
  }
  if (!value.trim()) {
    throw new ClodableError({ code: "invalid-config", message: "That setting is empty." });
  }
  const state = await loadMove(ws.root);
  if (!state.site) {
    throw new ClodableError({ code: "move-not-ready", message: "Put your site on Netlify first." });
  }
  const netlify = await NetlifyApi.required();
  await netlify.setEnv(state.site.account, state.site.id, name, value.replace(/\r?\n$/, ""), {
    secret: true,
  });
  await updateMove(ws.root, (s) => {
    s.siteSettings = [...new Set([...(s.siteSettings ?? []), name])].sort();
  });
  return siteSettings(ws);
}
