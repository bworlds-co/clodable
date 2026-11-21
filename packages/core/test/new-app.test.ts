import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyKit,
  FakeGitHub,
  Git,
  loadConfig,
  planKit,
  prepareNewApp,
  runFlow,
  save,
  Workspace,
} from "../src/index.js";

let dir: string;
let root: string;
let github: FakeGitHub;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "clodable-idea-test-"));
  root = join(dir, "book-swap");
  await mkdir(root);
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({
      name: "book-swap",
      dependencies: { vite: "*", react: "*" },
      scripts: { build: "node -e ''" },
    }),
  );
  await writeFile(join(root, "index.html"), "<h1>Books to share</h1>");
  await writeFile(join(root, "README.md"), "My original notes");
  await writeFile(join(root, ".env.local"), "PRIVATE_SETTING=keep-on-this-computer");
  github = new FakeGitHub(join(dir, "new.git"));
});
afterEach(async () => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  await rm(dir, { recursive: true, force: true });
});
const start = () => runFlow(prepareNewApp(root, { name: "book-swap", account: "ada" }, github));

describe("saving a local idea", () => {
  it.skipIf(process.platform === "win32")(
    "resumes the same destination after Git is repaired",
    async () => {
      await start();
      const marker = join(root, ".clodable/local/new-app.json");
      const pending = await readFile(marker, "utf8");
      const create = vi.spyOn(github, "createPrivateRepository");
      const bin = join(dir, "broken-tools");
      await mkdir(bin);
      await writeFile(join(bin, "git"), "#!/bin/sh\necho 'broken developer tools' >&2\nexit 1\n", {
        mode: 0o755,
      });
      vi.stubEnv("PATH", `${bin}:${process.env.PATH}`);
      await expect(start()).rejects.toMatchObject({ code: "tools-unavailable" });
      expect(await readFile(marker, "utf8")).toBe(pending);
      expect(create).not.toHaveBeenCalled();
      vi.unstubAllEnvs();
      await start();
      expect(create).not.toHaveBeenCalled();
      expect(await readFile(marker, "utf8")).toBe(pending);
    },
  );

  it("keeps prototype files intact, creates one private destination, then saves only to the draft", async () => {
    await start();
    expect(await readFile(join(root, "README.md"), "utf8")).toBe("My original notes");
    await start();
    const git = new Git(root);
    const config = {
      ...(await loadConfig(root)),
      backend: "none" as const,
      hosting: "none" as const,
    };
    const before = await Workspace.open({ cwd: root, github, requireSetup: false });
    await applyKit(root, await planKit(before.project, config));
    const ws = await Workspace.open({ cwd: root, github });
    const saved = await save(ws, { message: "First version" });
    expect(saved.pushed).toBe(true);
    const live = await new Git(github.bareRepo).ok(["ls-tree", "--name-only", "main"]);
    expect(live).toBe("README.md");
    expect(await git.ok(["show", "origin/draft/ada:index.html"])).toBe("<h1>Books to share</h1>");
    expect(await git.ok(["ls-files"])).not.toMatch(/\.env|new-app\.json/);
    expect(github.pullRequests).toHaveLength(1);
  });

  it("stops a secret before creating anything remotely, and can continue after repair", async () => {
    const synthetic = ["sk", "live", "51NzQx8LkTmV3pR7wYb2Hc9Dj4Fg6Ks1Qa"].join("_");
    await writeFile(join(root, "config.js"), `export const token = "${synthetic}";`);
    await expect(start()).rejects.toMatchObject({ code: "secret-found" });
    expect(existsSync(github.bareRepo)).toBe(false);
    expect(existsSync(join(root, ".git/index"))).toBe(false);
    expect(await readFile(join(root, "config.js"), "utf8")).toContain(synthetic);
    await rm(join(root, "config.js"));
    await start();
    expect(existsSync(github.bareRepo)).toBe(true);
  });

  it("refuses an account change and an already connected repository", async () => {
    await expect(
      runFlow(prepareNewApp(root, { name: "book-swap", account: "someone-else" }, github)),
    ).rejects.toMatchObject({ code: "gh-auth" });
    expect(existsSync(join(root, ".git"))).toBe(false);
    await new Git(root).ok(["init", "--quiet"]);
    await new Git(root).ok(["remote", "add", "upstream", "https://github.com/other/app.git"]);
    await expect(start()).rejects.toMatchObject({ code: "already-there" });
    expect(existsSync(github.bareRepo)).toBe(false);
  });

  it("adopts a supported unborn repository without replacing its files", async () => {
    await new Git(root).ok(["init", "--quiet", "-b", "prototype"]);
    await start();
    expect(await readFile(join(root, "index.html"), "utf8")).toBe("<h1>Books to share</h1>");
    expect(await new Git(root).head()).toBeTruthy();
    expect(existsSync(github.bareRepo)).toBe(true);
  });

  it("routes unknown prototypes before looking up the GitHub account", async () => {
    await rm(join(root, "package.json"));
    const viewer = vi.spyOn(github, "viewer");
    await expect(start()).rejects.toMatchObject({ code: "invalid-config" });
    expect(viewer).not.toHaveBeenCalled();
    expect(existsSync(join(root, ".git"))).toBe(false);
    expect(existsSync(join(root, ".clodable"))).toBe(false);
  });

  it("requires explicit current-history consent even when a name-only marker exists", async () => {
    const { git, head } = await originalHistory();
    await mkdir(join(root, ".clodable/local"), { recursive: true });
    await writeFile(
      join(root, ".clodable/local/new-app.json"),
      JSON.stringify({ name: "book-swap", account: "ada" }),
    );
    await expect(start()).rejects.toMatchObject({ code: "needs-choice" });
    await expect(adopt("0".repeat(40))).rejects.toMatchObject({ code: "needs-choice" });
    expect(await git.head()).toBe(head);
    expect(existsSync(github.bareRepo)).toBe(false);
  });

  it.each(["different version", "deleted then recreated"])(
    "preserves the original index and working files when a staged file has a %s",
    async (difference) => {
      const { git, head } = await originalHistory();
      const path = join(root, "index.html");
      const original = await readFile(path);
      if (difference === "different version") {
        await writeFile(path, "Work saved only in the index");
        await git.ok(["add", "index.html"]);
        await writeFile(path, original);
      } else {
        await git.ok(["rm", "--cached", "index.html"]);
      }
      const index = await readFile(join(root, ".git/index"));
      const viewer = vi.spyOn(github, "viewer");
      const create = vi.spyOn(github, "createPrivateRepository");
      await expect(adopt(head)).rejects.toMatchObject({
        code: "needs-choice",
        files: ["index.html"],
      });
      expect(await readFile(join(root, ".git/index"))).toEqual(index);
      expect(await readFile(path)).toEqual(original);
      expect(await git.head()).toBe(head);
      expect(viewer).not.toHaveBeenCalled();
      expect(create).not.toHaveBeenCalled();
      expect(existsSync(join(root, ".clodable"))).toBe(false);
    },
  );

  it.each([
    ["unborn", ".env.local"],
    ["history", ".env.local"],
    ["unborn", ".clodable/local/backup/private.txt"],
    ["history", ".clodable/local/backup/private.txt"],
    ["history", ".clodable/inbox/private.json"],
  ])("keeps indexed private files local in %s repositories: %s", async (repository, file) => {
    const git = new Git(root);
    const head = repository === "history" ? (await originalHistory()).head : undefined;
    if (!head) await git.ok(["init", "--quiet"]);
    const path = join(root, file!);
    await mkdir(join(path, ".."), { recursive: true });
    await writeFile(path, "PRIVATE_SETTING=private personal value");
    await git.ok(["add", "--force", "--", file!]);
    const index = await readFile(join(root, ".git/index"));
    const viewer = vi.spyOn(github, "viewer");
    const create = vi.spyOn(github, "createPrivateRepository");
    await expect(head ? adopt(head) : start()).rejects.toMatchObject({
      code: "secret-found",
      files: [file],
    });
    expect(await readFile(join(root, ".git/index"))).toEqual(index);
    expect(await readFile(path, "utf8")).toBe("PRIVATE_SETTING=private personal value");
    expect(await git.head()).toBe(head);
    expect(viewer).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(existsSync(github.bareRepo)).toBe(false);
  });

  it("allows a different unreserved name only after fresh history approval", async () => {
    const { git, head } = await originalHistory();
    await writeFile(join(root, "index.html"), "A staged edit worth preserving");
    await git.ok(["add", "index.html"]);
    const index = await readFile(join(root, ".git/index"));
    const create = vi
      .spyOn(github, "createPrivateRepository")
      .mockRejectedValueOnce(new Error("fixture: app name already exists"));
    await expect(adopt(head)).rejects.toThrow("app name already exists");
    expect(await readFile(join(root, ".git/index"))).toEqual(index);
    const marker = join(root, ".clodable/local/new-app.json");
    const pending = await readFile(marker, "utf8");
    const renamed = (adoptHistory?: string) =>
      runFlow(prepareNewApp(root, { name: "book-swap-2", account: "ada", adoptHistory }, github));
    await expect(renamed()).rejects.toMatchObject({ code: "needs-choice" });
    await expect(renamed("0".repeat(40))).rejects.toMatchObject({ code: "needs-choice" });
    expect(await readFile(marker, "utf8")).toBe(pending);
    await writeFile(marker, JSON.stringify({ ...JSON.parse(pending), root: join(dir, "another") }));
    await expect(renamed(head)).rejects.toMatchObject({ code: "already-there" });
    await writeFile(marker, pending);
    await renamed(head);
    expect(create.mock.calls.map(([name]) => name)).toEqual(["book-swap", "book-swap-2"]);
    expect(await git.revParse("refs/heads/main")).toBe(head);
    expect(JSON.parse(await readFile(marker, "utf8"))).toMatchObject({
      name: "book-swap-2",
      destination: { repo: { name: "book-swap-2" } },
    });
  });

  it("stops if local history appears while the account is being checked", async () => {
    const viewer = github.viewer.bind(github);
    let appeared = "";
    vi.spyOn(github, "viewer").mockImplementation(async () => {
      appeared = (await originalHistory()).head;
      return viewer();
    });
    const create = vi.spyOn(github, "createPrivateRepository");
    await expect(start()).rejects.toMatchObject({ code: "needs-choice" });
    expect(create).not.toHaveBeenCalled();
    expect(await new Git(root).head()).toBe(appeared);
    expect(existsSync(join(root, ".clodable"))).toBe(false);
  });

  it("keeps original refs and history, joins the private draft to main, and saves with a PR", async () => {
    const { git, head } = await originalHistory();
    await git.ok(["branch", "other-work"]);
    await git.switchTo("other-work");
    const otherSecret = ["sk", "live", "51NzQx8LkTmV3pR7wYb2Hc9Dj4Fg6Ks1Qa"].join("_");
    await writeFile(join(root, "other-secret.js"), `export const key = '${otherSecret}';`);
    await git.commitAll("Unrelated local work", { kind: "save" });
    const otherHead = (await git.head())!;
    await git.switchTo("main");
    await git.ok(["tag", "-a", "local-tag", "-m", "Local tag"]);
    await git.ok(["config", "push.followTags", "true"]);
    const refs = await git.ok(["show-ref", "--heads", "--tags"]);
    await writeFile(join(root, "index.html"), "<h1>New local edits</h1>");
    await adopt(head);
    const anchor = await git.head();
    const config = {
      ...(await loadConfig(root)),
      backend: "none" as const,
      hosting: "none" as const,
    };
    const before = await Workspace.open({ cwd: root, github, requireSetup: false });
    await applyKit(root, await planKit(before.project, config));
    const saved = await save(await Workspace.open({ cwd: root, github }), {
      message: "Keep my app",
    });
    expect(saved.pushed).toBe(true);
    expect(saved.pullRequest).toBeDefined();
    expect(await git.currentBranch()).toBe("draft/ada");
    expect(await git.ok(["merge-base", "HEAD", "origin/main"])).toBe(
      await git.revParse("origin/main"),
    );
    expect((await git.run(["merge-base", "--is-ancestor", head, "HEAD"])).exitCode).toBe(0);
    for (const ref of refs.split("\n")) {
      const [sha, name] = ref.split(" ");
      expect(await git.ok(["rev-parse", name!])).toBe(sha);
    }
    const remote = new Git(github.bareRepo);
    expect(await remote.ok(["ls-tree", "--name-only", "main"])).toBe("README.md");
    expect(await remote.ok(["show", "draft/ada:index.html"])).toBe("<h1>New local edits</h1>");
    expect(await remote.ok(["tag"])).toBe("");
    expect((await remote.run(["cat-file", "-e", otherHead])).exitCode).not.toBe(0);
    const created = vi.spyOn(github, "createPrivateRepository");
    await start();
    expect(created).not.toHaveBeenCalled();
    expect((await git.run(["merge-base", "--is-ancestor", anchor!, "HEAD"])).exitCode).toBe(0);
  });

  it.each(["fetch", "update-ref"])(
    "resumes after interruption at %s without another destination",
    async (stop) => {
      const { git, head } = await originalHistory();
      const create = vi.spyOn(github, "createPrivateRepository");
      const original = Git.prototype.ok;
      let interrupted = false;
      const run = vi.spyOn(Git.prototype, "ok").mockImplementation(async function (
        this: Git,
        args,
        options,
      ) {
        if (this.cwd === root && args[0] === stop && !interrupted) {
          interrupted = true;
          throw new Error("interrupted fixture");
        }
        return original.call(this, args, options);
      });
      await expect(adopt(head)).rejects.toThrow("interrupted fixture");
      run.mockRestore();
      const recorded = JSON.parse(
        await readFile(join(root, ".clodable/local/new-app.json"), "utf8"),
      );
      await start();
      expect(create).toHaveBeenCalledTimes(1);
      expect(await git.revParse("refs/heads/main")).toBe(head);
      if (recorded.history.anchor) expect(await git.head()).toBe(recorded.history.anchor);
    },
  );

  it("checks deleted historical secrets before creating a destination", async () => {
    const { git } = await originalHistory();
    const secret = ["sk", "live", "51NzQx8LkTmV3pR7wYb2Hc9Dj4Fg6Ks1Qa"].join("_");
    await writeFile(join(root, "old-secret.js"), `export const key = '${secret}';`);
    await git.commitAll("Old credentials", { kind: "save" });
    await rm(join(root, "old-secret.js"));
    await git.commitAll("Removed credentials", { kind: "save" });
    await expect(adopt((await git.head())!)).rejects.toMatchObject({ code: "secret-found" });
    expect(existsSync(github.bareRepo)).toBe(false);
    expect(existsSync(join(root, ".clodable"))).toBe(false);
  });

  it("refuses historical local-only files and an unavailable history scanner", async () => {
    const { git, head } = await originalHistory();
    vi.stubEnv("CLODABLE_GITLEAKS", join(dir, "missing-scanner"));
    await expect(adopt(head)).rejects.toThrow();
    vi.unstubAllEnvs();
    await git.ok(["add", "--force", ".env.local"]);
    await git.ok(["commit", "-m", "Local environment"]);
    await git.ok(["rm", "--cached", ".env.local"]);
    await git.ok(["commit", "-m", "Keep environment local"]);
    await expect(adopt((await git.head())!)).rejects.toMatchObject({
      code: "secret-found",
      files: [".env.local"],
    });
    expect(existsSync(github.bareRepo)).toBe(false);
  });

  it("allows only one simultaneous setup for the folder", async () => {
    let announce!: () => void;
    let continueCreation!: () => void;
    const entered = new Promise<void>((resolve) => {
      announce = resolve;
    });
    const proceed = new Promise<void>((resolve) => {
      continueCreation = resolve;
    });
    const original = github.createPrivateRepository.bind(github);
    const create = vi.spyOn(github, "createPrivateRepository").mockImplementation(async (name) => {
      announce();
      await proceed;
      return original(name);
    });
    const first = start();
    await entered;
    try {
      await expect(start()).rejects.toMatchObject({ code: "needs-choice" });
    } finally {
      continueCreation();
    }
    await first;
    expect(create).toHaveBeenCalledTimes(1);
  });
});

async function originalHistory() {
  const git = new Git(root);
  await git.ok(["init", "--quiet", "-b", "main"]);
  await git.setLocalIdentity({ name: "Original author", email: "author@example.com" });
  await writeFile(join(root, ".gitignore"), ".env*\n");
  await git.commitAll("Original local version", { kind: "save" });
  return { git, head: (await git.head())! };
}

const adopt = (head: string) =>
  runFlow(
    prepareNewApp(
      root,
      {
        name: "book-swap",
        account: "ada",
        adoptHistory: head,
      },
      github,
    ),
  );
