import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { ClodableError } from "./errors.js";
import { type Flow, type StepId, step } from "./events.js";
import type { BuildProgress, Deployment } from "./github/types.js";
import { loadMove } from "./move/state.js";
import type { PublishResult } from "./publish.js";
import type { Workspace } from "./workspace.js";

/**
 * Publish's waits: the repository's own CI, and the host putting a commit live (or, while moving
 * off Lovable, the new site on Netlify), from what GitHub says about the commit.
 */

/** How waiting passes: real time, or a test's. */
export interface Timing {
  sleep: (ms: number) => Promise<void>;
  now: () => Date;
  /** Between two looks at GitHub. */
  poll: number;
}

export function timing(options: {
  sleep?: (ms: number) => Promise<void>;
  now?: () => Date;
  pollIntervalMs?: number;
}): Timing {
  return {
    sleep: options.sleep ?? ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms))),
    now: options.now ?? (() => new Date()),
    poll: options.pollIntervalMs ?? 4000,
  };
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

/**
 * The repository's own CI, if it runs on pull requests. Most Lovable projects have none, and then
 * there's nothing to wait for: the local checks already ran.
 */
export async function* waitForCiIfAny(ws: Workspace, prNumber: number, o: Timing): Flow<void> {
  if (ws.config.publish.waitForCi && (await runsChecksOnPullRequests(ws.root))) {
    yield* waitForCi(ws, prNumber, o);
  }
}

async function* waitForCi(ws: Workspace, prNumber: number, o: Timing): Flow<void> {
  const deadline = o.now().getTime() + ws.config.publish.ciTimeoutMinutes * 60_000;
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

/** How a commit's deployment went: what the host said, or that it said nothing in time. */
type DeploymentEnd =
  | { state: "success" | "failed"; deployment: Deployment }
  | { state: "unreported" | "late" };

/**
 * Follow the GitHub deployment of a commit until the host says how it went, saying what the build
 * is doing as it goes (a line only when it changes). Nobody reporting within `unreportedAfterMs`
 * means no host is connected to GitHub; past the publish's deploy timeout, it's late.
 */
async function* followDeployment(
  ws: Workspace,
  sha: string,
  o: Timing,
  shown: { id: StepId; title: string; unreportedAfterMs: number },
  ignoredDeploymentIds: number[] = [],
): Flow<DeploymentEnd> {
  const started = o.now().getTime();
  const deadline = started + ws.config.publish.deployTimeoutMinutes * 60_000;
  let line = "";
  while (true) {
    const deployments = (await ws.github.deploymentsFor(sha).catch(() => [])).filter(
      (d) => !ignoredDeploymentIds.includes(d.id),
    );
    const deployment = deployments.find((d) => d.isProduction) ?? deployments[0];
    // A build GitHub runs for this commit says the host is connected, and what it's doing.
    const build = await ws.github.buildProgress?.(sha).catch(() => undefined);
    if (deployment?.state === "success") return { state: "success", deployment };
    if (deployment?.state === "failure" || deployment?.state === "error") {
      return { state: "failed", deployment };
    }
    const t = o.now().getTime();
    if (!deployment && !build && t > started + shown.unreportedAfterMs)
      return { state: "unreported" };
    if (t > deadline) return { state: "late" };
    const next = buildLine(build, t - started);
    if ((deployment || build) && next !== line) {
      line = next;
      yield step(shown.id, "running", shown.title, line);
    }
    await o.sleep(o.poll);
  }
}

export async function* waitForDeploy(
  ws: Workspace,
  sha: string,
  o: Timing,
  ignoredDeploymentIds: number[] = [],
): Flow<{
  state: PublishResult["deploy"];
  url?: string;
  site?: PublishResult["site"];
  noHost?: true;
}> {
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
    const site = moving
      ? yield* followSite(ws, sha, o, moving.url, ignoredDeploymentIds)
      : undefined;
    return { state: "lovable", ...(url ? { url } : {}), ...(site ? { site } : {}) };
  }
  yield step("deploy", "running", "Going live");
  const end = yield* followDeployment(
    ws,
    sha,
    o,
    {
      id: "deploy",
      title: "Going live",
      unreportedAfterMs: 75_000,
    },
    ignoredDeploymentIds,
  );
  const liveUrl = ws.config.liveUrl ? { url: ws.config.liveUrl } : {};
  switch (end.state) {
    case "success": {
      const url = end.deployment.url ?? ws.config.liveUrl;
      yield step("deploy", "done", "You're live", url);
      return { state: "live", ...(url ? { url } : {}) };
    }
    case "failed":
      yield step("deploy", "failed", "Your host couldn't put it live");
      throw new ClodableError({
        code: "deploy-failed",
        message: "Your changes are saved, but your host couldn't put them live.",
        hint: "Your previous version is still live. Fix the hosting problem, then retry Publish; no new app change is needed.",
        ...(end.deployment.logUrl ? { details: end.deployment.logUrl } : {}),
      });
    case "unreported": {
      // Nothing ever reported a deployment here: no host puts this app online from GitHub.
      if ((await ws.github.hasDeployments?.().catch(() => undefined)) === false) {
        yield step(
          "deploy",
          "done",
          "Published on GitHub",
          "No host puts it online from there yet",
        );
        return { state: "unknown", noHost: true };
      }
      yield step("deploy", "done", "Published", "Your host will put it live in a moment");
      return { state: "unknown", ...liveUrl };
    }
    case "late":
      yield step("deploy", "warning", "Still going live", "Your host is taking longer than usual");
      return { state: "pending", ...liveUrl };
  }
}

/**
 * The site on Netlify while the move is under way: its workflow records a GitHub deployment for
 * the commit. A site that didn't update is said plainly, never an error: the live app is on Lovable.
 */
async function* followSite(
  ws: Workspace,
  sha: string,
  o: Timing,
  url: string,
  ignoredDeploymentIds: number[] = [],
): Flow<NonNullable<PublishResult["site"]>> {
  yield step("move:site", "running", "Updating your site on Netlify");
  const end = yield* followDeployment(
    ws,
    sha,
    o,
    {
      id: "move:site",
      title: "Updating your site on Netlify",
      unreportedAfterMs: 120_000,
    },
    ignoredDeploymentIds,
  );
  if (end.state === "success") {
    const siteUrl = end.deployment.url ?? url;
    yield step("move:site", "done", "Your site on Netlify is up to date", siteUrl);
    return { url: siteUrl, state: "live" };
  }
  if (end.state === "failed") {
    const { logUrl } = end.deployment;
    yield step("move:site", "warning", "Your site on Netlify didn't update", logUrl);
    return { url, state: "failed", ...(logUrl ? { logUrl } : {}) };
  }
  yield step("move:site", "warning", "Your site on Netlify is still updating", url);
  return { url, state: "pending" };
}
