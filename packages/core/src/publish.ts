import { existsSync } from "node:fs";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checksFailed, runChecks } from "./checks/index.js";
import { supabaseRef } from "./config.js";
import { ensurePullRequest, save } from "./draft.js";
import { ClodableError, messageOf } from "./errors.js";
import { type Flow, log, step } from "./events.js";
import { exec, hasCommand } from "./exec.js";
import { type Commit, kindTrailer } from "./git.js";
import type { BuildProgress } from "./github/types.js";
import { localFunctions, uploadFunction } from "./move/functions.js";
import { loadMove, updateMove } from "./move/state.js";
import { SupabaseApi } from "./move/supabase-api.js";
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

export interface FunctionsOutcome {
  deployed: string[];
  /** Changed edge functions that still need deploying (no Supabase CLI login on this computer). */
  pending: string[];
  failed: string[];
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
  pullRequest: { number: number; url: string };
  warnings: string[];
  functions: FunctionsOutcome;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** "Made the header blue", "Made the header blue; added a pricing page", or "… and 3 more changes". */
export function publishTitle(saves: Commit[]): string {
  const subjects = saves
    .filter((c) => c.kind === "save" || c.kind === "restore" || c.kind === undefined)
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
  const sleep = options.sleep ?? defaultSleep;
  const now = options.now ?? (() => new Date());
  const poll = options.pollIntervalMs ?? 4000;
  const warnings: string[] = [];

  // 1. Save anything not saved yet.
  yield step("save", "running", "Saving your latest changes");
  let saved: Awaited<ReturnType<typeof save>>;
  try {
    saved = await save(ws, { message: options.message ?? "Last touches before publishing" });
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
      hint: "Run `clodable save` once to move your work onto your draft, then publish.",
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
  if (saves.length === 0) {
    throw new ClodableError({
      code: "nothing-to-publish",
      message: "There's nothing new to publish. Your live site already has everything.",
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
      yield step("checks", "failed", failed[0]!.summary);
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

  // 5. The repository's own CI, if it has any. Most Lovable projects don't, and then there's
  // nothing to wait for: the local checks above already ran.
  if (ws.config.publish.waitForCi && (await runsChecksOnPullRequests(ws.root))) {
    yield* waitForCi(ws, pr.number, {
      sleep,
      now,
      poll,
      timeoutMinutes: ws.config.publish.ciTimeoutMinutes,
    });
  }

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
  yield step("merge", "done", "Published");

  // 7. Wait for the host.
  const deployed = yield* waitForDeploy(ws, sha, {
    sleep,
    now,
    poll,
    timeoutMinutes: ws.config.publish.deployTimeoutMinutes,
  });

  // 8. Edge functions go live now, never earlier.
  const functions = yield* deployChangedFunctions(ws, sha);

  // 9. A fresh draft, so the next change starts from what's live.
  yield step("fresh-draft", "running", "Starting a fresh draft");
  await ws.git.fetch(ws.remote, ws.liveBranch);
  await ws.git.switchTo(branch, { reset: true, startPoint: ws.liveRef });
  await ws.git.deleteRemoteBranch(branch, ws.remote);
  const at = now().toISOString();
  const url = deployed.url ?? ws.config.liveUrl;
  await ws.updateState({
    lastPublish: { sha, title, at, ...(url ? { url } : {}), prNumber: pr.number },
    pullRequest: undefined,
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

  return {
    sha,
    title,
    at,
    ...(url ? { url } : {}),
    deploy: deployed.state,
    ...lovableLink(ws, deployed.state),
    ...(deployed.site ? { site: deployed.site } : {}),
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

/** Does this repository run GitHub Actions on pull requests? */
export async function runsChecksOnPullRequests(root: string): Promise<boolean> {
  const dir = join(root, ".github", "workflows");
  if (!existsSync(dir)) return false;
  for (const name of await readdir(dir)) {
    if (!/\.ya?ml$/.test(name)) continue;
    const text = await readFile(join(dir, name), "utf8").catch(() => "");
    if (/\bpull_request(_target)?\b/.test(text)) return true;
  }
  return false;
}

/** What a build is doing, in the builder's words, from the site workflow's own step names. */
const BUILD_STEPS: Array<[RegExp, string]> = [
  [/^post /i, "Finishing"],
  [/set up|checkout|setup-|deployment started/i, "Getting ready"],
  [/install/i, "Installing your app's packages"],
  [/build|netlify/i, "Building your site"],
  [/live|post |complete/i, "Finishing"],
];

/**
 * The line Publish shows while the host builds: what it's doing, how long so far, and how long the
 * last build took ("Building your site · 1 min so far · usually about 2 min"). Without a GitHub
 * build to read (a host that builds elsewhere), only how long so far.
 */
export function buildLine(progress: BuildProgress | undefined, elapsedMs: number): string {
  const minutes = Math.floor(elapsedMs / 60_000);
  const soFar = minutes < 1 ? "under a minute so far" : `${minutes} min so far`;
  if (!progress) return `Your host is building it · ${soFar}`;
  const doing = progress.step
    ? (BUILD_STEPS.find(([pattern]) => pattern.test(progress.step!))?.[1] ?? "Building your site")
    : "Waiting for GitHub to start the build";
  const usual = progress.lastSeconds
    ? `usually about ${Math.max(1, Math.round(progress.lastSeconds / 60))} min`
    : "the first one takes a few minutes";
  return `${doing} · ${soFar} · ${usual}`;
}

interface WaitOptions {
  sleep: (ms: number) => Promise<void>;
  now: () => Date;
  poll: number;
  timeoutMinutes: number;
}

export async function* waitForCi(ws: Workspace, prNumber: number, o: WaitOptions): Flow<void> {
  const deadline = o.now().getTime() + o.timeoutMinutes * 60_000;
  // Checks can take a few seconds to register after a push.
  const graceUntil = o.now().getTime() + 12_000;
  let announced = false;
  while (true) {
    const summary = await ws.github.checks(prNumber);
    if (summary.state === "none") {
      if (o.now().getTime() < graceUntil) {
        await o.sleep(Math.min(o.poll, 3000));
        continue;
      }
      if (announced) yield step("ci", "done", "Your project's checks passed");
      return;
    }
    if (summary.state === "success") {
      yield step("ci", "done", "Your project's checks passed");
      return;
    }
    if (summary.state === "failure") {
      const names = summary.failed.map((f) => f.name).join(", ");
      yield step("ci", "failed", `A check failed: ${names}`);
      throw new ClodableError({
        code: "ci-failed",
        message: `Your project's own checks didn't pass (${names}).`,
        hint: "Nothing went live. Ask Claude to look at the failing check and fix it.",
        details: summary.failed.map((f) => `${f.name}${f.url ? `: ${f.url}` : ""}`).join("\n"),
      });
    }
    yield step(
      "ci",
      "running",
      "Waiting for your project's checks",
      `${summary.done} of ${summary.total} finished`,
    );
    announced = true;
    if (o.now().getTime() > deadline) {
      throw new ClodableError({
        code: "ci-failed",
        message: "Your project's checks are taking too long.",
        hint: "Nothing went live. Try publishing again in a few minutes.",
      });
    }
    await o.sleep(o.poll);
  }
}

export async function* waitForDeploy(
  ws: Workspace,
  sha: string,
  o: WaitOptions,
): Flow<{ state: PublishResult["deploy"]; url?: string; site?: PublishResult["site"] }> {
  // Lovable's hosting serves the version last published in Lovable, whatever GitHub holds. Say so
  // instead of waiting for a host that will never report.
  if (ws.config.hosting === "lovable") {
    const url = ws.config.liveUrl ?? ws.project.lovable.appUrl;
    yield step(
      "deploy",
      "done",
      "Published on GitHub",
      "To put it live, click Publish, then Publish changes, in Lovable",
    );
    // Moving off Lovable: the new site on Netlify follows each Publish, through GitHub.
    const moving = (await loadMove(ws.root)).site;
    const site = moving ? yield* followSite(ws, sha, o, moving.url) : undefined;
    return { state: "lovable", ...(url ? { url } : {}), ...(site ? { site } : {}) };
  }
  yield step("deploy", "running", "Going live");
  const started = o.now().getTime();
  const deadline = started + o.timeoutMinutes * 60_000;
  // If no host reports a deployment within this window, the host isn't connected to GitHub.
  const noHostAfter = started + 75_000;
  // Said again only when it changes: what the build is doing, or another minute.
  let shown = "";
  while (true) {
    const deployments = await ws.github.deploymentsFor(sha).catch(() => []);
    const production = deployments.find((d) => d.isProduction) ?? deployments[0];
    // A build GitHub runs for this commit says the host is connected, and what it's doing.
    const build = await ws.github.buildProgress?.(sha).catch(() => undefined);
    if (production?.state === "success") {
      const url = production.url ?? ws.config.liveUrl;
      yield step("deploy", "done", "You're live", url);
      return { state: "live", ...(url ? { url } : {}) };
    }
    if (production && (production.state === "failure" || production.state === "error")) {
      yield step("deploy", "failed", "Your host couldn't put it live");
      throw new ClodableError({
        code: "deploy-failed",
        message: "Your changes are published on GitHub, but your host couldn't put them live.",
        hint: "Your previous version is still live. Ask Claude to look at the host's report.",
        ...(production.logUrl ? { details: production.logUrl } : {}),
      });
    }
    const t = o.now().getTime();
    if (!production && !build && t > noHostAfter) {
      const url = ws.config.liveUrl;
      yield step("deploy", "done", "Published", "Your host will put it live in a moment");
      return { state: "unknown", ...(url ? { url } : {}) };
    }
    if (t > deadline) {
      yield step("deploy", "warning", "Still going live", "Your host is taking longer than usual");
      return { state: "pending", ...(ws.config.liveUrl ? { url: ws.config.liveUrl } : {}) };
    }
    const line = buildLine(build, t - started);
    if ((production || build) && line !== shown) {
      shown = line;
      yield step("deploy", "running", "Going live", line);
    }
    await o.sleep(o.poll);
  }
}

/**
 * The site on Netlify while the move is under way: its workflow records a GitHub deployment for
 * the commit. A site that didn't update is said plainly, never an error: the live app is on Lovable.
 */
async function* followSite(
  ws: Workspace,
  sha: string,
  o: WaitOptions,
  url: string,
): Flow<NonNullable<PublishResult["site"]>> {
  yield step("move:site", "running", "Updating your site on Netlify");
  const started = o.now().getTime();
  const deadline = started + o.timeoutMinutes * 60_000;
  const noRunAfter = started + 120_000;
  let shown = "";
  while (true) {
    const deployments = await ws.github.deploymentsFor(sha).catch(() => []);
    const site = deployments.find((d) => d.isProduction) ?? deployments[0];
    const build = await ws.github.buildProgress?.(sha).catch(() => undefined);
    if (site?.state === "success") {
      yield step("move:site", "done", "Your site on Netlify is up to date", site.url ?? url);
      return { url: site.url ?? url, state: "live" };
    }
    if (site && (site.state === "failure" || site.state === "error")) {
      yield step("move:site", "warning", "Your site on Netlify didn't update", site.logUrl);
      return { url, state: "failed", ...(site.logUrl ? { logUrl: site.logUrl } : {}) };
    }
    const t = o.now().getTime();
    if ((!site && !build && t > noRunAfter) || t > deadline) {
      yield step("move:site", "warning", "Your site on Netlify is still updating", url);
      return { url, state: "pending" };
    }
    const line = buildLine(build, t - started);
    if ((site || build) && line !== shown) {
      shown = line;
      yield step("move:site", "running", "Updating your site on Netlify", line);
    }
    await o.sleep(o.poll);
  }
}

/** Names of edge functions touched by a commit. A change to `_shared` touches every function. */
export async function changedFunctions(ws: Workspace, sha: string): Promise<string[]> {
  const files = await ws.git.diffNames(`${sha}^..${sha}`);
  const names = new Set<string>();
  let shared = false;
  for (const file of files) {
    const match = file.match(/^supabase\/functions\/([^/]+)\//);
    if (!match) continue;
    if (match[1] === "_shared") shared = true;
    else names.add(match[1]!);
  }
  if (shared) {
    const dir = join(ws.root, "supabase", "functions");
    if (existsSync(dir)) {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        if (entry.isDirectory() && !entry.name.startsWith("_")) names.add(entry.name);
      }
    }
  }
  return [...names].sort();
}

async function* deployChangedFunctions(ws: Workspace, sha: string): Flow<FunctionsOutcome> {
  const outcome: FunctionsOutcome = { deployed: [], pending: [], failed: [] };
  // On Lovable Cloud, Lovable owns the backend: nothing here can deploy to it.
  if (ws.config.backend === "lovable-cloud") return outcome;
  // The merge was made on GitHub: this computer needs it to see what it changed.
  await ws.git.fetch(ws.remote, ws.liveBranch).catch(() => {});
  const names = await changedFunctions(ws, sha);
  if (names.length === 0) return outcome;
  const ref = supabaseRef(ws.config, ws.project);
  yield step(
    "functions",
    "running",
    `Updating ${names.length} backend function${names.length > 1 ? "s" : ""}`,
  );
  // With the Supabase account connected on this computer (a move off Lovable connects it), through
  // Supabase's API: no other tool or sign-in needed.
  const api = ref ? await SupabaseApi.onThisComputer() : undefined;
  if (ref && api) {
    const local = new Map((await localFunctions(ws.root)).map((fn) => [fn.name, fn]));
    for (const name of names) {
      const fn = local.get(name);
      if (!fn) continue;
      try {
        await uploadFunction(api, ref, ws.root, fn);
        outcome.deployed.push(name);
      } catch (error) {
        if (error instanceof ClodableError && error.code === "supabase-auth")
          outcome.pending.push(name);
        else {
          outcome.failed.push(name);
          yield log("warn", `Function ${name}: ${messageOf(error)}`);
        }
      }
    }
  } else if (!ref || !(await hasCommand("supabase", ws.root))) {
    outcome.pending = names;
    yield step("functions", "warning", "Backend functions need one more step", names.join(", "));
    return outcome;
  }
  for (const name of api && ref ? [] : names) {
    const result = await exec("supabase", ["functions", "deploy", name, "--project-ref", ref], {
      cwd: ws.root,
      timeout: 5 * 60_000,
    });
    if (result.exitCode === 0) outcome.deployed.push(name);
    else if (/login|access token|unauthorized/i.test(result.stderr)) outcome.pending.push(name);
    else {
      outcome.failed.push(name);
      yield log("warn", `Function ${name}: ${result.stderr.trim().split("\n").pop() ?? "failed"}`);
    }
  }
  const state = outcome.failed.length > 0 || outcome.pending.length > 0 ? "warning" : "done";
  yield step(
    "functions",
    state,
    state === "done" ? "Backend functions updated" : "Some backend functions need attention",
    [...outcome.pending, ...outcome.failed].join(", ") || undefined,
  );
  return outcome;
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
  const sleep = options.sleep ?? defaultSleep;
  const now = options.now ?? (() => new Date());
  const poll = options.pollIntervalMs ?? 4000;

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

    if (ws.config.publish.waitForCi && (await runsChecksOnPullRequests(ws.root))) {
      yield* waitForCi(ws, created.number, {
        sleep,
        now,
        poll,
        timeoutMinutes: ws.config.publish.ciTimeoutMinutes,
      });
    }
    yield step("merge", "running", "Putting the previous version back");
    const { sha } = await ws.github.merge(created.number, {
      subject: undoTitle,
      body: `Reverts ${target.sha}.\n\n${kindTrailer("undo")}`,
    });
    yield step("merge", "done", "Previous version restored");
    const deployed = yield* waitForDeploy(ws, sha, {
      sleep,
      now,
      poll,
      timeoutMinutes: ws.config.publish.deployTimeoutMinutes,
    });
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
    const at = now().toISOString();
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
