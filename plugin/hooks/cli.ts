// What the Cloclod CLI prints with --json, read back: one event per line, the result last. Pure
// functions: no `$`, so they're easy to test and share.
import type {
  CloclodError,
  CloclodNotReady,
  CloclodStatus,
  CloclodStep,
} from "../types/index.d.ts";

export type Result = { type: "result"; ok: boolean; data?: any; error?: CloclodError };

export type Step = {
  type: "step";
  id: string;
  state: CloclodStep["state"];
  title: string;
  detail?: string;
};

/** The result line of a finished command, or a problem that says the CLI didn't answer. */
export function lastResult(stdout: string, stderr: string): Result {
  const lines = stdout.split("\n").filter((l) => l.trim().startsWith("{"));
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const event = JSON.parse(lines[i]!);
      if (event.type === "result") return event as Result;
    } catch {
      // keep looking
    }
  }
  return {
    type: "result",
    ok: false,
    error: {
      code: "unknown",
      message: "Cloclod didn't answer.",
      details: (stderr || stdout).slice(0, 2000),
    },
  };
}

/** Events as a command streams them: each call takes the next chunk and gives the whole lines. */
export function eventReader(): (chunk: string) => Array<Step | Result> {
  let buffer = "";
  return (chunk) => {
    buffer += chunk;
    const events: Array<Step | Result> = [];
    let nl = buffer.indexOf("\n");
    while (nl >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      nl = buffer.indexOf("\n");
      if (!line.startsWith("{")) continue;
      try {
        events.push(JSON.parse(line) as Step | Result);
      } catch {
        // not an event
      }
    }
    return events;
  };
}

/** `cloclod status --json`, as the bar and the panel draw it. */
export function toStatus(data: any): CloclodStatus {
  return {
    ready: true,
    project: String(data?.project?.name ?? "your app"),
    unpublished: (data?.unpublished ?? []).map((c: any) => ({
      sha: c.sha,
      subject: c.subject,
      date: c.date,
      kind: c.kind ?? null,
    })),
    merging: Boolean(data?.merging),
    conflicts: data?.conflicts ?? [],
    liveUrl: data?.project?.liveUrl ?? data?.lastPublish?.url ?? null,
    lastPublish: data?.lastPublish
      ? {
          sha: data.lastPublish.sha,
          title: data.lastPublish.title,
          at: data.lastPublish.at,
          url: data.lastPublish.url ?? null,
          ...(data.lastPublish.noHost ? { noHost: true } : {}),
        }
      : null,
    pullRequest: data?.pullRequest ?? null,
    backend: data?.project?.backend ?? "unknown",
    hosting: data?.project?.hosting ?? "unknown",
    lovableUrl: data?.project?.lovableUrl ?? null,
    madeWithLovable: Boolean(data?.project?.madeWithLovable),
    movingOffLovable: Boolean(data?.movingOffLovable),
    finishingMove: Boolean(data?.finishingMove),
    movedAt: data?.movedAt ?? null,
    databaseConnected:
      typeof data?.database?.connected === "boolean" ? data.database.connected : null,
    site: data?.site?.url
      ? {
          url: data.site.url,
          admin: data.site.admin ?? "",
          live: Boolean(data.site.live),
          ...(data.site.statusKnown === false ? { statusKnown: false } : {}),
        }
      : null,
    netlifyConnected: typeof data?.netlify?.connected === "boolean" ? data.netlify.connected : null,
  };
}

/** Why Cloclod isn't ready here, from the error `cloclod status` gave. */
export function notReady(error: CloclodError | undefined): CloclodNotReady {
  const code = error?.code;
  return {
    ready: false,
    reason:
      code === "not-a-repo"
        ? "not-a-repo"
        : code === "not-set-up"
          ? "no-kit"
          : code === "gh-auth"
            ? "no-github"
            : "unknown",
    message: error?.message ?? "Cloclod isn't ready here.",
    ...(error?.hint ? { fix: error.hint } : {}),
  };
}

/** A problem to show in the panel: what the CLI said, and what to do, or `fallback`. */
export function problemOf(
  error: CloclodError | undefined,
  fallback: string,
): { message: string; hint?: string } {
  return { message: error?.message ?? fallback, ...(error?.hint ? { hint: error.hint } : {}) };
}

export type Version = { sha: string; subject: string; date: string; kind: string | null };

/** One version from `cloclod history`. */
export const toVersion = (c: any): Version => ({
  sha: String(c.sha),
  subject: String(c.subject ?? ""),
  date: String(c.date ?? ""),
  kind: c.kind ?? null,
});

/**
 * Values are written only when they changed. Every redraw hands Cloclod's buttons new handles,
 * and Desktop drops a press that names an old one: a redraw for nothing costs the next click.
 */
export const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
