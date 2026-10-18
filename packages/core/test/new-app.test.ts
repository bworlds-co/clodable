import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
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
afterEach(() => rm(dir, { recursive: true, force: true }));
const start = () => runFlow(prepareNewApp(root, { name: "book-swap", account: "ada" }, github));

describe("saving a local idea", () => {
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
    expect(await readFile(join(root, "config.js"), "utf8")).toContain(synthetic);
    await rm(join(root, "config.js"));
    await start();
    expect(existsSync(github.bareRepo)).toBe(true);
  });

  it("refuses an account change and an unrelated existing repository", async () => {
    await expect(
      runFlow(prepareNewApp(root, { name: "book-swap", account: "someone-else" }, github)),
    ).rejects.toMatchObject({ code: "gh-auth" });
    expect(existsSync(join(root, ".git"))).toBe(false);
    await new Git(root).ok(["init", "--quiet"]);
    await expect(start()).rejects.toMatchObject({ code: "already-there" });
    expect(existsSync(github.bareRepo)).toBe(false);
  });
});
