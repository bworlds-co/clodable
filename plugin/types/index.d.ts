// Shapes of Clodable's reactive session state, and the state contract the engine checks.

/** What `clodable status --json` reports, trimmed to what the bar and the panel draw. */
export interface ClodableStatus {
  ready: true;
  project: string;
  branch: string | null;
  unsaved: number;
  unpublished: Array<{ sha: string; subject: string; date: string; kind: string | null }>;
  behindLive: number;
  merging: boolean;
  conflicts: string[];
  liveUrl: string | null;
  lastPublish: { sha: string; title: string; at: string; url: string | null } | null;
  pullRequest: { number: number; url: string } | null;
  /** Where the data lives. On Lovable Cloud, the database and backend can't be changed from here. */
  backend: "unknown" | "lovable-cloud" | "supabase" | "none";
  /** Who puts the site live. Lovable's hosting needs a click in Lovable after Publish. */
  hosting: "unknown" | "github" | "lovable";
  /** The project in Lovable's editor, when known. */
  lovableUrl: string | null;
  /** Moving off Lovable: live on the new backend, the last clicks in Lovable still to do. */
  finishingMove: boolean;
  /** When the move off Lovable ended. */
  movedAt: string | null;
  /** On its own Supabase: whether Claude can change the database through Clodable here. */
  databaseConnected: boolean | null;
}

/** Why the bar shows "set up" instead of the draft. */
export interface ClodableNotReady {
  ready: false;
  reason: "not-a-repo" | "no-kit" | "no-github" | "no-tools" | "unknown";
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
}

/** One line of `clodable doctor`. */
export interface ClodableCheck {
  id: string;
  label: string;
  status: "ok" | "warn" | "fail" | "info";
  detail?: string;
  fix?: string;
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
