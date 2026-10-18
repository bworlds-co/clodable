import { createHash } from "node:crypto";
import { existsSync, realpathSync } from "node:fs";
import { chmod, mkdir, readFile, rm } from "node:fs/promises";
import { basename, join } from "node:path";
import { configDir, writeJsonFile } from "../places.js";
import type { ExportSummary } from "./export.js";
import type { RecordedFacts } from "./facts.js";
import type { RehearsalObservation } from "./rehearsal.js";

/**
 * Where a move off Lovable stands, on this computer: `.clodable/local/move.json` (git-ignored).
 * Only names, counts and dates: no value of a secret, no row of data. The export itself and
 * anything with people's data in it live outside the project, in `moveDir()`.
 */

export const MOVE_PATH = ".clodable/local/move.json";

export interface MoveState {
  version: 1;
  /**
   * How the live app moves: `careful` (a pause and a last export at the end, so nothing people
   * write is lost) or `quick` (a prototype: one export, then live). Asked first.
   */
  method?: "careful" | "quick";
  /** The Lovable Cloud project the app uses today. */
  source?: { ref: string };
  /** The builder's Supabase organization the new backend lives in. */
  org?: { slug: string; name: string; plan?: string };
  /** The builder's own Supabase project: the working copy, and later the real thing. */
  home?: {
    ref: string;
    name: string;
    region: string;
    createdAt: string;
    /** Clodable made it, so Clodable may reset its database password. */
    createdByClodable: boolean;
  };
  /** The Lovable export read into the protected folder. */
  export?: { file: string; importedAt: string; summary: ExportSummary };
  /** The data copied into the new backend. */
  data?: { at: string; ok: boolean; problems: string[]; fixes: string[] };
  /** Latest destructive copy attempt; old rehearsal evidence becomes stale immediately. */
  copyStartedAt?: string;
  /** Dated feature checks. Local only, no secret values or rows of personal data. */
  rehearsal?: RehearsalObservation[];
  /** Uploaded files copied over. */
  files?: {
    at: string;
    copied: number;
    total: number;
    /** Buckets whose files need the old backend's service key, which Clodable doesn't have yet. */
    waiting: string[];
    tooBig: number;
    failed: number;
  };
  /** Backend functions deployed to the new backend. */
  functions?: {
    at: string;
    deployed: string[];
    failed: string[];
    /** Secrets they read that the new backend didn't have then (names only). */
    missing?: string[];
  };
  /** Secret names set on the new backend (never their values). */
  secrets?: string[];
  /** Vault secret names set on the new backend (never their values). */
  vault?: string[];
  /** What the app uses, as Claude found it in the code before the move started. */
  facts?: RecordedFacts;
  /**
   * What the builder chose to go on without, so its step counts as done: the app's settings on
   * the site, the functions' secrets, the database's encrypted secrets.
   */
  skipped?: { settings?: string; secrets?: string; vault?: string };
  /** The website's new home on Netlify, deployed from GitHub Actions on each Publish. */
  site?: {
    id: string;
    name: string;
    url: string;
    admin: string;
    account: string;
    /** The last Publish that updated it (Publish follows the deploy). */
    liveAt?: string;
  };
  /**
   * Lovable's own services the app used (its AI gateway, its email API, its connectors), switched
   * to the builder's: which AI provider, and when the app's email key and the sign-in email hook
   * were set up.
   */
  services?: {
    ai?: { provider: string; at: string };
    appEmailsAt?: string;
    hookAt?: string;
    /** The builder goes on without switching: those features stop when Lovable goes. */
    skippedAt?: string;
  };
  /** Google sign-in on the new backend: when it was set up, or skipped (it stays off). */
  google?: { at?: string; skippedAt?: string };
  /**
   * The app's own domain, moved to Netlify after going live: the records the builder sets at their
   * domain's provider, and when they were seen. `skipped`: the Netlify address is the app's address.
   */
  domain?: {
    name?: string;
    records?: Array<{ type: string; name: string; value: string }>;
    readyAt?: string;
    skipped?: boolean;
  };
  /** The app's own settings set on the site (names only). */
  siteSettings?: string[];
  /** Emails for real people, sent through the builder's Resend account from their own domain. */
  emails?: {
    domain: string;
    domainId: string;
    sender: string;
    /** "verified" once the DNS records are in place. */
    status: string;
    /** The DNS records to add: public values, no secret. */
    records: Array<{
      type: string;
      name: string;
      value: string;
      priority?: number;
      status?: string;
    }>;
    /** Supabase sends through Resend (with a key that can only send from this domain). */
    connectedAt?: string;
  };
  /** The switch: the live app moves over. */
  switch?: {
    /** The builder paused changes on the live app (Lovable Cloud) with the line Clodable gave. */
    frozenAt?: string;
    /** The builder goes live without emails of their own (no domain yet). */
    noEmailsAt?: string;
    /** What the app's API roles could do before the pause, to give back on the new backend. */
    grants?: Record<string, Record<string, string[]>>;
    /** Clodable pointed everything at the new backend and site; the next Publish puts it live. */
    liveAt?: string;
    /** The builder finished in Lovable (Cloud removed, GitHub sync off). */
    finishedAt?: string;
  };
  /** Which backend the preview talks to. */
  preview?: "live" | "copy";
  /** The last full check of the copy. */
  checks?: { at: string; ok: boolean; items: MoveCheck[] };
}

export interface MoveCheck {
  id: string;
  ok: boolean;
  /** In the builder's words: "57 people can sign in". */
  label: string;
  detail?: string;
}

export async function loadMove(root: string): Promise<MoveState> {
  const path = join(root, MOVE_PATH);
  if (!existsSync(path)) return { version: 1 };
  try {
    const parsed = JSON.parse(await readFile(path, "utf8")) as MoveState;
    return parsed && parsed.version === 1 ? parsed : { version: 1 };
  } catch {
    return { version: 1 };
  }
}

/** Names the move has recorded (settings, secrets…), with more added: each once, sorted. */
export function withNames(recorded: string[] | undefined, more: string[]): string[] {
  return [...new Set([...(recorded ?? []), ...more])].sort();
}

export function saveMove(root: string, state: MoveState): Promise<void> {
  return writeJsonFile(join(root, MOVE_PATH), state);
}

/** Change the move's state in place and save it. */
export async function updateMove(
  root: string,
  change: (state: MoveState) => void,
): Promise<MoveState> {
  const state = await loadMove(root);
  change(state);
  await saveMove(root, state);
  return state;
}

/**
 * This app's private folder for the move, outside the project so neither git nor Claude reads it
 * by accident, and readable by this user only: the export, its table of contents, the list of
 * files, and the logs of the copy. Removed when the move is done.
 */
export async function moveDir(root: string): Promise<string> {
  let real = root;
  try {
    real = realpathSync(root);
  } catch {
    // keep the path as given
  }
  const id = createHash("sha256").update(real).digest("hex").slice(0, 10);
  const name =
    basename(real)
      .replace(/[^\w.-]/g, "_")
      .slice(0, 40) || "app";
  const dir = join(configDir(), "moves", `${name}-${id}`);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  await chmod(dir, 0o700).catch(() => {});
  return dir;
}

/** Remove everything the move kept on this computer for this app. */
export async function forgetMoveFiles(root: string): Promise<void> {
  await rm(await moveDir(root), { recursive: true, force: true });
}
