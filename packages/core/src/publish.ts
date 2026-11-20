import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checksFailed, runChecks } from "./checks/index.js";
import type { LocalState } from "./config.js";
import { BEFORE_RESTORE, ensurePullRequest, sameAsLive, save } from "./draft.js";
import { ClodableError } from "./errors.js";
import { type Flow, step } from "./events.js";
import { type Commit, kindTrailer } from "./git.js";
import { clodableFile, keepIgnored } from "./kit/index.js";
import { loadMove, updateMove } from "./move/state.js";
import { deployChangedFunctions, type FunctionsOutcome } from "./publish-functions.js";
import { type Timing, timing, waitForCiIfAny, waitForDeploy } from "./waits.js";
import type { Workspace } from "./workspace.js";

export interface PublishOptions {
  /** Message for any last unsaved changes. */
  message?: string;
  /** Developers only: skip the local checks. */
  skipChecks?: boolean;
  /** Injected in tests. */
  sleep?: (ms: number) => Promise<void>;
  pollIntervalMs?: number;
  now?: () => Date;
}

export interface PublishResult {
  sha: string;
  title: string;
  at: string;
  url?: string;
  /**
   * "live": the host confirmed it. "pending": the host is still building. "unknown": no host
   * reported back. "lovable": Lovable hosts the site, and puts it live on its own Publish click.
   */
  deploy: "live" | "pending" | "unknown" | "lovable";
  /** With Lovable hosting: the project in Lovable's editor, where that click happens. */
  lovableUrl?: string;
  /**
   * Moving off Lovable: the website's new home on Netlify, updated by this Publish while the live
   * app still runs on Lovable. "live", "failed", or "pending" (still building, or not reported).
   */
  site?: { url: string; state: "live" | "failed" | "pending"; logUrl?: string };
  /** No host ever reported putting this repository online: it's on GitHub, not on the web. */
  noHost?: true;
  pullRequest: { number: number; url: string };
  warnings: string[];
  functions: FunctionsOutcome;
}

/** The save Clodable makes on its own when Publish finds changes not saved yet. */
const LAST_TOUCHES = "Last touches before publishing";

/** Saves Clodable makes on its own, around a restore or a publish: they never name a publish. */
const OWN_SAVES = new Set([BEFORE_RESTORE, LAST_TOUCHES]);

/** "Made the header blue", "Made the header blue; added a pricing page", or "… and 3 more changes". */
export function publishTitle(saves: Commit[]): string {
  const subjects = saves
    .filter((c) => c.kind === "save" || c.kind === "restore" || c.kind === undefined)
    .filter((c) => !OWN_SAVES.has(c.subject))
    .map((c) => c.subject)
    .reverse();
  if (subjects.length === 0) return "Updated the site";
  if (subjects.length === 1) return subjects[0]!;
  const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
  if (subjects.length === 2) return `${subjects[0]}; ${lowerFirst(subjects[1]!)}`;
  return `${subjects[0]} and ${subjects.length - 1} more changes`;
}

/** Save → catch up with live → checks → GitHub → (CI) → merge → wait for the host → fresh draft. */
export async function* publish(ws: Workspace, options: PublishOptions = {}): Flow<PublishResult> {
  const wait = timing(options);
  const warnings: string[] = [];

  // A failed delivery can leave the old draft behind. Retry before save() opens a second request.
  const earlier = await ws.state();
  if (earlier.pendingPublish || earlier.pullRequest) {
    await ws.git.fetch(ws.remote, ws.liveBranch);
    const [latest] = await ws.git.log(ws.liveRef, { firstParent: true, limit: 1 });
    const pending =
      earlier.pendingPublish ??
      (latest?.kind === "publish" && earlier.pullRequest && earlier.lastPublish?.sha !== latest.sha
        ? {
            sha: latest.sha,
            title: latest.subject,
            at: latest.date,
            pullRequest: earlier.pullRequest,
            state: "pending" as const,
          }
        : undefined);
    const branch = await ws.git.currentBranch();
    if (
      pending &&
      branch &&
      branch !== ws.liveBranch &&
      latest?.sha === pending.sha &&
      !(await ws.git.hasChanges()) &&
      (await ws.git.run(["diff", "--quiet", pending.sha, "HEAD"])).exitCode === 0
    ) {
      return yield* retryPublish(ws, pending, branch, wait);
    }
  }

  // 1. Save anything not saved yet.
  yield step("save", "running", "Saving your latest changes");
  let saved: Awaited<ReturnType<typeof save>>;
  try {
    saved = await save(ws, { message: options.message ?? LAST_TOUCHES });
  } catch (error) {
    if (error instanceof ClodableError && error.code === "secret-found") {
      yield step("save", "failed", error.message);
    }
    throw error;
  }
  if (saved.unscanned) {
    yield step("save", "failed", "Couldn't check your changes for secret keys");
    throw new ClodableError({
      code: "checks-failed",
      message: "Couldn't check your changes for secret keys, so nothing was sent.",
      hint: "Check your internet connection and try again. Nothing went live.",
      details: saved.unscanned,
    });
  }
  if (saved.offline || !saved.pushed) {
    yield step("save", "failed", "Couldn't reach GitHub");
    throw new ClodableError({
      code: "offline",
      message:
        "Your changes are saved on this computer, but GitHub can't be reached to publish them.",
      hint: "Check your internet connection and try again.",
    });
  }
  const branch = saved.branch;
  if (branch === ws.liveBranch) {
    throw new ClodableError({
      code: "on-live-branch",
      message: "You're working directly on the live version.",
      hint: "Ask Claude to move your work onto your draft, then publish again.",
    });
  }
  yield step(
    "save",
    "done",
    saved.saved ? "Saved your latest changes" : "Everything was already saved",
  );

  // 2. Catch up with the live site, so nobody's published work is undone.
  yield step("sync", "running", "Catching up with your live site");
  await ws.git.fetch(ws.remote, ws.liveBranch);
  const behind = await ws.git.count(`HEAD..${ws.liveRef}`, { noMerges: true });
  if (behind > 0) {
    const compared = await ws.git.checkMerge(ws.liveRef);
    if (!compared.ok) {
      yield step("sync", "failed", "Your draft and the live site changed the same thing");
      throw new ClodableError({
        code: "conflict",
        message: "Your draft and the live site both changed the same thing.",
        hint: "Ask Claude to review both versions with you. Your preview is unchanged.",
        files: compared.conflicts,
      });
    }
    const merged = await ws.git.merge(ws.liveRef, "Caught up with the live site");
    if (!merged.ok) {
      yield step("sync", "failed", "Your draft and the live site changed the same thing");
      throw new ClodableError({
        code: "conflict",
        message: "Your draft and the live site both changed the same thing.",
        hint: "Ask Claude to combine them. It knows what to do. Then publish again.",
        files: merged.conflicts,
      });
    }
    const pushed = await ws.git.push(branch, { remote: ws.remote, setUpstream: true });
    if (!pushed.ok) {
      throw new ClodableError({
        code: "push-rejected",
        message: "GitHub didn't accept the update.",
        details: pushed.stderr,
      });
    }
    yield step(
      "sync",
      "done",
      "Up to date with your live site",
      `${behind} live update${behind > 1 ? "s" : ""} brought in`,
    );
  } else {
    yield step("sync", "done", "Already up to date with your live site");
  }

  const saves = await ws.git.log(`${ws.liveRef}..HEAD`, { noMerges: true, limit: 200 });
  // Saves that cancel out leave the files as they're live: publishing them would change nothing.
  if (saves.length === 0 || (await sameAsLive(ws, { clodablesToo: true }))) {
    const state = await ws.state();
    const [latest] = await ws.git.log(ws.liveRef, { firstParent: true, limit: 1 });
    let pending = state.pendingPublish;
    // Recover a failure from an older Clodable that kept the draft's request but no delivery record.
    if (
      !pending &&
      latest?.kind === "publish" &&
      state.pullRequest &&
      state.lastPublish?.sha !== latest.sha
    ) {
      pending = {
        sha: latest.sha,
        title: latest.subject,
        at: latest.date,
        pullRequest: state.pullRequest,
        state: "pending",
      };
    }
    if (pending && latest?.sha === pending.sha) {
      return yield* retryPublish(ws, pending, branch, wait);
    }
    throw new ClodableError({
      code: "nothing-to-publish",
      message: "There's no new app change to publish.",
      hint: "This does not confirm which version visitors see. Ask Claude to check the hosting status if your site looks out of date.",
    });
  }

  // 3. Local checks.
  if (options.skipChecks) {
    yield step("checks", "skipped", "Checks skipped");
  } else {
    yield step("checks", "running", "Checking everything works");
    const results = yield* runChecks(ws.project, ws.config);
    const failed = results.filter((r) => r.status === "failed");
    for (const warning of results.filter((r) => r.status === "warning"))
      warnings.push(warning.summary);
    if (failed.length > 0) {
      // Each failed check said what it found on its own line: this one sums up, never repeats it.
      yield step(
        "checks",
        "failed",
        failed.length === 1 ? "Checks found a problem" : `Checks found ${failed.length} problems`,
      );
      throw checksFailed(failed, "Nothing went live. Ask Claude to fix it, then publish again.");
    }
    yield step(
      "checks",
      warnings.length > 0 ? "warning" : "done",
      warnings.length > 0 ? "Checks passed, with a note" : "Everything checks out",
    );
  }

  // 4. The draft's pull request carries the publish title.
  yield step("pull-request", "running", "Preparing your draft on GitHub");
  const pr = await ensurePullRequest(ws, branch);
  if (!pr)
    throw new ClodableError({
      code: "nothing-to-publish",
      message: "There's nothing new to publish.",
    });
  const title = publishTitle(saves);
  await ws.github.updatePullRequest(pr.number, { title });
  yield step("pull-request", "done", "Draft ready on GitHub");

  // 5. The repository's own CI, if it has any.
  yield* waitForCiIfAny(ws, pr.number, wait);

  // 6. Merge: this is the moment it's published.
  yield step("merge", "running", "Publishing");
  const body = [
    ...saves
      .slice()
      .reverse()
      .map((c) => `- ${c.subject}`),
    "",
    `Published by @${await ws.login()} with Clodable.`,
    "",
    kindTrailer("publish"),
  ].join("\n");
  const { sha } = await ws.github.merge(pr.number, { subject: title, body });
  const pending: NonNullable<LocalState["pendingPublish"]> = {
    sha,
    title,
    at: wait.now().toISOString(),
    pullRequest: { number: pr.number, url: pr.url },
    state: "pending",
  };
  await ws.updateState({ pendingPublish: pending });
  yield step("merge", "done", "Ready for your host");
  return yield* finishPublish(ws, pending, branch, wait, warnings);
}

async function* retryPublish(
  ws: Workspace,
  pending: NonNullable<LocalState["pendingPublish"]>,
  branch: string,
  wait: Timing,
): Flow<PublishResult> {
  await ws.updateState({ pendingPublish: pending });
  const deliveries = await ws.github.deploymentsFor(pending.sha);
  const latest = deliveries.find((d) => d.isProduction) ?? deliveries[0];
  if (latest?.state !== "success") {
    const ownedSite = ws.config.netlify ?? (await loadMove(ws.root)).site;
    if (ownedSite && ws.github.retryDeployment) {
      yield step("deploy", "running", "Retrying the same version");
      const retry = await ws.github.retryDeployment(pending.sha);
      if (retry === "started") {
        pending = {
          ...pending,
          state: "pending",
          ignoredDeploymentIds: deliveries.map((d) => d.id),
        };
        await ws.updateState({ pendingPublish: pending });
      } else if (!retry && (latest?.state === "failure" || latest?.state === "error" || !latest)) {
        throw new ClodableError({
          code: "deploy-failed",
          message: "This version couldn't be retried automatically.",
          hint: "Ask Claude to check the hosting report. Keep the app unchanged; don't make an edit to trigger publishing.",
        });
      }
    }
  }
  return yield* finishPublish(ws, pending, branch, wait, []);
}

async function* finishPublish(
  ws: Workspace,
  pending: NonNullable<LocalState["pendingPublish"]>,
  branch: string,
  wait: Timing,
  warnings: string[],
): Flow<PublishResult> {
  const { sha, title, pullRequest: pr } = pending;
  // 7. Host delivery is separate from accepting the version for publication.
  let deployed: {
    state: PublishResult["deploy"];
    url?: string;
    site?: PublishResult["site"];
    noHost?: true;
  };
  try {
    deployed = yield* waitForDeploy(ws, sha, wait, pending.ignoredDeploymentIds);
  } catch (error) {
    await ws.updateState({ pendingPublish: { ...pending, state: "failed" } });
    throw error;
  }

  // 8. Edge functions go live now, never earlier.
  const functions = yield* deployChangedFunctions(ws, sha);

  // 9. A fresh draft, so the next change starts from what's live.
  yield step("fresh-draft", "running", "Starting a fresh draft");
  await ws.git.fetch(ws.remote, ws.liveBranch);
  await ws.git.switchTo(branch, { reset: true, startPoint: ws.liveRef });
  await ws.git.deleteRemoteBranch(branch, ws.remote);
  const at = wait.now().toISOString();
  const url = deployed.url ?? ws.config.liveUrl;
  await ws.updateState({
    lastPublish: {
      sha,
      title,
      at,
      ...(url ? { url } : {}),
      prNumber: pr.number,
      ...(deployed.noHost ? { noHost: true } : {}),
    },
    pullRequest: undefined,
    pendingPublish:
      deployed.state === "live" ||
      (deployed.state === "lovable" && (!deployed.site || deployed.site.state === "live")) ||
      deployed.noHost
        ? undefined
        : { ...pending, state: deployed.site?.state === "failed" ? "failed" : "pending" },
  });
  yield step("fresh-draft", "done", "Fresh draft ready");
  // The site on Netlify, before the switch (beside Lovable's hosting) or after it (the live one).
  if (
    deployed.site?.state === "live" ||
    (deployed.state === "live" && (await loadMove(ws.root)).site)
  ) {
    await updateMove(ws.root, (s) => {
      if (s.site) s.site.liveAt = at;
    });
  }
  // The site Clodable put on Netlify: online from its first Publish on.
  if (deployed.state === "live" && ws.config.netlify && !(await ws.state()).siteLiveAt) {
    await ws.updateState({ siteLiveAt: at });
  }

  return {
    sha,
    title,
    at,
    ...(url ? { url } : {}),
    deploy: deployed.state,
    ...lovableLink(ws, deployed.state),
    ...(deployed.site ? { site: deployed.site } : {}),
    ...(deployed.noHost ? { noHost: true as const } : {}),
    pullRequest: { number: pr.number, url: pr.url },
    warnings,
    functions,
  };
}

/** Where to click Publish in Lovable, when Lovable hosts the site. */
function lovableLink(ws: Workspace, state: PublishResult["deploy"]): { lovableUrl?: string } {
  const url = ws.project.lovable.projectUrl;
  return state === "lovable" && url ? { lovableUrl: url } : {};
}

export interface UndoResult {
  sha: string;
  undid: { sha: string; title: string };
  url?: string;
  deploy: PublishResult["deploy"];
  lovableUrl?: string;
  /** Set when the builder's current draft overlaps with what was undone. */
  conflicts?: string[];
}

/** Undo the last publish: revert it on a side worktree, then publish the revert the usual way. */
export async function* undoPublish(
  ws: Workspace,
  options: Omit<PublishOptions, "message" | "skipChecks"> & { sha?: string } = {},
): Flow<UndoResult> {
  const wait = timing(options);
  yield step("revert", "running", "Undoing your last publish");
  await ws.git.fetch(ws.remote, ws.liveBranch);
  const [target] = options.sha
    ? await ws.git.log(`${options.sha}^!`)
    : await ws.git.log(ws.liveRef, { firstParent: true, limit: 1 });
  if (!target)
    throw new ClodableError({ code: "not-found", message: "There's no publish to undo yet." });

  const dir = await mkdtemp(join(tmpdir(), "clodable-undo-"));
  const branch = `undo/${target.sha.slice(0, 7)}`;
  try {
    const side = await ws.git.worktreeAdd(dir, branch, ws.liveRef);
    const reverted = await side.run(["revert", "--no-edit", "--no-commit", target.sha]);
    if (reverted.exitCode !== 0) {
      await side.run(["revert", "--abort"]);
      yield step("revert", "failed", "This publish can't be undone automatically");
      throw new ClodableError({
        code: "conflict",
        message:
          "Newer changes on your live site touch the same lines, so this can't be undone automatically.",
        hint: "Ask Claude to undo it by hand. It can see exactly what changed.",
      });
    }
    // Clodable's own files stay as they're live, as with Restore: undoing a publish mustn't take
    // back the builder's answers, Clodable's setup or the site's publish workflow.
    const undone = await side.run(["diff", "--cached", "--name-only", "HEAD"]);
    await side.restorePaths("HEAD", undone.stdout.split("\n").filter(clodableFile));
    await keepIgnored(dir);
    const undoTitle = `Undo: ${target.subject}`;
    const identity = (await ws.git.identity()) ?? undefined;
    await side.commitAll(undoTitle, {
      kind: "undo",
      body: `Reverts ${target.sha}.`,
      ...(identity ? { identity } : {}),
      allowEmpty: true,
    });
    const pushed = await side.push(branch, { remote: ws.remote, setUpstream: true });
    if (!pushed.ok) {
      throw new ClodableError({
        code: pushed.offline ? "offline" : "push-rejected",
        message: "GitHub didn't accept the undo.",
        details: pushed.stderr,
      });
    }
    const created = await ws.github.createPullRequest({
      head: branch,
      base: ws.liveBranch,
      title: undoTitle,
      body: `Undoes the publish “${target.subject}”, requested with Clodable.`,
    });
    yield step("revert", "done", "Prepared the undo");

    yield* waitForCiIfAny(ws, created.number, wait);
    yield step("merge", "running", "Putting the previous version back");
    const { sha } = await ws.github.merge(created.number, {
      subject: undoTitle,
      body: `Reverts ${target.sha}.\n\n${kindTrailer("undo")}`,
    });
    yield step("merge", "done", "Previous version restored");
    const deployed = yield* waitForDeploy(ws, sha, wait);
    await ws.git.deleteRemoteBranch(branch, ws.remote);

    // Bring the undo into the builder's draft, so their preview matches what's live.
    await ws.git.fetch(ws.remote, ws.liveBranch);
    const pending = await ws.git.count(`${ws.liveRef}..HEAD`, { noMerges: true });
    let conflicts: string[] | undefined;
    if (pending === 0 && !(await ws.git.hasChanges())) {
      const current = (await ws.git.currentBranch()) ?? (await ws.draftBranch());
      await ws.git.switchTo(current, { reset: true, startPoint: ws.liveRef });
    } else {
      const merged = await ws.git.merge(ws.liveRef, "Caught up with the live site");
      if (!merged.ok) conflicts = merged.conflicts;
    }
    const at = wait.now().toISOString();
    await ws.updateState({
      lastPublish: {
        sha,
        title: undoTitle,
        at,
        ...(deployed.url ? { url: deployed.url } : {}),
        prNumber: created.number,
      },
    });
    return {
      sha,
      undid: { sha: target.sha, title: target.subject },
      ...(deployed.url ? { url: deployed.url } : {}),
      deploy: deployed.state,
      ...lovableLink(ws, deployed.state),
      ...(conflicts ? { conflicts } : {}),
    };
  } finally {
    await ws.git.worktreeRemove(dir);
    await rm(dir, { recursive: true, force: true });
    await ws.git.run(["branch", "-D", branch]);
  }
}
