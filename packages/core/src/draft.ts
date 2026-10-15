import { ScannerUnavailable } from "./checks/gitleaks.js";
import { describeFinding, type SecretFinding, scanStaged, scanUnsent } from "./checks/secrets.js";
import type { ProjectConfig } from "./config.js";
import { ClodableError } from "./errors.js";
import type { Commit, CommitKind } from "./git.js";
import type { PullRequest } from "./github/types.js";
import { CLODABLE_FILES, clodableFile, keepIgnored } from "./kit/index.js";
import { readSecret } from "./local-secrets.js";
import { NETLIFY_TOKEN } from "./move/netlify-api.js";
import { loadMove } from "./move/state.js";
import { SUPABASE_TOKEN } from "./move/supabase-api.js";
import { formatAbsolute } from "./time.js";
import type { Workspace } from "./workspace.js";

export interface SaveResult {
  saved: boolean;
  branch: string;
  sha?: string;
  /** False when GitHub couldn't be reached. The save is safe on this computer and goes up next time. */
  pushed: boolean;
  offline?: boolean;
  pullRequest?: { number: number; url: string };
  /** Saves on the draft that aren't live yet. */
  unpublished: number;
  /** Set when bringing in someone else's saves of the same draft hit an overlap. */
  conflicts?: string[];
  /** Why the secret-key check couldn't run. Then the save stays on this computer, unsent. */
  unscanned?: string;
  /** Things that look like keys but may be meant to be public (a test key, a browser key). */
  notes?: string[];
}

export interface Status {
  project: {
    name: string;
    appType: string;
    liveUrl?: string;
    backend: ProjectConfig["backend"];
    hosting: ProjectConfig["hosting"];
    /** The project in Lovable's editor, when the README links it. */
    lovableUrl?: string;
    /** The app was made with Lovable (its packages or its .lovable folder say so). */
    madeWithLovable: boolean;
  };
  branch: string | undefined;
  draftBranch: string;
  onDraft: boolean;
  /** Files changed since the last save. */
  unsaved: number;
  /** Saves on the draft that aren't live yet, newest first. */
  unpublished: Commit[];
  /** Publishes on the live site that the draft doesn't have yet. */
  behindLive: number;
  merging: boolean;
  conflicts: string[];
  pullRequest?: { number: number; url: string };
  lastPublish?: { sha: string; title: string; at: string; url?: string; noHost?: boolean };
  /** A move off Lovable has started (Claude looked at the app, or a way to move was chosen) and isn't over. */
  movingOffLovable?: true;
  /** Moving off Lovable: live on the new backend, with the last clicks in Lovable still to do. */
  finishingMove?: true;
  /** When the move off Lovable ended: from then on, the app is changed here. */
  movedAt?: string;
  /**
   * On its own Supabase, or with no backend yet: whether Supabase is connected on this computer
   * (Claude's database changes, a new backend).
   */
  database?: { connected: boolean };
  /** The site Clodable put on the builder's Netlify, and whether a Publish put it online yet. */
  site?: { url: string; admin: string; live: boolean };
  /** Not online yet: whether Netlify is connected on this computer, to put the site online. */
  netlify?: { connected: boolean };
}

/** Make sure we're on the person's draft, creating it from the current position if needed. */
export async function ensureOnDraft(ws: Workspace): Promise<string> {
  const draft = await ws.draftBranch();
  const current = await ws.git.currentBranch();
  if (current === draft) return draft;
  if (current && current !== ws.liveBranch && !current.startsWith("draft/")) {
    // A developer's own branch: respect it and save there.
    return current;
  }
  if (await ws.git.branchExists(draft)) {
    if (await ws.git.hasChanges()) {
      throw new ClodableError({
        code: "on-live-branch",
        message: "You have unsaved changes outside your draft.",
        hint: "Save them first, or switch to your draft manually.",
      });
    }
    await ws.git.switchTo(draft);
  } else {
    // Uncommitted changes come along onto the new draft.
    await ws.git.switchTo(draft, { create: true });
  }
  return draft;
}

/** Save everything, push it to GitHub, and make sure the draft has its pull request. */
export async function save(
  ws: Workspace,
  options: { message?: string; kind?: CommitKind } = {},
): Promise<SaveResult> {
  if (await ws.git.isMerging()) {
    const conflicts = await ws.git.conflictedFiles();
    if (conflicts.length > 0) {
      throw new ClodableError({
        code: "conflict",
        message: "Your draft is in the middle of being combined with the live site.",
        hint: "Ask Claude to finish combining the changes, then save again.",
        files: conflicts,
      });
    }
  }
  const branch = await ensureOnDraft(ws);
  let unscanned: string | undefined;
  let notes: SecretFinding[] = [];
  if (ws.config.checks.secrets) {
    try {
      notes = await keepSecretsHere(ws);
    } catch (error) {
      if (!(error instanceof ScannerUnavailable)) throw error;
      unscanned = error.message;
    }
  }
  const identity = await commitIdentity(ws);
  const sha = await ws.git.commitAll(options.message ?? "Saved changes", {
    kind: options.kind ?? "save",
    ...(identity ? { identity } : {}),
  });

  const result: SaveResult = {
    saved: Boolean(sha),
    branch,
    pushed: false,
    unpublished: 0,
    ...(sha ? { sha } : {}),
    ...(notes.length > 0 ? { notes: notes.map(describeFinding) } : {}),
  };

  if (!(await ws.git.remoteUrl(ws.remote))) {
    result.offline = true;
    result.unpublished = await countUnpublished(ws);
    return result;
  }
  if (unscanned) {
    // Unchecked work never goes to GitHub. The next save checks these saves before sending them.
    result.unscanned = unscanned;
    result.unpublished = await countUnpublished(ws);
    return result;
  }

  const push = await pushWithRetry(ws, branch);
  result.pushed = push.ok;
  if (push.offline) result.offline = true;
  if (push.conflicts) result.conflicts = push.conflicts;
  result.unpublished = await countUnpublished(ws);

  if (push.ok && branch !== ws.liveBranch) {
    const pr = await ensurePullRequest(ws, branch).catch(() => undefined);
    if (pr) {
      result.pullRequest = { number: pr.number, url: pr.url };
      await ws.updateState({ pullRequest: result.pullRequest });
    }
  }
  return result;
}

/**
 * Secret keys stay on this computer. gitleaks checks what's about to be saved and sent, and a key
 * stops the save with `secret-found`. Returns the findings that are only worth a note.
 */
async function keepSecretsHere(ws: Workspace): Promise<SecretFinding[]> {
  // Saves made outside Clodable that haven't been sent yet. They aren't on GitHub, so they can
  // still be taken back: fold them into this save, and the check below sees their changes.
  if (await ws.git.hasRemoteRefs(ws.remote)) {
    const unsent = await ws.git.unsent(ws.remote);
    const found =
      unsent.length > 0
        ? (await scanUnsent(ws.root, ws.remote)).filter((f) => f.severity === "block")
        : [];
    if (found.length > 0) {
      const parents = await ws.git.parents(unsent[unsent.length - 1]!);
      if (parents.length !== 1 || (await ws.git.unsent(ws.remote, { merges: true })).length > 0) {
        throw secretFound(
          found,
          "Nothing went to GitHub. It's in an earlier save that hasn't been sent: a developer needs to take that save back.",
        );
      }
      await ws.git.resetSoft(parents[0]!);
    }
  }
  await ws.git.stageAll();
  const findings = await scanStaged(ws.root);
  const found = findings.filter((f) => f.severity === "block");
  if (found.length > 0) throw secretFound(found);
  return findings.filter((f) => f.severity === "warn");
}

function secretFound(found: SecretFinding[], hint?: string): ClodableError {
  return new ClodableError({
    code: "secret-found",
    message:
      found.length === 1
        ? `A secret key is in ${found[0]!.file}`
        : `${found.length} secret keys are in your changes`,
    hint: hint ?? "Nothing went to GitHub. Ask Claude to move it out of the code, and it saves.",
    details: found.map(describeFinding).join("\n"),
    files: found.map((f) => `${f.file}:${f.line}`),
  });
}

async function commitIdentity(ws: Workspace) {
  if (await ws.git.identity()) return undefined;
  try {
    const viewer = await ws.github.viewer();
    const identity = { name: viewer.name ?? viewer.login, email: viewer.email };
    await ws.git.setLocalIdentity(identity);
    return identity;
  } catch {
    return undefined;
  }
}

async function pushWithRetry(
  ws: Workspace,
  branch: string,
): Promise<{ ok: boolean; offline?: boolean; conflicts?: string[] }> {
  const first = await ws.git.push(branch, { remote: ws.remote, setUpstream: true });
  if (first.ok) return { ok: true };
  if (first.offline) return { ok: false, offline: true };
  if (first.rejected) {
    // The same draft moved elsewhere (another computer): bring those saves in, then push again.
    await ws.git.fetch(ws.remote, branch);
    const merged = await ws.git.merge(
      `${ws.remote}/${branch}`,
      "Combined saves from another computer",
    );
    if (!merged.ok) return { ok: false, conflicts: merged.conflicts };
    const second = await ws.git.push(branch, { remote: ws.remote, setUpstream: true });
    return { ok: second.ok, ...(second.offline ? { offline: true } : {}) };
  }
  throw new ClodableError({
    code: "push-rejected",
    message: "GitHub didn't accept your changes.",
    hint: "Check that your GitHub account can write to this repository.",
    details: first.stderr,
  });
}

/** What's live: GitHub's live branch as last fetched, else the local one, else nothing yet. */
async function liveBase(ws: Workspace): Promise<string | undefined> {
  if (await ws.git.revParse(ws.liveRef)) return ws.liveRef;
  return (await ws.git.revParse(ws.liveBranch)) ? ws.liveBranch : undefined;
}

/** The builder's saves not live yet: what the bar counts. */
export async function countUnpublished(ws: Workspace): Promise<number> {
  return (await waitingSaves(ws)).length;
}

/**
 * The builder's saves that would change the live site. Saves that cancel out (a change, then a
 * restore of the version before it) leave the app as it's live, so nothing is waiting then.
 */
async function waitingSaves(ws: Workspace): Promise<Commit[]> {
  const saves = await unpublishedSaves(ws, { buildersOnly: true });
  return saves.length > 0 && (await sameAsLive(ws)) ? [] : saves;
}

/**
 * Whether the draft brings nothing new to the app: its files are the ones it found on the live
 * site. `clodablesToo` also asks the same of Clodable's own files.
 */
export async function sameAsLive(
  ws: Workspace,
  options: { clodablesToo?: boolean } = {},
): Promise<boolean> {
  const live = await liveBase(ws);
  if (!live) return false;
  const diff = await ws.git.run(["diff", "--name-only", `${live}...HEAD`]);
  if (diff.exitCode !== 0) return false;
  const changed = diff.stdout.split("\n").filter(Boolean);
  return options.clodablesToo ? changed.length === 0 : changed.every(clodableFile);
}

/**
 * Saves on the draft that aren't live yet. `buildersOnly` leaves out Clodable's own: its setup,
 * and saves that only changed its files (the answers to its questions, say). They go live with the
 * builder's next publish, but they're not a change of the app.
 */
async function unpublishedSaves(
  ws: Workspace,
  options: { buildersOnly?: boolean } = {},
): Promise<Commit[]> {
  const live = await liveBase(ws);
  const range = live ? `${live}..HEAD` : "HEAD";
  const limit = live ? 200 : 50;
  const saves = await ws.git.log(range, { noMerges: true, limit });
  if (!options.buildersOnly) return saves;
  const files = await ws.git.filesBy(range, { noMerges: true, limit });
  return saves.filter((c) => c.kind !== "setup" && !onlyClodables(files.get(c.sha) ?? []));
}

/** Changed files that are all Clodable's own. A save that changed nothing isn't counted as one. */
function onlyClodables(paths: string[]): boolean {
  return paths.length > 0 && paths.every(clodableFile);
}

/** The draft's page on GitHub: one pull request per draft, opened at the first save. */
export async function ensurePullRequest(
  ws: Workspace,
  branch: string,
): Promise<PullRequest | undefined> {
  const saves = await unpublishedSaves(ws);
  if (saves.length === 0) return undefined;
  const existing = await ws.github.findOpenPullRequest(branch);
  const body = pullRequestBody(saves, await ws.login());
  if (existing) {
    if (existing.body.trim() !== body.trim()) {
      await ws.github.updatePullRequest(existing.number, { body });
    }
    return existing;
  }
  const oldest = saves[saves.length - 1]!;
  return ws.github.createPullRequest({
    head: branch,
    base: ws.liveBranch,
    title: oldest.subject,
    body,
  });
}

export function pullRequestBody(saves: Commit[], login: string): string {
  const list = saves
    .slice()
    .reverse()
    .map((c) => `- ${c.subject} <sub>${formatAbsolute(c.date)}</sub>`)
    .join("\n");
  return [
    `**Draft by @${login}**, saved automatically by [Clodable](https://github.com/bworlds-co/clodable).`,
    "",
    list,
    "",
    "<sub>When they click **Publish**, this draft is merged and your host puts it live. Comments here reach their Claude session.</sub>",
  ].join("\n");
}

export async function status(ws: Workspace, options: { fetch?: boolean } = {}): Promise<Status> {
  if (options.fetch && (await ws.git.remoteUrl(ws.remote))) {
    await ws.git.fetch(ws.remote, ws.liveBranch);
  }
  const [branch, draftBranch, changed, merging, conflicts, state] = await Promise.all([
    ws.git.currentBranch(),
    ws.draftBranch().catch(() => "draft/me"),
    ws.git.changedFiles(),
    ws.git.isMerging(),
    ws.git.conflictedFiles(),
    ws.state(),
  ]);
  const hasLive = Boolean(await ws.git.revParse(ws.liveRef));
  const unpublished = branch === ws.liveBranch ? [] : await waitingSaves(ws);
  const behindLive = hasLive ? await ws.git.count(`HEAD..${ws.liveRef}`, { noMerges: true }) : 0;
  return {
    project: {
      name: ws.project.name,
      appType: ws.project.appType,
      ...(ws.config.liveUrl ? { liveUrl: ws.config.liveUrl } : {}),
      backend: ws.config.backend,
      hosting: ws.config.hosting,
      ...(ws.project.lovable.projectUrl ? { lovableUrl: ws.project.lovable.projectUrl } : {}),
      madeWithLovable: ws.project.lovable.generated,
    },
    branch,
    draftBranch,
    onDraft: branch === draftBranch,
    unsaved: changed.length,
    unpublished,
    behindLive,
    merging,
    conflicts,
    ...(state.lastPublish ? { lastPublish: state.lastPublish } : {}),
    ...(state.pullRequest ? { pullRequest: state.pullRequest } : {}),
    ...(await whereTheMoveIs(ws.root)),
    ...(ws.config.backend === "supabase" || ws.config.backend === "none"
      ? { database: { connected: Boolean(await readSecret(SUPABASE_TOKEN)) } }
      : {}),
    ...(ws.config.netlify
      ? {
          site: {
            url: ws.config.netlify.url,
            admin: ws.config.netlify.admin,
            live: Boolean(state.siteLiveAt),
          },
        }
      : {}),
    ...(ws.config.hosting === "none"
      ? { netlify: { connected: Boolean(await readSecret(NETLIFY_TOKEN)) } }
      : {}),
  };
}

export interface History {
  /** Saves on the draft that aren't live yet, newest first. */
  draft: Commit[];
  /** True when those saves cancel out: the app's files are the ones live, nothing to publish. */
  sameAsLive: boolean;
  /** Recent publishes on the live branch, newest first. */
  published: Commit[];
}

export async function history(ws: Workspace, options: { limit?: number } = {}): Promise<History> {
  const live = (await liveBase(ws)) ?? ws.liveBranch;
  const [draft, published] = await Promise.all([
    unpublishedSaves(ws, { buildersOnly: true }),
    ws.git.log(live, { firstParent: true, limit: options.limit ?? 30 }),
  ]);
  return { draft, sameAsLive: draft.length > 0 && (await sameAsLive(ws)), published };
}

/** The save Clodable makes on its own before a restore, so nothing unsaved is lost. */
export const BEFORE_RESTORE = "Saved changes before restoring";

/** Bring back the files from an earlier version, as a new save. Nothing is ever erased. */
export async function restore(ws: Workspace, sha: string): Promise<SaveResult> {
  const target = await ws.git.revParse(sha);
  if (!target) {
    throw new ClodableError({ code: "not-found", message: "That version couldn't be found." });
  }
  const [commit] = await ws.git.log(`${target}^!`);
  await ensureOnDraft(ws);
  if (await ws.git.hasChanges()) {
    await save(ws, { message: BEFORE_RESTORE });
  }
  // The app's files go back. Clodable's stay as they are now: an older .clodable/ or AGENTS.md
  // would undo the builder's answers, or take Clodable out of the project altogether.
  await ws.git.restoreTree(target, CLODABLE_FILES);
  await keepIgnored(ws.root);
  const when = commit ? formatAbsolute(commit.date) : target.slice(0, 7);
  return save(ws, {
    message: `Restored the version from ${when}${commit ? `: ${commit.subject}` : ""}`,
    kind: "restore",
  });
}

/** Where the move off Lovable stands: not started, under way, its last clicks left, or over. */
async function whereTheMoveIs(
  root: string,
): Promise<Pick<Status, "movingOffLovable" | "finishingMove" | "movedAt">> {
  const move = await loadMove(root).catch(() => undefined);
  if (move?.switch?.finishedAt) return { movedAt: move.switch.finishedAt };
  if (move?.switch?.liveAt) return { movingOffLovable: true, finishingMove: true };
  return move?.facts || move?.method || move?.home ? { movingOffLovable: true } : {};
}
