import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { CloclodError } from "../errors.js";
import { type Flow, step } from "../events.js";
import { readSecret, storeSecret } from "../local-secrets.js";
import { type PackageManager, type ProjectInfo, runScriptCommand } from "../project.js";
import { appSettings, localSettings } from "../settings.js";
import type { Workspace } from "../workspace.js";
import { type Backend, backendEnv, backendOf } from "./backend.js";
import { homeKeys } from "./home.js";
import { NETLIFY_TOKEN, type NetlifyAccount, NetlifyApi, type NetlifySite } from "./netlify-api.js";
import { loadMove, updateMove, withNames } from "./state.js";
import { SupabaseApi } from "./supabase-api.js";

/**
 * The website's new home: a Netlify site, deployed by a GitHub Actions workflow on each Publish.
 * Netlify's free plan can't watch a private repository owned by a GitHub organization, and the
 * workflow can: it builds the app the way Lovable built it (the same package versions, from the
 * public registry when the lockfile names Lovable's private mirror) and records a GitHub deployment,
 * which is how Publish knows the site is live.
 */

export const NETLIFY_CLI = "netlify-cli@27.12.0";
export const WORKFLOW_PATH = ".github/workflows/cloclod-netlify.yml";
export const NETLIFY_TOML = "netlify.toml";

/** Lovable's private package mirror, in any region: same packages, same checksums as npm's. */
export const LOVABLE_MIRROR = "https://[a-z0-9-]+-npm\\.pkg\\.dev/lovable-core-prod/[a-z0-9-]+/";

// ── Connecting Netlify ───────────────────────────────────────────────────────

export async function connectNetlify(token: string): Promise<{ accounts: NetlifyAccount[] }> {
  const trimmed = token.trim();
  if (!/^[A-Za-z0-9_-]{20,}$/.test(trimmed)) {
    throw new CloclodError({
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
    return `# How Netlify builds this app (set up by Cloclod). Lovable's TanStack Start preset targets
# Cloudflare by default; NITRO_PRESET switches its server part to Netlify Functions.
[build]
  command = "${build}"
  publish = "dist"

[build.environment]
  NITRO_PRESET = "netlify"
`;
  }
  return `# How Netlify builds this app (set up by Cloclod).
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
 * with Netlify's own tool, and tell GitHub about the deployment so Cloclod's Publish can follow it.
 */
/** A GitHub Actions expression, written out for the workflow file. */
const gha = (expression: string) => ["$", "{{ ", expression, " }}"].join("");

export function netlifyWorkflow(project: ProjectInfo, liveBranch: string, siteUrl: string): string {
  const lockfile = lockfileOf(project.root);
  const repoApi = `repos/${gha("github.repository")}/deployments`;
  return [
    "# Puts the site live on Netlify each time it's published (set up by Cloclod).",
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
    throw new CloclodError({
      code: "move-not-ready",
      message: "Create your new backend first: the site needs it.",
      hint: "It's one of the first steps of the move.",
    });
  }
  const netlify = await NetlifyApi.required();
  const supabase = await SupabaseApi.required();
  const token = (await readSecret(NETLIFY_TOKEN))!;

  yield step("move:site", "running", "Preparing your website", "Creating the site");
  const site =
    (state.site ? await netlify.site(state.site.id).catch(() => undefined) : undefined) ??
    (await createNetlifySite(netlify, ws.project.name, options.account));
  const url = siteUrl(site);
  await updateMove(ws.root, (s) => {
    s.site = {
      id: site!.id,
      name: site!.name,
      url,
      admin: site!.admin_url,
      account: site!.account_slug,
    };
  });

  yield step("move:site", "running", "Preparing your website", "Pointing it at your new backend");
  const backend = backendOf(state.home.ref, await homeKeys(supabase, state.home.ref));
  const carried = await setSiteEnv(netlify, site, ws.root, backend);
  if (carried.length > 0) {
    await updateMove(ws.root, (s) => {
      s.siteSettings = withNames(s.siteSettings, carried);
    });
  }

  yield step("move:site", "running", "Preparing your website", "Setting up Publish");
  const files = await setUpPublish(ws, site, token);

  const settings = await siteSettingsOf(netlify, site.account_slug, site.id, ws.root);
  yield step(
    "move:site",
    "done",
    "Your website is prepared",
    "Nothing has been published. Continue the move in the panel.",
  );
  return { site: { name: site.name, url, admin: site.admin_url }, files, settings };
}

/** The site's address, https when Netlify has it. */
export const siteUrl = (site: NetlifySite) => site.ssl_url || site.url;

/**
 * A new site in the builder's Netlify team, named after the app (with a few letters added when
 * the name is taken: Netlify's names are unique across all of Netlify).
 */
export async function createNetlifySite(
  netlify: NetlifyApi,
  appName: string,
  team: string | undefined,
): Promise<NetlifySite> {
  const accounts = await netlify.accounts();
  const account =
    accounts.find((a) => a.slug === team) ?? (accounts.length === 1 ? accounts[0] : undefined);
  if (!account) {
    throw new CloclodError({
      code: "needs-choice",
      message: "Which Netlify team should the site go in?",
      hint: `Pick one: ${accounts.map((a) => `${a.name} (${a.slug})`).join(", ")}.`,
    });
  }
  const base = siteName(appName);
  for (const name of [base, `${base}-${Math.random().toString(36).slice(2, 6)}`]) {
    const site = await netlify.createSite(account.slug, name).catch((error: unknown) => {
      if (error instanceof CloclodError && /422/.test(error.details ?? "")) return undefined;
      throw error;
    });
    if (site) return site;
  }
  throw new CloclodError({
    code: "netlify-failed",
    message: "Netlify didn't accept a name for your site.",
    hint: "Try again: Cloclod picks another name.",
  });
}

/**
 * What the site's build and server code read: the backend's address and keys (the service key
 * kept secret), and the settings already pasted on this computer for the preview. Returns the
 * settings it carried over.
 */
export async function setSiteEnv(
  netlify: NetlifyApi,
  site: Pick<NetlifySite, "id" | "account_slug">,
  root: string,
  backend: Backend | undefined,
): Promise<string[]> {
  const existing = await netlify.envKeys(site.account_slug, site.id);
  for (const [key, value] of Object.entries(backend ? backendEnv(backend) : {})) {
    await netlify.setEnv(site.account_slug, site.id, key, value, {
      secret: key === "SUPABASE_SERVICE_ROLE_KEY",
      existing,
    });
  }
  // VITE_ settings are built into the page on purpose: kept as secrets, Netlify's scan for leaked
  // secrets would stop the deploy.
  const { wanted } = await appSettings(root);
  const mine = await localSettings(root);
  const carried = wanted.filter((name) => mine[name] !== undefined);
  for (const name of carried) {
    await netlify.setEnv(site.account_slug, site.id, name, mine[name]!, {
      secret: !name.startsWith("VITE_"),
      existing,
    });
  }
  return carried;
}

/**
 * What lets each Publish put the site live: netlify.toml (unless the app has one), the workflow,
 * and the two GitHub secrets it reads. Returns the files written.
 */
export async function setUpPublish(
  ws: Workspace,
  site: Pick<NetlifySite, "id" | "url" | "ssl_url">,
  token: string,
): Promise<string[]> {
  const files: string[] = [];
  if (!existsSync(join(ws.root, NETLIFY_TOML))) {
    await writeFile(
      join(ws.root, NETLIFY_TOML),
      netlifyToml(ws.project, ws.config.app.buildScript),
    );
    files.push(NETLIFY_TOML);
  }
  const workflow = netlifyWorkflow(ws.project, ws.config.liveBranch, siteUrl(site as NetlifySite));
  const workflowPath = join(ws.root, WORKFLOW_PATH);
  const before = existsSync(workflowPath) ? await readFile(workflowPath, "utf8") : "";
  if (before !== workflow) {
    await mkdir(dirname(workflowPath), { recursive: true });
    await writeFile(workflowPath, workflow);
    files.push(WORKFLOW_PATH);
  }
  await ws.github.setSecret("NETLIFY_AUTH_TOKEN", token);
  await ws.github.setSecret("NETLIFY_SITE_ID", site.id);
  return files;
}

export async function siteSettingsOf(
  netlify: NetlifyApi,
  account: string,
  siteId: string,
  root: string,
) {
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
    throw new CloclodError({
      code: "move-not-ready",
      message: "Put your site on Netlify first.",
    });
  }
  return siteSettingsOf(await NetlifyApi.required(), state.site.account, state.site.id, ws.root);
}

/** Set one of the app's settings on the site. The value goes straight to Netlify, kept secret. */
export async function setSiteSetting(ws: Workspace, name: string, value: string) {
  if (!/^[A-Z][A-Z0-9_]*$/.test(name)) {
    throw new CloclodError({
      code: "invalid-config",
      message: `“${name}” isn't a setting name.`,
      hint: "Use capitals, digits and underscores.",
    });
  }
  if (!value.trim()) {
    throw new CloclodError({ code: "invalid-config", message: "That setting is empty." });
  }
  const state = await loadMove(ws.root);
  if (!state.site) {
    throw new CloclodError({ code: "move-not-ready", message: "Put your site on Netlify first." });
  }
  const netlify = await NetlifyApi.required();
  await netlify.setEnv(state.site.account, state.site.id, name, value.replace(/\r?\n$/, ""), {
    secret: true,
  });
  await updateMove(ws.root, (s) => {
    s.siteSettings = withNames(s.siteSettings, [name]);
  });
  return siteSettings(ws);
}
