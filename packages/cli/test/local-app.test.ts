import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Git } from "../../core/src/index.js";

const repo = resolve(import.meta.dirname, "../../..");
let dir: string;
let root: string;
let bin: string;
let log: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "clodable-local-app-cli-"));
  root = join(dir, "app");
  bin = join(dir, "bin");
  log = join(dir, "commands.log");
  await mkdir(root);
  await mkdir(bin);
  await writeFile(log, "");
  await writeFile(
    join(bin, "gh"),
    '#!/bin/sh\nprintf "gh %s\\n" "$*" >> "$PROBE_LOG"\nif [ "$1 $2" = "api user" ]; then echo \'{"login":"ada","name":"Ada","id":1}\'; fi\n',
    { mode: 0o755 },
  );
});
afterEach(() => rm(dir, { recursive: true, force: true }));

function run(...args: string[]) {
  const result = spawnSync(
    process.execPath,
    [
      "--import",
      join(repo, "node_modules/tsx/dist/loader.mjs"),
      join(repo, "packages/cli/src/index.ts"),
      ...args,
      "--json",
    ],
    {
      cwd: root,
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        CLODABLE_GH: join(bin, "gh"),
        CLODABLE_FAKE_GITHUB: join(dir, "remote.git"),
        CLODABLE_LANGUAGE: "en",
        PROBE_LOG: log,
      },
      encoding: "utf8",
      timeout: 30_000,
    },
  );
  if (!result.stdout.trim()) throw new Error(result.stderr || String(result.error));
  const events = result.stdout
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  return { result: events.at(-1), code: result.status };
}
async function supported() {
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({
      dependencies: { vite: "*", react: "*" },
      scripts: { build: "node -e ''" },
    }),
  );
  await mkdir(join(root, "node_modules"), { recursive: true });
}

describe.skipIf(process.platform === "win32")("local app CLI contract", () => {
  it("reports app support without Git and keeps local inspection free of account checks", async () => {
    await supported();
    const local = run("doctor", "--local").result;
    expect(local.ok).toBe(true);
    expect(local.data).toEqual([
      expect.objectContaining({
        id: "local-app",
        localApp: { contents: "supported", repository: "none", appType: "vite-spa" },
      }),
      expect.objectContaining({ id: "app", status: "ok" }),
    ]);
    expect(await readFile(log, "utf8")).toBe("");
    expect(existsSync(join(root, ".git"))).toBe(false);
    expect(existsSync(join(root, ".clodable"))).toBe(false);
    expect(run("doctor").result.data).toContainEqual(
      expect.objectContaining({ id: "app", status: "ok" }),
    );
    await writeFile(join(root, "package.json"), "{}");
    expect(run("doctor", "--local").result.data).toContainEqual(
      expect.objectContaining({ id: "app", status: "warn" }),
    );
    expect(run("doctor").result.data).toContainEqual(
      expect.objectContaining({ id: "app", status: "warn" }),
    );
  });

  it("still reports app support when Git cannot run", async () => {
    await supported();
    await writeFile(join(bin, "git"), "#!/bin/sh\nexit 1\n", { mode: 0o755 });
    const local = run("doctor", "--local").result;
    expect(local.data).toContainEqual(
      expect.objectContaining({
        id: "local-app",
        localApp: { contents: "supported", repository: "unavailable", appType: "vite-spa" },
      }),
    );
    expect(local.data).toContainEqual(expect.objectContaining({ id: "app", status: "ok" }));
    expect(await readFile(log, "utf8")).toBe("");
    expect(run("doctor").result.data).toContainEqual(
      expect.objectContaining({ id: "app", status: "ok" }),
    );
  });

  it.each([
    [{}, false],
    [{ history: { head: "a".repeat(40), draft: "draft/ada" } }, false],
    [{ history: { head: "a".repeat(40), draft: "draft/ada", anchor: "b".repeat(40) } }, true],
    [{ destination: { repo: { owner: "ada", name: "app", isPrivate: true } } }, true],
  ])("reports whether pending saving has reserved its destination: %j", async (state, locked) => {
    await supported();
    await mkdir(join(root, ".clodable/local"), { recursive: true });
    const marker = join(root, ".clodable/local/new-app.json");
    const contents = JSON.stringify({ name: "app", account: "ada", ...state });
    await writeFile(marker, contents);
    expect(run("doctor").result.data).toContainEqual(
      expect.objectContaining({
        id: "new-app",
        newApp: { name: "app", account: "ada", locked },
      }),
    );
    expect(await readFile(marker, "utf8")).toBe(contents);
    expect(existsSync(join(root, ".git"))).toBe(false);
  });

  it("adds machine facts without replacing the doctor array, including empty unborn folders", async () => {
    await new Git(root).ok(["init", "--quiet"]);
    const result = run("doctor").result;
    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data).toContainEqual(
      expect.objectContaining({
        id: "local-app",
        localApp: { contents: "empty", repository: "unborn" },
      }),
    );
    await supported();
    expect(run("doctor").result.data).toContainEqual(
      expect.objectContaining({
        id: "local-app",
        localApp: { contents: "supported", repository: "unborn", appType: "vite-spa" },
      }),
    );
  });

  it("rejects unsupported prototypes before checking accounts or modifying the folder", async () => {
    await writeFile(join(root, "index.html"), "<h1>My prototype</h1>");
    const result = run("setup", "--new", "app", "--account", "ada", "--yes");
    expect(result.result).toMatchObject({ ok: false, error: { code: "invalid-config" } });
    expect(await readFile(log, "utf8")).toBe("");
    expect(existsSync(join(root, ".git"))).toBe(false);
    expect(existsSync(join(root, ".clodable"))).toBe(false);
  });

  it("requires the history flag and completes saving when the current history is approved", async () => {
    await supported();
    const git = new Git(root);
    await git.ok(["init", "--quiet", "-b", "main"]);
    await git.setLocalIdentity({ name: "Original", email: "original@example.com" });
    await git.commitAll("My first version", { kind: "save" });
    const head = (await git.head())!;
    expect(run("setup", "--new", "app", "--account", "ada", "--yes").result).toMatchObject({
      ok: false,
      error: { code: "needs-choice" },
    });
    const created = run(
      "setup",
      "--new",
      "app",
      "--account",
      "ada",
      "--adopt-history",
      head,
      "--yes",
    );
    expect(created.result).toMatchObject({ ok: true, data: { pushed: true } });
    expect(await git.revParse("main")).toBe(head);
    expect(await git.ok(["merge-base", "HEAD", "origin/main"])).toBe(
      await git.revParse("origin/main"),
    );
    const first = { sha: await git.head(), subject: "First saved version", kind: "save" };
    expect(run("history").result.data.draft[0]).toMatchObject(first);
    expect(run("status").result.data.unpublished[0]).toMatchObject(first);
  });

  it.each(["none", "unborn"])(
    "shows the first private app snapshot in history and status for a %s repository",
    async (repository) => {
      await supported();
      await writeFile(join(root, "index.html"), "<h1>My first app</h1>");
      const git = new Git(root);
      if (repository === "unborn") await git.ok(["init", "--quiet"]);
      expect(run("setup", "--new", "app", "--account", "ada", "--yes").result).toMatchObject({
        ok: true,
        data: { saved: true, pushed: true },
      });
      const first = { sha: await git.head(), subject: "First saved version", kind: "save" };
      const history = run("history").result;
      expect(history).toMatchObject({ ok: true, data: { sameAsLive: false } });
      expect(history.data.draft).toEqual([expect.objectContaining(first)]);
      expect(run("status").result.data.unpublished).toEqual([expect.objectContaining(first)]);
      const remote = new Git(join(dir, "remote.git"));
      expect(await remote.revParse("draft/ada")).toBe(first.sha);
      expect(await remote.ok(["show", "draft/ada:index.html"])).toBe("<h1>My first app</h1>");
      expect(await remote.ok(["ls-tree", "--name-only", "main"])).toBe("README.md");
      expect(run("setup", "--new", "app", "--account", "ada", "--yes").result.ok).toBe(true);
      expect(run("history").result.data.draft).toEqual([expect.objectContaining(first)]);
    },
  );

  it("honors an explicit import from an empty initialized folder using a safe child", async () => {
    const git = new Git(root);
    await git.ok(["init", "--quiet", "-b", "original"]);
    const actualGit = await git.ready();
    await writeFile(
      join(bin, "git"),
      `#!/bin/sh\nfor argument in "$@"; do\nif [ "$argument" = clone ]; then printf "clone %s\\n" "$*" >> "$PROBE_LOG"; echo "fixture stopped before network" >&2; exit 128; fi\ndone\nexec '${actualGit}' "$@"\n`,
      { mode: 0o755 },
    );
    const checked = run("setup", "--repo", "ada/chosen-app", "--yes");
    expect(checked.result.ok).toBe(false);
    expect(await readFile(log, "utf8")).toContain(join(root, "chosen-app"));
    expect(await git.currentBranch()).toBe("original");
    expect(existsSync(join(root, ".clodable"))).toBe(false);
  });
});
