import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { type ProjectConfig, saveConfig } from "./config.js";
import { CloclodError } from "./errors.js";
import { type Flow, step } from "./events.js";
import { applyKit, planKit } from "./kit/index.js";
import { readSecret, storeSecret } from "./local-secrets.js";
import { costOf, type HomeChoices, homeChoices, type OrganizationChoice } from "./move/account.js";
import { type Backend, backendOf, envWith } from "./move/backend.js";
import { homeKeys, newPassword, passwordKey, waitUntilUp } from "./move/home.js";
import { NETLIFY_TOKEN, NetlifyApi, type NetlifySite } from "./move/netlify-api.js";
import { liveSignIn, newBackendSignIn } from "./move/sign-in.js";
import {
  createNetlifySite,
  setSiteEnv,
  setUpPublish,
  siteSettingsOf,
  siteUrl,
} from "./move/site.js";
import { loadMove } from "./move/state.js";
import { projectUrl, SupabaseApi } from "./move/supabase-api.js";
import { detectProject } from "./project.js";
import { rememberSettings } from "./settings.js";
import type { Workspace } from "./workspace.js";

/**
 * An app that isn't online yet gets a site, and an app without a backend gets one: on the builder's
 * own Netlify and Supabase accounts, with the same pieces the move off Lovable uses. Each Publish
 * then puts the site live there, through GitHub. Tokens stay on this computer; what's recorded in
 * the project (the site, the project's id) is nothing secret.
 */

// ── What's there, and what's possible ────────────────────────────────────────

export interface SiteChoices {
  /** Netlify is connected on this computer. */
  connected: boolean;
  /** The Netlify teams the site can go in, once connected. */
  teams: Array<{ slug: string; name: string }>;
  /** The app's site, once Cloclod put it on Netlify. */
  site?: ProjectConfig["netlify"];
}

export async function siteChoices(ws: Workspace): Promise<SiteChoices> {
  const netlify = await NetlifyApi.onThisComputer();
  const teams = netlify ? await netlify.accounts() : [];
  return {
    connected: Boolean(netlify),
    teams: teams.map((t) => ({ slug: t.slug, name: t.name })),
    ...(ws.config.netlify ? { site: ws.config.netlify } : {}),
  };
}

export interface BackendChoices extends Partial<HomeChoices> {
  /** Supabase is connected on this computer. */
  connected: boolean;
  /** What a new project costs in each organization, in plain words. */
  costs?: Record<string, string>;
}

export async function backendChoices(): Promise<BackendChoices> {
  if (!(await SupabaseApi.onThisComputer())) return { connected: false };
  const choices = await homeChoices();
  return {
    connected: true,
    ...choices,
    costs: Object.fromEntries(choices.organizations.map((o) => [o.slug, costOf(o)])),
  };
}

// ── The site ─────────────────────────────────────────────────────────────────

export interface OnlineSite {
  name: string;
  url: string;
  admin: string;
  account: string;
}

export interface SiteOnlineOutcome {
  site: OnlineSite;
  /** The files written for Publish: they go online with the next Publish. */
  files: string[];
  /** The settings the app's server code reads, and which the site has. */
  settings: { wanted: string[]; set: string[]; lovable: string[] };
}

/**
 * Put the app online on the builder's own Netlify: a site named after the app, the backend's
 * address and keys and the settings pasted here, and what each Publish needs to put it live there.
 * Running it again after a failure picks up where it was. An unavailable remembered site is
 * an access problem to resolve, never permission to create a replacement.
 */
export async function* putSiteOnline(
  ws: Workspace,
  options: { team?: string } = {},
): Flow<SiteOnlineOutcome> {
  const move = await loadMove(ws.root);
  if (move.site || move.home) {
    throw new CloclodError({
      code: "already-there",
      message: "Your move off Lovable puts your site on Netlify.",
      hint: "Go on with the move: its website step does this, pointed at your new backend.",
    });
  }
  const netlify = await NetlifyApi.required();
  const token = (await readSecret(NETLIFY_TOKEN))!;

  yield step("site", "running", "Setting up hosting", "Creating your site on Netlify");
  const known = ws.config.netlify ? await netlify.site(ws.config.netlify.siteId) : undefined;
  const site = known ?? (await createNetlifySite(netlify, ws.project.name, options.team));
  const url = siteUrl(site);
  const online: OnlineSite = {
    name: site.name,
    url,
    admin: site.admin_url,
    account: site.account_slug,
  };
  // Recorded at once: a second run finds the site instead of making another.
  await saveConfig(ws.root, {
    ...ws.config,
    netlify: { siteId: site.id, ...online },
  });

  yield step("site", "running", "Setting up hosting", "Giving it your app's settings");
  const backend = await ownBackend(ws.config);
  const carried = await setSiteEnv(netlify, site, ws.root, backend?.keys);
  if (carried.length > 0) {
    const state = await ws.state();
    await ws.updateState({
      siteSettings: [...new Set([...(state.siteSettings ?? []), ...carried])].sort(),
    });
  }
  // Sign-in links in emails come back to the site.
  if (backend) await liveSignIn(backend.api, backend.keys.ref, url);

  yield step("site", "running", "Setting up hosting", "Setting up Publish");
  const files = await setUpPublish(ws, site, token);
  const config: ProjectConfig = {
    ...ws.config,
    hosting: "github",
    liveUrl: url,
    netlify: { siteId: site.id, ...online },
  };
  await saveConfig(ws.root, config);
  await applyKit(ws.root, await planKit(await detectProject(ws.root), config));
  const settings = await siteSettingsOf(netlify, site.account_slug, site.id, ws.root);
  yield step("site", "done", "Your site is ready", `Publish to put it online at ${url}`);
  return { site: online, files, settings };
}

/** The app's own Supabase, when this computer can reach it: its address and keys. */
async function ownBackend(
  config: ProjectConfig,
): Promise<{ api: SupabaseApi; keys: Backend } | undefined> {
  const ref = config.supabase.projectRef;
  if (config.backend !== "supabase" || !ref) return undefined;
  const api = await SupabaseApi.onThisComputer();
  if (!api) return undefined;
  return { api, keys: backendOf(ref, await homeKeys(api, ref)) };
}

// ── The backend ──────────────────────────────────────────────────────────────

export interface BackendOutcome {
  ref: string;
  name: string;
  region: string;
  url: string;
  /** The project in Supabase's dashboard. */
  dashboard: string;
  /** The app's files that now name it. */
  files: string[];
}

/** The files Lovable's templates read the backend's public address and key from. */
const ENV_FILE = ".env";

/**
 * A backend for an app that has none: a project on the builder's own Supabase (free to start), its
 * public address and key in the app's `.env`, its server keys for the preview on this computer and
 * on the site, sign-in ready for the preview and the site. Claude writes the code that uses it.
 * Running it again picks up the project an earlier run started.
 */
export async function* createBackend(
  ws: Workspace,
  options: { org?: string; region?: string } = {},
): Flow<BackendOutcome> {
  if (ws.config.backend === "lovable-cloud") {
    throw new CloclodError({
      code: "already-there",
      message: "Your app's data is on Lovable Cloud.",
      hint: "Moving off Lovable gives your app its own Supabase, with your data and your people.",
    });
  }
  if (ws.config.backend === "supabase" && ws.config.supabase.projectRef) {
    throw new CloclodError({
      code: "already-there",
      message: "Your app already has its own backend on Supabase.",
    });
  }
  const api = await SupabaseApi.required();

  yield step("backend", "running", "Creating your backend");
  // An earlier run made the project, then stopped: carry on with it.
  const earlier = ws.config.supabase.projectRef;
  const started = earlier ? await api.project(earlier) : undefined;
  let ref: string;
  if (started) {
    ref = started.ref;
  } else {
    const { organizations, freeProjects } = await homeChoices();
    const org = pickOrganization(organizations, options.org);
    if (org.plan === "free" && org.freeLeft === 0) {
      throw new CloclodError({
        code: "supabase-limit",
        message: "Your Supabase account already runs its 2 free projects.",
        hint: `Pause one in Supabase (${freeProjects.map((p) => p.name).join(", ")}), or pick an organization on a paid plan, then try again.`,
      });
    }
    const region =
      options.region ?? (await api.regions(org.slug).catch(() => undefined))?.recommended?.code;
    if (!region) {
      throw new CloclodError({
        code: "needs-choice",
        message: "Which part of the world should your backend run in?",
        hint: "Pick the region closest to the people who use your app.",
      });
    }
    const password = newPassword();
    const created = await api.createProject({
      name: ws.project.name.slice(0, 60),
      org: org.slug,
      password,
      region,
    });
    await storeSecret(passwordKey(created.ref), password);
    ref = created.ref;
    // Recorded at once: a second run waits for this project instead of making another.
    await saveConfig(ws.root, {
      ...ws.config,
      supabase: { ...ws.config.supabase, projectRef: ref },
    });
  }
  yield step("backend", "running", "Creating your backend", "Starting it up: about 2 minutes");
  await waitUntilUp(api, ref);
  const project = await api.project(ref);

  yield step("backend", "running", "Creating your backend", "Connecting your app to it");
  const backend = backendOf(ref, await homeKeys(api, ref));
  const files: string[] = [];
  // The public address and key: Lovable's templates read them from .env, which goes to GitHub.
  const envPath = join(ws.root, ENV_FILE);
  const before = existsSync(envPath) ? await readFile(envPath, "utf8") : "";
  const after = envWith(before, {
    VITE_SUPABASE_PROJECT_ID: ref,
    VITE_SUPABASE_PUBLISHABLE_KEY: backend.publishable,
    VITE_SUPABASE_URL: backend.url,
  });
  if (after !== before) {
    await writeFile(envPath, after);
    files.push(ENV_FILE);
  }
  // The server's keys, for the preview's server code: on this computer only, never in a file.
  await rememberSettings(ws.root, {
    SUPABASE_URL: backend.url,
    SUPABASE_PUBLISHABLE_KEY: backend.publishable,
    SUPABASE_SERVICE_ROLE_KEY: backend.serviceRole,
  });
  await newBackendSignIn(api, ref, ws.config.netlify?.url ?? ws.config.liveUrl);
  // The site, if Cloclod put it online: the same address and keys for its build and server.
  const netlify = ws.config.netlify ? await NetlifyApi.onThisComputer() : undefined;
  if (ws.config.netlify && netlify) {
    await setSiteEnv(
      netlify,
      { id: ws.config.netlify.siteId, account_slug: ws.config.netlify.account } as NetlifySite,
      ws.root,
      backend,
    );
  }
  const config: ProjectConfig = {
    ...ws.config,
    backend: "supabase",
    supabase: { ...ws.config.supabase, projectRef: ref },
  };
  await saveConfig(ws.root, config);
  await applyKit(ws.root, await planKit(await detectProject(ws.root), config));
  yield step("backend", "done", "Your backend is ready", project.name);
  return {
    ref,
    name: project.name,
    region: project.region,
    url: projectUrl(ref),
    dashboard: `https://supabase.com/dashboard/project/${ref}`,
    files,
  };
}

function pickOrganization(organizations: OrganizationChoice[], slug: string | undefined) {
  const org =
    organizations.find((o) => o.slug === slug) ??
    (organizations.length === 1 ? organizations[0] : undefined);
  if (!org) {
    throw new CloclodError({
      code: "needs-choice",
      message: "Which Supabase organization should your backend go in?",
      hint: `Pick one: ${organizations.map((o) => `${o.name} (${costOf(o)})`).join(", ")}.`,
    });
  }
  return org;
}
