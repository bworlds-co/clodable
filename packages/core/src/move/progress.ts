import { readSecret } from "../local-secrets.js";
import { appSettings } from "../settings.js";
import type { Workspace } from "../workspace.js";
import { textFiles } from "./assess.js";
import { describeExport } from "./copy.js";
import { AUTO_VAULT } from "./extras.js";
import { factsSummary, type RecordedFacts } from "./facts.js";
import { EMAIL_QUEUE_KEY, literal } from "./fixes.js";
import { localFunctions, stripeWebhooks } from "./functions.js";
import { type GoogleStatus, googleStatus } from "./google.js";
import { homeSql } from "./home.js";
import { NETLIFY_TOKEN } from "./netlify-api.js";
import { rehearsalSummary } from "./rehearsal.js";
import { RESEND_KEY } from "./resend-api.js";
import {
  type ServicesStatus,
  servicesLeft,
  servicesStatus,
  usesLovableServices,
} from "./services.js";
import { loadMove, type MoveCheck, type MoveState } from "./state.js";
import { MOVE_PERMISSIONS, projectUrl, SUPABASE_TOKEN, SupabaseApi } from "./supabase-api.js";
import { exportTime, STOP_LOVABLE_JOBS } from "./switch.js";
import { count } from "./words.js";

/**
 * Where the move stands, step by step, for whoever draws it (the Clodable panel, the CLI): each
 * step done, next, later or needing attention, and what's left inside the open ones.
 */

export interface MoveStep {
  id:
    | "facts"
    | "connect"
    | "create"
    | "export"
    | "copy"
    | "files"
    | "functions"
    | "secrets"
    | "try"
    | "netlify"
    | "site"
    | "emails"
    | "services"
    | "google"
    | "freeze"
    | "final-export"
    | "final-copy"
    | "golive"
    | "domain"
    | "lovable";
  state: "done" | "next" | "later" | "attention";
  title: string;
  detail?: string;
}

export interface MoveProgress {
  steps: MoveStep[];
  home?: { ref: string; name: string; url: string; dashboard: string };
  preview: "live" | "copy";
  /** Database transfer checks only, at checksAt; not app feature testing. */
  checks?: MoveCheck[];
  checksAt?: string;
  /** Dated feature evidence, separate from database transfer checks. */
  rehearsal: ReturnType<typeof rehearsalSummary>;
  /** What the last file copy left: private folders waiting for Lovable Cloud's key, and more. */
  files?: { waiting: string[]; tooBig: number; failed: number };
  /**
   * The export says the app keeps Lovable Cloud's service key in its vault (Lovable's emails do):
   * the builder can read it there, which private folders need.
   */
  vaultKey: boolean;
  /** Backend functions in the app. */
  functions: number;
  /** Until Supabase is connected: what a scoped token needs, for people who'd rather not give full access. */
  tokenPermissions?: string[];
  /** The website's new home, once it's on Netlify; `liveAt`: the last Publish that updated it. */
  site?: { name: string; url: string; admin: string; liveAt?: string };
  /** Resend is connected on this computer. */
  resend: boolean;
  /** Emails for real people, through the builder's Resend account. */
  emails?: {
    domain: string;
    sender: string;
    status: string;
    records: Array<{ type: string; name: string; value: string; priority?: number }>;
    connected: boolean;
  };
  /** How the live app moves, once the builder chose. */
  method?: "careful" | "quick";
  /** The switch, as far as it went. `lastExport`: when Lovable made the latest export. */
  switch?: {
    frozenAt?: string;
    liveAt?: string;
    finishedAt?: string;
    noEmails?: boolean;
  };
  lastExport?: string;
  /**
   * In one go: the scheduled jobs that start on the new backend at go-live, and the line that
   * stops them in Lovable first, so they don't run twice.
   */
  lovableJobs?: { count: number; stop: string };
  /**
   * After going live: whether the app has sign-in, and the last sign-in on the new backend since.
   * Lovable's last steps wait for one: proof the app works there before its old home goes.
   */
  signIn?: { needed: boolean; at?: string };
  /**
   * On Supabase's free plan, when the app is larger than it holds (500 MB of data, 1 GB of files):
   * said before copying, while upgrading is still easy.
   */
  plan?: { data: number; dataLimit: number; files: number; filesLimit: number };
  /**
   * Backend functions that receive Stripe's webhooks, with their new address: the builder changes
   * it in Stripe and pastes the endpoint's new signing secret.
   */
  stripeWebhooks?: Array<{ name: string; url: string }>;
  /** Google sign-in: where it stands, and the redirect the builder's Google client allows. */
  google?: GoogleStatus;
  /** Lovable's own services the app uses, and what's left to switch. */
  services?: ServicesStatus & { left: string[] };
  /** The app's own domain while its records aren't seen yet: what to set at its provider. */
  domain?: { name: string; records: Array<{ type: string; name: string; value: string }> };
  /**
   * What keeps a step open after its main part is done (names only): the app's settings the site
   * doesn't have, the functions' secrets, the database's encrypted secrets.
   */
  settingsLeft?: string[];
  secretsLeft?: string[];
  vaultLeft?: string[];
  /** What the app uses, as Claude found it before the move started. */
  facts?: RecordedFacts;
  /**
   * The app's scheduled jobs call it with a key Lovable keeps (LOVABLE_CRON_SECRET): before going
   * live, Claude gives them one of the builder's own.
   */
  cronKey?: boolean;
}

/** Supabase's free plan: 500 MB of database, 1 GB of files. */
const FREE_DATA = 500 * 1024 ** 2;
const FREE_FILES = 1024 ** 3;

/**
 * When the app is larger than the free plan holds. The export is compressed: its data takes about
 * three times its size in the database, so that's what's compared.
 */
export function planLimits(
  state: MoveState,
): { data: number; dataLimit: number; files: number; filesLimit: number } | undefined {
  if (state.org?.plan !== "free" || !state.export) return undefined;
  const data = state.export.summary.bytes * 3;
  const files = state.export.summary.buckets.reduce((a, b) => a + b.bytes, 0);
  if (data <= FREE_DATA && files <= FREE_FILES) return undefined;
  return { data, dataLimit: FREE_DATA, files, filesLimit: FREE_FILES };
}

/** The latest sign-in on the new backend after `since`, if Clodable can look. */
async function signInSince(state: MoveState, since: string): Promise<string | undefined> {
  if (!state.home) return undefined;
  const api = await SupabaseApi.onThisComputer();
  if (!api) return undefined;
  const [row] = await homeSql(api, state.home.ref)
    .rows<{ at: string | null }>(
      `select max(last_sign_in_at)::text as at from auth.users where last_sign_in_at > ${literal(since)}::timestamptz`,
    )
    .catch(() => [] as Array<{ at: string | null }>);
  return row?.at ?? undefined;
}

/** Whether the app signs people in (its code calls Supabase Auth). */
async function usesSignIn(root: string): Promise<boolean> {
  const files = await textFiles(root, ["src"]);
  return files.some((f) =>
    /\.auth\.(signIn|signUp|getUser|getSession|onAuthStateChange)\b/.test(f.text),
  );
}

/** What the move's progress reads besides its own state: this computer, the app's code, its services. */
interface Surroundings {
  /** Accounts connected on this computer, for any app: one connected for another counts. */
  supabase: boolean;
  netlify: boolean;
  resend: boolean;
  /** The app's backend functions, and those that receive Stripe's webhooks. */
  functions: number;
  stripe: string[];
  /** The settings the app's server code reads. */
  settings: { wanted: string[]; lovable: string[] };
  services: ServicesStatus;
  google: GoogleStatus;
}

async function lookAround(ws: Workspace): Promise<Surroundings> {
  const functions = await localFunctions(ws.root);
  return {
    supabase: Boolean(await readSecret(SUPABASE_TOKEN)),
    netlify: Boolean(await readSecret(NETLIFY_TOKEN)),
    resend: Boolean(await readSecret(RESEND_KEY)),
    functions: functions.length,
    stripe: await stripeWebhooks(ws.root, functions),
    settings: await appSettings(ws.root),
    // Lovable's AI, email API and connectors stop working off Lovable: switched before going live.
    services: await servicesStatus(ws),
    // Google sign-in: Lovable's broker only works on Lovable.
    google: await googleStatus(ws),
  };
}

/**
 * The steps, in order: each done, next (the first that isn't), later, or needing attention. What's
 * still to do inside a step keeps it open, unless the builder goes on without it; that's returned
 * too, with how the live app moves.
 */
function moveSteps(state: MoveState, around: Surroundings) {
  const steps: MoveStep[] = [];
  const add = (s: Omit<MoveStep, "state">, done: boolean, attention = false) => {
    const before = steps.some((x) => x.state === "next" || x.state === "attention");
    steps.push({
      ...s,
      state: done ? "done" : attention ? "attention" : before ? "later" : "next",
    });
  };
  // First, Claude reads the app's code: what it uses decides the steps that follow.
  add(
    {
      id: "facts",
      title: "Look at your app",
      ...(state.facts ? { detail: factsSummary(state.facts) } : {}),
    },
    Boolean(state.facts),
  );
  // Accounts are connected per computer, not per app: one connected for another app shows done.
  const onThisComputer = { detail: "Connected on this computer" };
  add(
    {
      id: "connect",
      title: "Connect your Supabase account",
      ...(around.supabase ? onThisComputer : {}),
    },
    around.supabase,
  );
  add(
    {
      id: "create",
      title: "Create your new backend",
      ...(state.home ? { detail: `${state.home.name} · ${state.home.region}` } : {}),
    },
    Boolean(state.home),
  );
  add(
    {
      id: "export",
      title: "Export your data from Lovable",
      ...(state.export ? { detail: describeExport(state.export.summary) } : {}),
    },
    Boolean(state.export),
  );
  // What's still to do in a step keeps it open, unless the builder goes on without it.
  const vaultLeft = state.data
    ? (state.export?.summary.vaultSecrets ?? [])
        .filter((n) => !AUTO_VAULT.has(n) && !(state.vault ?? []).includes(n))
        .sort()
    : [];
  const vaultOpen = vaultLeft.length > 0 && !state.skipped?.vault;
  add(
    {
      id: "copy",
      title: "Copy it into your new backend",
      ...(state.data
        ? {
            detail: !state.data.ok
              ? "Some things need a look"
              : vaultOpen
                ? `${count(vaultLeft.length, "database secret")} to add`
                : "Everything is there",
          }
        : {}),
    },
    Boolean(state.data?.ok) && !vaultOpen,
    Boolean(state.data && !state.data.ok),
  );
  const fileCount = state.export?.summary.buckets.reduce((a, b) => a + b.files, 0) ?? 0;
  if (fileCount > 0) {
    add(
      {
        id: "files",
        title: "Copy your uploaded files",
        detail: state.files
          ? `${state.files.copied.toLocaleString("en-US")} of ${state.files.total.toLocaleString("en-US")} copied`
          : `${count(fileCount, "file")}`,
      },
      Boolean(state.files && state.files.copied >= state.files.total),
      Boolean(state.files && state.files.copied < state.files.total),
    );
  }
  const secretsLeft = (state.functions?.missing ?? []).filter(
    (n) => !(state.secrets ?? []).includes(n),
  );
  const secretsOpen = secretsLeft.length > 0 && !state.skipped?.secrets;
  if (around.functions > 0) {
    add(
      {
        id: "functions",
        title: "Deploy your backend functions",
        ...(state.functions
          ? {
              detail: secretsOpen
                ? `${count(secretsLeft.length, "secret key")} to add`
                : count(state.functions.deployed.length, "function"),
            }
          : {}),
      },
      Boolean(state.functions && state.functions.failed.length === 0) && !secretsOpen,
      Boolean(state.functions && state.functions.failed.length > 0),
    );
  }
  // In one go, going live is how the preview gets the new backend: no separate try.
  const method = state.method ?? (state.switch?.frozenAt ? "careful" : undefined);
  const onNewBackend = state.preview === "copy" || Boolean(state.switch?.liveAt);
  if (method !== "quick") {
    add(
      {
        id: "try",
        title: "Try your app on the copy",
        detail: onNewBackend
          ? "The preview uses your new backend"
          : "The preview still uses Lovable Cloud",
      },
      onNewBackend,
    );
  }
  add(
    {
      id: "netlify",
      title: "Connect your Netlify account",
      ...(around.netlify ? onThisComputer : {}),
    },
    around.netlify,
  );
  const settingsLeft = state.site
    ? around.settings.wanted.filter((n) => !(state.siteSettings ?? []).includes(n))
    : [];
  const settingsOpen = settingsLeft.length > 0 && !state.skipped?.settings;
  add(
    {
      id: "site",
      title: "Prepare your website",
      ...(state.site
        ? {
            detail: settingsOpen
              ? `${count(settingsLeft.length, "setting")} to add`
              : state.site.url,
          }
        : {}),
    },
    Boolean(state.site) && !settingsOpen,
  );
  const { services, google } = around;
  const servicesToDo = servicesLeft(
    services,
    Boolean(state.emails?.connectedAt),
    Boolean(state.switch?.noEmailsAt),
  );
  const frozenAt = state.switch?.frozenAt;
  add(
    {
      id: "emails",
      title: "Set up emails for your users",
      ...(state.emails?.connectedAt
        ? { detail: `From ${state.emails.sender}` }
        : state.switch?.noEmailsAt
          ? { detail: "Skipped for now: no password-reset emails" }
          : state.emails
            ? { detail: `${state.emails.domain}: waiting for its records` }
            : {}),
    },
    Boolean(state.emails?.connectedAt || state.switch?.noEmailsAt),
    Boolean(state.emails && !state.emails.connectedAt && !state.switch?.noEmailsAt),
  );
  if (usesLovableServices(services)) {
    const skipped = Boolean(state.services?.skippedAt) && servicesToDo.length > 0;
    add(
      {
        id: "services",
        title: "Switch off Lovable's services",
        ...(skipped
          ? {
              detail: `Skipped: ${servicesToDo.join(", ")} ${servicesToDo.length === 1 ? "stops" : "stop"} with Lovable`,
            }
          : servicesToDo.length > 0
            ? { detail: servicesToDo.join(" · ") }
            : {}),
      },
      servicesToDo.length === 0 || skipped,
    );
  }
  if (google.used) {
    add(
      {
        id: "google",
        title: "Google sign-in",
        ...(google.skipped && !google.configured
          ? { detail: "Skipped: it stays off on your new site" }
          : google.configured && !google.brokerOnly
            ? { detail: "On your new backend" }
            : {}),
      },
      (google.configured && !google.brokerOnly) || (google.skipped && !google.configured),
    );
  }
  // The quick way goes live from the first export: no pause, no last export.
  if (method !== "quick") {
    add(
      {
        id: "freeze",
        title: "Pause changes on your live app",
        ...(frozenAt ? { detail: `Since ${frozenAt.slice(11, 16)} UTC` } : {}),
      },
      Boolean(frozenAt),
    );
    const finalExport = Boolean(frozenAt && state.export && state.export.importedAt > frozenAt);
    add(
      {
        id: "final-export",
        title: "Export your data again",
        ...(finalExport && state.export ? { detail: describeExport(state.export.summary) } : {}),
      },
      finalExport,
    );
    const finalCopy = Boolean(frozenAt && state.data && state.data.at > frozenAt);
    add(
      { id: "final-copy", title: "Copy it in for good" },
      Boolean(finalCopy && state.data?.ok),
      Boolean(finalCopy && !state.data?.ok),
    );
  }
  add(
    {
      id: "golive",
      title: "Go live on your new backend and site",
      // Switched: Publish puts it live; once a Publish has, where it is.
      ...(state.switch?.liveAt
        ? {
            detail:
              state.site?.liveAt && state.site.liveAt > state.switch.liveAt
                ? `Live at ${state.site.url}`
                : "Publish puts it live",
          }
        : {}),
    },
    Boolean(state.switch?.liveAt),
  );
  const domain = state.domain;
  add(
    {
      id: "domain",
      title: "Your app's address",
      ...(domain?.readyAt && domain.name
        ? { detail: domain.name }
        : domain?.skipped && state.site
          ? { detail: new URL(state.site.url).host }
          : domain?.name
            ? { detail: `${domain.name}: waiting for its records` }
            : {}),
    },
    Boolean(domain?.readyAt || domain?.skipped),
    Boolean(domain?.name && !domain.readyAt),
  );
  add({ id: "lovable", title: "Finish in Lovable" }, Boolean(state.switch?.finishedAt));
  return {
    steps,
    method,
    servicesToDo,
    /** What keeps an open step open, by name. */
    left: {
      ...(settingsOpen ? { settingsLeft } : {}),
      ...(secretsOpen ? { secretsLeft } : {}),
      ...(vaultOpen ? { vaultLeft } : {}),
    },
  };
}

export async function moveProgress(ws: Workspace): Promise<MoveProgress> {
  const state = await loadMove(ws.root);
  const around = await lookAround(ws);
  const { services, google, stripe } = around;
  const { steps, method, servicesToDo, left } = moveSteps(state, around);
  // Before Lovable goes: has someone signed in on the new site? (Lovable's steps wait for it.)
  const finishing = Boolean(state.switch?.liveAt && !state.switch.finishedAt);
  const signIn = finishing ? await signInSince(state, state.switch!.liveAt!) : undefined;
  const plan = planLimits(state);
  const lastExport = exportTime(state.export?.summary.madeAt);
  const domain = state.domain;
  return {
    steps,
    ...(usesLovableServices(services) ? { services: { ...services, left: servicesToDo } } : {}),
    ...(plan ? { plan } : {}),
    ...(google.used ? { google } : {}),
    ...(state.home && stripe.length > 0
      ? {
          stripeWebhooks: stripe.map((name) => ({
            name,
            url: `${projectUrl(state.home!.ref)}/functions/v1/${name}`,
          })),
        }
      : {}),
    ...(finishing
      ? { signIn: { needed: await usesSignIn(ws.root), ...(signIn ? { at: signIn } : {}) } }
      : {}),
    ...(domain?.name && !domain.readyAt
      ? { domain: { name: domain.name, records: domain.records ?? [] } }
      : {}),
    ...(state.facts ? { facts: state.facts } : {}),
    ...left,
    ...(!state.switch?.liveAt &&
    (state.facts
      ? state.facts.scheduledJobs.length > 0
      : (state.export?.summary.scheduledJobs.length ?? 0) > 0) &&
    around.settings.lovable.some((k) => k.startsWith("LOVABLE_CRON"))
      ? { cronKey: true }
      : {}),
    ...(state.home
      ? {
          home: {
            ref: state.home.ref,
            name: state.home.name,
            url: projectUrl(state.home.ref),
            dashboard: `https://supabase.com/dashboard/project/${state.home.ref}`,
          },
        }
      : {}),
    rehearsal: rehearsalSummary(state),
    preview: state.preview ?? "live",
    ...(state.checks
      ? {
          checksAt: state.checks.at,
          checks: state.checks.items.map((item) =>
            item.id === "old-backend" && item.ok
              ? {
                  ...item,
                  label:
                    "The checked database functions and webhooks no longer name the old backend",
                }
              : item,
          ),
        }
      : {}),
    ...(state.files
      ? {
          files: {
            waiting: state.files.waiting,
            tooBig: state.files.tooBig,
            failed: state.files.failed,
          },
        }
      : {}),
    vaultKey: Boolean(state.export?.summary.vaultSecrets.includes(EMAIL_QUEUE_KEY)),
    functions: around.functions,
    ...(around.supabase ? {} : { tokenPermissions: MOVE_PERMISSIONS }),
    ...(state.site
      ? {
          site: {
            name: state.site.name,
            url: state.site.url,
            admin: state.site.admin,
            ...(state.site.liveAt ? { liveAt: state.site.liveAt } : {}),
          },
        }
      : {}),
    resend: around.resend,
    ...(method ? { method } : {}),
    ...(state.emails
      ? {
          emails: {
            domain: state.emails.domain,
            sender: state.emails.sender,
            status: state.emails.status,
            records: state.emails.records.map((r) => ({
              type: r.type,
              name: r.name,
              value: r.value,
              ...(r.priority !== undefined ? { priority: r.priority } : {}),
            })),
            connected: Boolean(state.emails.connectedAt),
          },
        }
      : {}),
    ...(state.switch
      ? {
          switch: {
            ...(state.switch.frozenAt ? { frozenAt: state.switch.frozenAt } : {}),
            ...(state.switch.liveAt ? { liveAt: state.switch.liveAt } : {}),
            ...(state.switch.finishedAt ? { finishedAt: state.switch.finishedAt } : {}),
            ...(state.switch.noEmailsAt ? { noEmails: true } : {}),
          },
        }
      : {}),
    ...(method === "quick" &&
    !state.switch?.liveAt &&
    (state.export?.summary.scheduledJobs.length ?? 0) > 0
      ? {
          lovableJobs: {
            count: state.export?.summary.scheduledJobs.length ?? 0,
            stop: STOP_LOVABLE_JOBS,
          },
        }
      : {}),
    ...(lastExport ? { lastExport: lastExport.toISOString() } : {}),
  };
}
