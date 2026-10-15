// Shapes of Clodable's reactive session state, and the state contract the engine checks.

/** What `clodable status --json` reports, trimmed to what the bar and the panel draw. */
export interface ClodableStatus {
  ready: true;
  project: string;
  unpublished: Array<{ sha: string; subject: string; date: string; kind: string | null }>;
  merging: boolean;
  conflicts: string[];
  liveUrl: string | null;
  lastPublish: {
    sha: string;
    title: string;
    at: string;
    url: string | null;
    /** No host ever reported putting the app online: it's on GitHub only. */
    noHost?: boolean;
  } | null;
  pullRequest: { number: number; url: string } | null;
  /** Where the data lives. On Lovable Cloud, the database and backend can't be changed from here. */
  backend: "unknown" | "lovable-cloud" | "supabase" | "none";
  /**
   * Who puts the site live. Lovable's hosting needs a click in Lovable after Publish; `none`: not
   * online yet, and Clodable can put it on the builder's own Netlify.
   */
  hosting: "unknown" | "github" | "lovable" | "none";
  /** The project in Lovable's editor, when known. */
  lovableUrl: string | null;
  /** The app was made with Lovable: where its data and site are matter, so the panel asks. */
  madeWithLovable: boolean;
  /** A move off Lovable has started and isn't over: the panel opens on it. */
  movingOffLovable: boolean;
  /** Moving off Lovable: live on the new backend, the last clicks in Lovable still to do. */
  finishingMove: boolean;
  /** When the move off Lovable ended. */
  movedAt: string | null;
  /**
   * On its own Supabase, or with no backend yet: whether Supabase is connected here (Claude's
   * database changes, a new backend).
   */
  databaseConnected: boolean | null;
  /** The site Clodable put on the builder's Netlify, and whether a Publish put it online yet. */
  site: { url: string; admin: string; live: boolean } | null;
  /** Not online yet: whether Netlify is connected here, to put the site online. */
  netlifyConnected: boolean | null;
}

/** Why the bar shows "set up" instead of the draft. */
export interface ClodableNotReady {
  ready: false;
  reason: "not-a-repo" | "no-kit" | "no-github" | "unknown";
  message: string;
  fix?: string;
}

export interface ClodableStep {
  id: string;
  state: "pending" | "running" | "done" | "skipped" | "warning" | "failed";
  title: string;
  detail?: string;
}

export interface ClodableError {
  code: string;
  message: string;
  hint?: string;
  details?: string;
  files?: string[];
}

/** The long-running thing happening right now, if any. */
export interface ClodableActivity {
  kind: "idle" | "saving" | "publishing" | "undoing" | "published" | "undone" | "failed";
  steps: ClodableStep[];
  error?: ClodableError;
  /** For "published" and "undone". */
  title?: string;
  url?: string | null;
  at?: number;
  /** Published on GitHub only: Lovable hosts the site and puts it live on its own Publish click. */
  onLovable?: boolean;
  lovableUrl?: string | null;
  /** Moving off Lovable: the new site on Netlify, which this Publish updated (or tried to). */
  site?: { url: string; state: "live" | "failed" | "pending"; logUrl?: string } | null;
  /** Published, but no host ever reported putting this app online: it's on GitHub only. */
  noHost?: boolean;
}

/** One line of `clodable doctor`. */
export interface ClodableCheck {
  id: string;
  label: string;
  status: "ok" | "warn" | "fail" | "info";
  detail?: string;
  fix?: string;
}

/**
 * A request from the preview toolbar, as `clodable inbox --claim --json` hands it over. It comes
 * from a file on disk: what the plugin reads stays optional.
 */
export type ClodableRequest =
  | {
      kind: "fix";
      page?: { path: string };
      error?: { message?: string; stack?: string; source?: { file: string; line: number } };
      console?: string[];
    }
  | {
      kind: "ask";
      page?: { path: string };
      source?: { file: string; line: number };
      request: string;
      element?: string;
    }
  | { kind: "edit"; before: string; after: string };

/** One step of the move off Lovable. */
export interface ClodableMoveStep {
  id: string;
  state: "done" | "next" | "later" | "attention";
  title: string;
  detail?: string;
}

/** A DNS record for the builder to add at their domain's provider. */
export interface ClodableDnsRecord {
  type: string;
  name: string;
  value: string;
  priority?: number;
}

/** What `clodable move status --json` reports, trimmed to what the panel draws. */
export interface ClodableMove {
  steps: ClodableMoveStep[];
  home?: { name: string; dashboard: string };
  preview: "live" | "copy";
  checks?: Array<{ id: string; ok: boolean; label: string; detail?: string }>;
  files?: { waiting: string[]; tooBig: number };
  vaultKey: boolean;
  functions: number;
  tokenPermissions?: string[];
  site?: { name: string; url: string; liveAt?: string };
  resend: boolean;
  emails?: { domain: string; sender: string; records: ClodableDnsRecord[]; connected: boolean };
  method?: "careful" | "quick";
  switch?: { frozenAt?: string; liveAt?: string };
  lastExport?: string;
  lovableJobs?: { count: number; stop: string };
  signIn?: { needed: boolean; at?: string };
  plan?: { data: number; dataLimit: number; files: number; filesLimit: number };
  stripeWebhooks?: Array<{ name: string; url: string }>;
  google?: { configured: boolean; redirect?: string };
  services?: {
    ai: boolean;
    aiSwitched: boolean;
    aiProvider?: string;
    emails: boolean;
    emailsSwitched: boolean;
    hook: boolean;
    hookOn: boolean;
    connectors: string[];
    left: string[];
  };
  domain?: { name: string; records: ClodableDnsRecord[] };
  settingsLeft?: string[];
  secretsLeft?: string[];
  vaultLeft?: string[];
  facts?: { at: string };
  cronKey?: boolean;
}

/** Where the new backend can go: what `clodable move choices --json` reports. */
export interface ClodableMoveChoices {
  organizations: Array<{
    slug: string;
    name: string;
    plan: string;
    freeLeft?: number;
    /** What a new project costs there, in plain words. */
    cost: string;
  }>;
  /** The free projects already running: the ones to pause when the limit is reached. */
  freeProjects: Array<{ name: string; organization: string }>;
  region?: { code: string; name: string };
  regions: Array<{ code: string; name: string }>;
}

/** What the move involves for this app: what `clodable move check --json` reports. */
export interface ClodableAssessment {
  level: "simple" | "some-steps" | "needs-help";
  items: Array<{ id: string; label: string; by: "clodable" | "you" | "help"; detail: string }>;
  /** Whether Claude has looked at the app's code: then the items come from what it found. */
  checked: boolean;
  notes: string[];
}

declare module "claude-code" {
  interface PluginState {
    clodable: {
      status: ClodableStatus | ClodableNotReady | null;
      activity: ClodableActivity;
      checks: ClodableCheck[];
    };
  }
}
