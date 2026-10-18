import { existsSync } from "node:fs";
import { appendFile, readFile, realpath } from "node:fs/promises";
import { join } from "node:path";
import { scanStaged } from "./checks/secrets.js";
import { CloclodError } from "./errors.js";
import { type Flow, step } from "./events.js";
import { Git } from "./git.js";
import { GhCli } from "./github/gh.js";
import type { GitHubAdapter, RepoInfo } from "./github/types.js";
import { keepIgnored } from "./kit/index.js";
import { writeJsonFile } from "./places.js";
import { detectProject } from "./project.js";

const PENDING = ".clodable/local/new-app.json";
interface NewApp {
  account: string;
  name: string;
  destination?: { repo: RepoInfo; cloneUrl: string };
}

export async function pendingNewApp(root: string): Promise<NewApp | undefined> {
  const path = join(root, PENDING);
  return existsSync(path) ? (JSON.parse(await readFile(path, "utf8")) as NewApp) : undefined;
}

/** Explicit panel consent starts saving a local prototype. App files never enter the initial
 * live version, and every file is checked before a private destination is created. A failed
 * attempt keeps the files intact and remembers only the destination it actually created. */
export async function* prepareNewApp(
  root: string,
  options: { name: string; account: string },
  github: GitHubAdapter = new GhCli(root),
): Flow<{ root: string; liveBranch: string }> {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/.test(options.name) || /\.git$/i.test(options.name)) {
    throw new CloclodError({
      code: "invalid-config",
      message: "Give your app a short name using letters, numbers or dashes.",
    });
  }
  const viewer = await github.viewer();
  if (viewer.login !== options.account) {
    throw new CloclodError({
      code: "gh-auth",
      message: "The connected GitHub account has changed.",
      hint: "Open Set up saving again and check the account before continuing.",
    });
  }
  const project = await detectProject(root);
  if (project.appType === "unknown") {
    throw new CloclodError({
      code: "invalid-config",
      message: "Your local app needs a little preparation before saving.",
      hint: "Ask Claude to prepare this prototype for Cloclod, keeping your design and content.",
    });
  }
  const git = new Git(root);
  let pending = await pendingNewApp(root);
  if (pending && (pending.name !== options.name || pending.account !== options.account)) {
    if (pending.destination)
      throw new CloclodError({
        code: "invalid-config",
        message: "Saving was already started for a different app name or account.",
        hint: `Continue with ${pending.account}/${pending.name}. Your local work is still here.`,
      });
    pending = { ...options };
    await writeJsonFile(join(root, PENDING), pending);
  }
  if (await git.isRepo()) {
    if (!pending || (await realpath(await git.root())) !== (await realpath(root))) {
      throw new CloclodError({
        code: "already-there",
        message: "This folder already belongs to an app.",
        hint: "Open Cloclod to set up that app. Start a new idea in an empty folder.",
      });
    }
  } else {
    pending = { ...options };
    await writeJsonFile(join(root, PENDING), pending);
    await git.ok(["init", "--initial-branch=main"]);
  }
  // Ignore local state and environment files before anything is staged or sent.
  await keepIgnored(root);
  const ignored = await readFile(join(root, ".gitignore"), "utf8");
  const missing = ["node_modules/", "dist/", ".env", ".env.*", "!.env.example"].filter(
    (line) => !ignored.split("\n").includes(line),
  );
  if (missing.length)
    await appendFile(join(root, ".gitignore"), `\n# Local app files\n${missing.join("\n")}\n`);
  yield step("setup:app", "running", "Checking your local app before saving");
  await git.stageAll();
  const secrets = (await scanStaged(root)).filter((f) => f.severity === "block");
  if (secrets.length) {
    throw new CloclodError({
      code: "secret-found",
      message: "A secret key needs to stay out of your app's code.",
      hint: "Ask Claude to move it out, then try Set up saving again. Nothing was sent to GitHub.",
      files: secrets.map((f) => f.file),
    });
  }
  if (!pending!.destination) {
    if (!github.createPrivateRepository)
      throw new CloclodError({
        code: "unknown",
        message: "This GitHub connection can't create a new app.",
      });
    yield step(
      "setup:app",
      "running",
      "Creating your private app on GitHub",
      `${options.account}/${options.name}`,
    );
    pending!.destination = await github.createPrivateRepository(options.name);
    await writeJsonFile(join(root, PENDING), pending);
  }
  const { repo, cloneUrl } = pending!.destination!;
  if (!repo.isPrivate || repo.owner !== options.account || repo.name !== options.name) {
    throw new CloclodError({
      code: "gh-auth",
      message: "GitHub returned a different app than the one you approved.",
      hint: "Nothing was sent. Check your GitHub account before continuing.",
    });
  }
  const remote = await git.remoteUrl("origin");
  if (remote && remote !== cloneUrl)
    throw new CloclodError({
      code: "already-there",
      message: "This folder is connected to a different app.",
      hint: "Your files are unchanged. Ask Claude to check the connection before saving.",
    });
  if (!remote) await git.ok(["remote", "add", "origin", cloneUrl]);
  if (github instanceof GhCli) await github.configureCredentials();
  await git.ok(["fetch", "origin", repo.defaultBranch]);
  if (!(await git.head())) {
    await git.ok(["symbolic-ref", "HEAD", `refs/heads/${repo.defaultBranch}`]);
    // Set the starting point without checking out or overwriting any prototype files.
    await git.ok(["reset", "--mixed", `origin/${repo.defaultBranch}`]);
  }
  yield step("setup:app", "done", "Your private app is ready for its first save");
  return { root, liveBranch: repo.defaultBranch };
}
