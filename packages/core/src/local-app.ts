import { lstat, readdir, realpath } from "node:fs/promises";
import { join, resolve } from "node:path";
import { ClodableError } from "./errors.js";
import { Git } from "./git.js";
import { tr } from "./i18n.js";
import { type AppType, detectProject } from "./project.js";

/** Independent facts about this folder, never the contents of an enclosing repository. */
export interface LocalApp {
  contents: "empty" | "supported" | "unsupported";
  repository: "none" | "unborn" | "history" | "remote" | "nested" | "protected" | "unavailable";
  appType?: AppType;
  head?: string;
}

export async function localAppForSaving(root: string): Promise<LocalApp> {
  const local = await inspectLocalApp(root);
  if (
    ["nested", "protected"].includes(local.repository) ||
    (local.repository === "remote" && local.contents !== "supported")
  )
    throw new ClodableError({
      code: "already-there",
      message: tr("This folder already belongs to an app."),
      hint: tr("Your files are unchanged. Ask Claude to check the connection before saving."),
    });
  if (local.contents !== "supported")
    throw new ClodableError({
      code: "invalid-config",
      message: tr("Your local app needs a little preparation before saving."),
      hint: tr(
        "Ask Claude to prepare this prototype for Clodable, keeping your design and content.",
      ),
    });
  return local;
}

export async function inspectLocalApp(root: string): Promise<LocalApp> {
  const entries = await readdir(root);
  const empty = entries.every((entry) => entry.startsWith("."));
  const project = empty ? undefined : await detectProject(root);
  const local: LocalApp = {
    contents: empty ? "empty" : project?.appType === "unknown" ? "unsupported" : "supported",
    repository: "unavailable",
    ...(project ? { appType: project.appType } : {}),
  };
  const metadata = await lstat(join(root, ".git")).catch(() => undefined);
  const git = new Git(root);
  try {
    const inside = await git.run(["rev-parse", "--is-inside-work-tree"]);
    if (inside.exitCode !== 0 || inside.stdout.trim() !== "true") {
      const bare = await git.run(["rev-parse", "--is-bare-repository"]);
      local.repository =
        metadata || bare.stdout.trim() === "true" || !/not a git repository/i.test(inside.stderr)
          ? "protected"
          : "none";
      return local;
    }
    if ((await realpath(await git.root())) !== (await realpath(root))) {
      local.repository = "nested";
      return local;
    }
    const common = await git.ok(["rev-parse", "--git-common-dir"]);
    if (
      !metadata?.isDirectory() ||
      metadata.isSymbolicLink() ||
      (await realpath(resolve(root, common))) !== (await realpath(join(root, ".git"))) ||
      (await git.ok(["rev-parse", "--show-superproject-working-tree"])).length > 0
    ) {
      local.repository = "protected";
      return local;
    }
    const interrupted = await Promise.all(
      [
        "MERGE_HEAD",
        "CHERRY_PICK_HEAD",
        "REVERT_HEAD",
        "rebase-merge",
        "rebase-apply",
        "shallow",
        "info/grafts",
      ].map((name) =>
        lstat(join(root, ".git", name)).then(
          () => true,
          () => false,
        ),
      ),
    );
    if (
      interrupted.some(Boolean) ||
      (await git.ok(["for-each-ref", "--format=%(refname)", "refs/replace"])).length > 0
    ) {
      // Never adopt an unfinished operation or a history view that can hide original ancestors.
      local.repository = "protected";
      return local;
    }
    if ((await git.ok(["remote"])).length > 0) {
      local.repository = "remote";
      return local;
    }
    const head = await git.head();
    if (head) {
      local.repository = "history";
      local.head = head;
    } else {
      // An orphan branch alongside other local branches is not a fresh, unborn repository.
      const refs = await git.ok(["for-each-ref", "--format=%(refname)", "refs/heads", "refs/tags"]);
      local.repository = (await git.currentBranch()) && !refs ? "unborn" : "protected";
    }
    return local;
  } catch (error) {
    if (error instanceof ClodableError && error.code === "tools-unavailable") return local;
    local.repository = "protected";
    return local;
  }
}
