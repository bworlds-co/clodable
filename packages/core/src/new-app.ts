import { existsSync } from "node:fs";
import { appendFile, mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scanHistory, scanStaged } from "./checks/secrets.js";
import { ClodableError } from "./errors.js";
import { type Flow, step } from "./events.js";
import { Git } from "./git.js";
import { GhCli } from "./github/gh.js";
import type { GitHubAdapter, RepoInfo } from "./github/types.js";
import { tr } from "./i18n.js";
import { keepIgnored } from "./kit/index.js";
import { inspectLocalApp, type LocalApp, localAppForSaving } from "./local-app.js";
import { writeJsonFile } from "./places.js";
import { lockSetup } from "./setup-lock.js";
import { draftBranchFor } from "./workspace.js";

const PENDING = ".clodable/local/new-app.json";
interface HistorySource {
  head: string;
  branch?: string;
  draft: string;
  anchor?: string;
}
interface NewApp {
  name: string;
  account: string;
  version?: 1;
  root?: string;
  history?: HistorySource;
  base?: string;
  destination?: { repo: RepoInfo; cloneUrl: string };
}

export async function pendingNewApp(root: string): Promise<NewApp | undefined> {
  const path = join(root, PENDING);
  return existsSync(path) ? (JSON.parse(await readFile(path, "utf8")) as NewApp) : undefined;
}

function protectedApp(): never {
  throw new ClodableError({
    code: "already-there",
    message: tr("This folder already belongs to an app."),
    hint: tr("Your files are unchanged. Ask Claude to check the connection before saving."),
  });
}

function changedHistory(): never {
  throw new ClodableError({
    code: "needs-choice",
    message: tr("Review this app's existing versions before creating its private copy."),
    hint: tr("Open Set up saving again and confirm that these versions should be kept."),
  });
}

async function remotesOf(git: Git): Promise<string[]> {
  return (await git.ok(["remote"])).split("\n").filter(Boolean);
}

function matchingDestination(pending: NewApp): boolean {
  const destination = pending.destination;
  return Boolean(
    destination?.repo.isPrivate &&
      destination.repo.owner === pending.account &&
      destination.repo.name === pending.name &&
      destination.cloneUrl,
  );
}

/** A marker is not permission to repurpose a repository or another worktree. */
async function validateScope(
  git: Git,
  local: LocalApp,
  pending: NewApp | undefined,
  canonicalRoot: string,
) {
  if (["nested", "protected"].includes(local.repository)) protectedApp();
  if (local.repository === "unavailable") await git.ready();
  if (local.repository !== "remote") return;
  if (!pending || !matchingDestination(pending)) protectedApp();
  const remotes = await remotesOf(git);
  if (
    remotes.length !== 1 ||
    remotes[0] !== "origin" ||
    (await git.remoteUrl("origin")) !== pending.destination!.cloneUrl
  )
    protectedApp();
  if (pending.version === 1 && pending.root === canonicalRoot) {
    const head = await git.head();
    if (pending.history) {
      if (!/^[a-f0-9]{40,64}$/.test(pending.history.head)) protectedApp();
      if (head === pending.history.head) return;
      if (
        pending.history.anchor &&
        head &&
        (await git.run(["merge-base", "--is-ancestor", pending.history.anchor, head])).exitCode ===
          0
      )
        return;
      changedHistory();
    }
    if (
      !head ||
      (pending.base &&
        (await git.run(["merge-base", "--is-ancestor", pending.base, head])).exitCode === 0)
    )
      return;
    protectedApp();
  }
  // Old interrupted setups have no phase fields. Only their untouched initial base is resumable.
  const head = await git.head();
  const initial = await git.revParse(`origin/${pending.destination!.repo.defaultBranch}`);
  if (head && head !== initial) protectedApp();
}

function isPrivatePath(name: string): boolean {
  return (
    (/(^|\/)\.env(?:$|[./])/i.test(name) && !/(^|\/)\.env\.example$/i.test(name)) ||
    /(^|\/)\.clodable\/(?:local|inbox)(?:\/|$)/i.test(name)
  );
}

async function checkPrivateIndex(git: Git) {
  const files = (await git.ok(["ls-files", "--cached", "-z"])).split("\0").filter(isPrivatePath);
  if (files.length)
    throw new ClodableError({
      code: "secret-found",
      message: tr("Some files selected for saving must stay on this computer."),
      hint: tr("Ask Claude to keep these files local, then try again. Nothing was sent."),
      files,
    });
}

/** Adding the working tree must not discard a different version held only in the index. */
async function checkIndex(git: Git) {
  await checkPrivateIndex(git);
  const staged = (await git.ok(["diff", "--cached", "--name-only", "--no-renames", "-z"]))
    .split("\0")
    .filter(Boolean);
  if (!staged.length) return;
  const working = new Set([
    ...(await git.ok(["diff", "--name-only", "--no-renames", "-z"])).split("\0"),
    ...(await git.ok(["ls-files", "--others", "--exclude-standard", "-z"])).split("\0"),
  ]);
  const files = staged.filter((name) => working.has(name));
  if (files.length)
    throw new ClodableError({
      code: "needs-choice",
      message: tr("Some unsaved work needs checking before setting up saving."),
      hint: tr("Ask Claude to preserve both local versions of these files, then try again."),
      files,
    });
}

/** Check the intended save without leaving staged changes behind after failure or retry. */
async function checkLocalFiles(root: string, git: Git) {
  const temporary = await mkdtemp(join(tmpdir(), "clodable-setup-index-"));
  try {
    const indexFile = join(temporary, "index");
    const preview = new Git(root, { indexFile });
    await preview.ok(["read-tree", (await git.head()) ? "HEAD" : "--empty"]);
    await preview.stageAll();
    await checkPrivateIndex(preview);
    return (await scanStaged(root, { indexFile })).filter(
      (finding) => finding.severity === "block",
    );
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

async function checkHistory(git: Git, root: string, head: string) {
  // Never exclude old remote-tracking refs: every ancestor of this HEAD will be transferred.
  const names = await git.ok(["log", "-m", "--format=", "--name-only", "-z", head, "--"]);
  const protectedFiles = [
    ...new Set(names.split("\0").map((name) => name.replace(/^\n+/, ""))),
  ].filter(isPrivatePath);
  if (protectedFiles.length)
    throw new ClodableError({
      code: "secret-found",
      message: tr("Earlier versions contain files that must stay on this computer."),
      hint: tr(
        "Ask Claude to inspect these versions. Nothing was sent and the history was not changed.",
      ),
      files: protectedFiles,
    });
  const found = (await scanHistory(root, head)).filter((finding) => finding.severity === "block");
  if (found.length)
    throw new ClodableError({
      code: "secret-found",
      message: tr("A secret key is in an earlier version of this app."),
      hint: tr(
        "Ask Claude to inspect these versions. Nothing was sent and the history was not changed.",
      ),
      files: found.map((finding) => finding.file),
    });
}

async function verifySource(git: Git, pending: NewApp) {
  const source = pending.history;
  if (!source) {
    const head = await git.head();
    if (
      !head ||
      (pending.base &&
        (await git.run(["merge-base", "--is-ancestor", pending.base, head])).exitCode === 0)
    )
      return;
    changedHistory();
  }
  if (source.branch && (await git.revParse(`refs/heads/${source.branch}`)) !== source.head)
    changedHistory();
  const head = await git.head();
  if (head === source.head) return;
  if (
    source.anchor &&
    head &&
    (await git.run(["merge-base", "--is-ancestor", source.anchor, head])).exitCode === 0
  )
    return;
  changedHistory();
}

/** Explicit consent creates a private destination; existing versions stay on a private draft. */
export async function* prepareNewApp(
  root: string,
  options: { name: string; account: string; adoptHistory?: string },
  github: GitHubAdapter = new GhCli(root),
): Flow<{ root: string; liveBranch: string }> {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/.test(options.name) || /\.git$/i.test(options.name))
    throw new ClodableError({
      code: "invalid-config",
      message: tr("Give your app a short name using letters, numbers or dashes."),
    });
  const release = await lockSetup(root);
  try {
    const local = await localAppForSaving(root);
    const canonicalRoot = await realpath(root);
    const git = new Git(root);
    await git.ready();
    let pending = await pendingNewApp(root);
    await validateScope(git, local, pending, canonicalRoot);
    if (pending?.root && pending.root !== canonicalRoot) protectedApp();
    if (local.repository !== "none") await checkIndex(git);
    if (pending && (pending.name !== options.name || pending.account !== options.account)) {
      if (pending.destination || pending.history?.anchor)
        throw new ClodableError({
          code: "invalid-config",
          message: tr("Saving was already started for a different app name or account."),
          hint: tr("Continue with {0}/{1}. Your local work is still here.", {
            "0": pending.account,
            "1": pending.name,
          }),
        });
      if (pending.history && options.adoptHistory !== local.head) changedHistory();
      pending = undefined;
    }
    let source = pending?.history;
    if (local.repository === "history" && !source) {
      // A name-only marker never grants permission for pre-existing history.
      if (options.adoptHistory !== local.head) changedHistory();
      const draft = draftBranchFor(options.account);
      if (await git.branchExists(draft)) changedHistory();
      source = { head: local.head!, branch: await git.currentBranch(), draft };
    }
    if (source) {
      // The branch name is derived, never taken on trust from an editable marker.
      if (source.draft !== draftBranchFor(options.account)) protectedApp();
      await verifySource(git, { name: options.name, account: options.account, history: source });
      yield step("setup:app", "running", tr("Checking your existing versions before saving"));
      await checkHistory(git, root, source.head);
    }
    const viewer = await github.viewer();
    if (viewer.login !== options.account)
      throw new ClodableError({
        code: "gh-auth",
        message: tr("The connected GitHub account has changed."),
        hint: tr("Open Set up saving again and check the account before continuing."),
      });
    pending = {
      ...pending,
      name: options.name,
      account: options.account,
      version: 1,
      root: canonicalRoot,
      ...(source ? { history: source } : {}),
    };
    if (pending.destination && !source && !pending.base) {
      const initial = await git.revParse(`origin/${pending.destination.repo.defaultBranch}`);
      if (initial && (await git.head()) === initial) pending.base = initial;
    }
    const current = await inspectLocalApp(root);
    await validateScope(git, current, pending, canonicalRoot);
    await verifySource(git, pending);
    if (current.repository !== "none") await checkIndex(git);
    await writeJsonFile(join(root, PENDING), pending);
    if (local.repository === "none") await git.ok(["init", "--initial-branch=main"]);

    await keepIgnored(root);
    const ignored = await readFile(join(root, ".gitignore"), "utf8");
    const missing = ["node_modules/", "dist/", ".env", ".env.*", "!.env.example"].filter(
      (line) => !ignored.split("\n").includes(line),
    );
    if (missing.length)
      await appendFile(join(root, ".gitignore"), `\n# Local app files\n${missing.join("\n")}\n`);
    yield step("setup:app", "running", tr("Checking your local app before saving"));
    const secrets = await checkLocalFiles(root, git);
    if (secrets.length)
      throw new ClodableError({
        code: "secret-found",
        message: tr("A secret key needs to stay out of your app's code."),
        hint: tr(
          "Ask Claude to move it out, then try Set up saving again. Nothing was sent to GitHub.",
        ),
        files: secrets.map((finding) => finding.file),
      });
    await verifySource(git, pending);
    await validateScope(git, await inspectLocalApp(root), pending, canonicalRoot);
    if (!pending.destination) {
      if ((await remotesOf(git)).length) protectedApp();
      if (!github.createPrivateRepository)
        throw new ClodableError({
          code: "unknown",
          message: tr("This GitHub connection can't create a new app."),
        });
      yield step(
        "setup:app",
        "running",
        tr("Creating your private app on GitHub"),
        `${options.account}/${options.name}`,
      );
      pending.destination = await github.createPrivateRepository(options.name);
      await writeJsonFile(join(root, PENDING), pending);
    }
    if (!matchingDestination(pending))
      throw new ClodableError({
        code: "gh-auth",
        message: tr("GitHub returned a different app than the one you approved."),
        hint: tr("Nothing was sent. Check your GitHub account before continuing."),
      });
    const { repo, cloneUrl } = pending.destination!;
    await verifySource(git, pending);
    const remote = await git.remoteUrl("origin");
    if (remote && remote !== cloneUrl) protectedApp();
    if (!remote) await git.ok(["remote", "add", "origin", cloneUrl]);
    if (github instanceof GhCli) await github.configureCredentials();
    await git.ok(["fetch", "origin", repo.defaultBranch]);
    const base = await git.revParse(`origin/${repo.defaultBranch}`);
    if (!base) protectedApp();
    pending.base ??= base;
    await verifySource(git, pending);
    if (source) {
      await verifySource(git, pending);
      if (!source.anchor) {
        const tree = await git.ok(["rev-parse", `${source.head}^{tree}`]);
        source.anchor = await git.ok(
          [
            "-c",
            `user.name=${viewer.name ?? viewer.login}`,
            "-c",
            `user.email=${viewer.email}`,
            "commit-tree",
            tree,
            "-p",
            source.head,
            "-p",
            pending.base,
          ],
          { input: "Kept existing local versions\n" },
        );
        await writeJsonFile(join(root, PENDING), pending);
      }
      const draftRef = `refs/heads/${source.draft}`;
      const current = await git.revParse(draftRef);
      if (!current) await git.ok(["update-ref", draftRef, source.anchor, ""]);
      else if (
        (await git.run(["merge-base", "--is-ancestor", source.anchor, current])).exitCode !== 0
      )
        changedHistory();
      // Changing only HEAD preserves all original refs, the index, and every working file.
      await git.ok(["symbolic-ref", "HEAD", draftRef]);
    } else {
      await writeJsonFile(join(root, PENDING), pending);
      if (!(await git.head())) {
        await git.ok(["symbolic-ref", "HEAD", `refs/heads/${repo.defaultBranch}`]);
        await git.ok(["reset", "--mixed", `origin/${repo.defaultBranch}`]);
      }
    }
    yield step("setup:app", "done", tr("Your private app is ready for its first save"));
    return { root, liveBranch: repo.defaultBranch };
  } finally {
    await release();
  }
}
