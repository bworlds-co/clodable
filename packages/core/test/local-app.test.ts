import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeGitHub, Git, inspectLocalApp, prepareNewApp, runFlow } from "../src/index.js";

let dir: string;
let root: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "clodable-local-app-"));
  root = join(dir, "app");
  await mkdir(root);
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(dir, { recursive: true, force: true });
});
async function supported(where = root) {
  await writeFile(
    join(where, "package.json"),
    JSON.stringify({ dependencies: { vite: "*", react: "*" } }),
  );
}

describe("local app inspection", () => {
  it("separates visible content from Git, including an empty initialized folder", async () => {
    expect(await inspectLocalApp(root)).toEqual({ contents: "empty", repository: "none" });
    await writeFile(join(root, ".gitignore"), ".env\n");
    await new Git(root).ok(["init", "--quiet"]);
    expect(await inspectLocalApp(root)).toEqual({ contents: "empty", repository: "unborn" });
    await writeFile(join(root, "index.html"), "<h1>Hello</h1>");
    expect(await inspectLocalApp(root)).toMatchObject({
      contents: "unsupported",
      repository: "unborn",
    });
    await supported();
    expect(await inspectLocalApp(root)).toMatchObject({
      contents: "supported",
      repository: "unborn",
      appType: "vite-spa",
    });
  });

  it("detects supported and unsupported prototypes without requiring a repository", async () => {
    await supported();
    expect(await inspectLocalApp(root)).toMatchObject({
      contents: "supported",
      repository: "none",
    });
    await writeFile(join(root, "package.json"), "{}");
    expect(await inspectLocalApp(root)).toMatchObject({
      contents: "unsupported",
      appType: "unknown",
    });
    await writeFile(join(root, "package.json"), "{ broken");
    expect(await inspectLocalApp(root)).toMatchObject({ contents: "unsupported" });
  });

  it("reports contents even when Git is unavailable", async () => {
    await supported();
    vi.stubEnv("PATH", join(dir, "missing-tools"));
    expect(await inspectLocalApp(root)).toMatchObject({
      contents: "supported",
      repository: "unavailable",
    });
  });

  it("reports current history and protects every configured remote from forged markers", async () => {
    await supported();
    const git = new Git(root);
    await git.ok(["init", "--quiet"]);
    await git.setLocalIdentity({ name: "Test", email: "test@example.com" });
    await git.commitAll("Local version", { kind: "save" });
    expect(await inspectLocalApp(root)).toMatchObject({
      repository: "history",
      head: await git.head(),
    });
    await git.ok(["remote", "add", "upstream", "https://github.com/other/app.git"]);
    await mkdir(join(root, ".clodable/local"), { recursive: true });
    await writeFile(
      join(root, ".clodable/local/new-app.json"),
      JSON.stringify({ name: "app", account: "ada" }),
    );
    expect(await inspectLocalApp(root)).toMatchObject({ repository: "remote" });
    const github = new FakeGitHub(join(dir, "remote.git"));
    const create = vi.spyOn(github, "createPrivateRepository");
    await expect(
      runFlow(prepareNewApp(root, { name: "app", account: "ada" }, github)),
    ).rejects.toMatchObject({ code: "already-there" });
    expect(create).not.toHaveBeenCalled();
    expect(await git.remoteUrl("upstream")).toBe("https://github.com/other/app.git");
  });

  it("does not inspect or adopt an enclosing repository as the current app", async () => {
    await supported();
    const parent = new Git(dir);
    await parent.ok(["init", "--quiet"]);
    expect(await inspectLocalApp(root)).toMatchObject({
      contents: "supported",
      repository: "nested",
    });
    await expect(
      runFlow(
        prepareNewApp(
          root,
          { name: "app", account: "ada" },
          new FakeGitHub(join(dir, "remote.git")),
        ),
      ),
    ).rejects.toMatchObject({ code: "already-there" });
  });

  it("protects malformed metadata and linked worktrees", async () => {
    await supported();
    await mkdir(join(root, ".git"));
    expect(await inspectLocalApp(root)).toMatchObject({ repository: "protected" });
    await rm(join(root, ".git"), { recursive: true });
    const git = new Git(root);
    await git.ok(["init", "--quiet"]);
    await git.setLocalIdentity({ name: "Test", email: "test@example.com" });
    await git.commitAll("Initial version", { kind: "save" });
    const linked = join(dir, "linked");
    await git.ok(["worktree", "add", "-b", "linked", linked]);
    expect(await inspectLocalApp(linked)).toMatchObject({
      contents: "supported",
      repository: "protected",
    });
  });

  it("protects unfinished operations and rewritten history views", async () => {
    await supported();
    const git = new Git(root);
    await git.ok(["init", "--quiet"]);
    await git.setLocalIdentity({ name: "Test", email: "test@example.com" });
    await git.commitAll("Initial version", { kind: "save" });
    const head = (await git.head())!;
    await writeFile(join(root, ".git/MERGE_HEAD"), `${head}\n`);
    expect(await inspectLocalApp(root)).toMatchObject({ repository: "protected" });
    await rm(join(root, ".git/MERGE_HEAD"));
    await writeFile(join(root, ".git/shallow"), `${head}\n`);
    expect(await inspectLocalApp(root)).toMatchObject({ repository: "protected" });
    await rm(join(root, ".git/shallow"));
    await git.ok(["update-ref", `refs/replace/${head}`, head]);
    expect(await inspectLocalApp(root)).toMatchObject({ repository: "protected" });
  });
});
