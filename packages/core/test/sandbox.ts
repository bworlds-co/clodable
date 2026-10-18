import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { FakeGitHub, Git, Workspace } from "../src/index.js";

/**
 * A throwaway "GitHub" on disk: a bare repository (the remote), the builder's clone, and a second
 * clone for a teammate. A tiny app builds with `node build.js` and fails if src/app.txt contains BROKEN.
 */
export interface Sandbox {
  dir: string;
  bare: string;
  work: string;
  github: FakeGitHub;
  ws: () => Promise<Workspace>;
  write: (path: string, content: string, root?: string) => Promise<void>;
  teammate: () => Promise<Git>;
  remoteLog: (ref?: string) => Promise<string[]>;
  cleanup: () => Promise<void>;
}

const APP_FILES: Record<string, string> = {
  "package.json": JSON.stringify(
    { name: "crumb-site", private: true, scripts: { build: "node build.js" }, dependencies: {} },
    null,
    2,
  ),
  "build.js": `const fs = require("node:fs");
const text = fs.readFileSync("src/app.txt", "utf8");
if (text.includes("BROKEN")) { console.error("src/app.txt:1 error: the page is broken"); process.exit(1); }
console.log("built");
`,
  "src/app.txt": "Welcome to Crumb & Co.\nFresh bread every morning.\n",
  ".clodable/config.json": JSON.stringify(
    { version: 1, liveBranch: "main", checks: { build: true, packages: false, secrets: true } },
    null,
    2,
  ),
  ".gitignore": "node_modules/\n.clodable/local/\n.clodable/inbox/\n",
};

export async function createSandbox(): Promise<Sandbox> {
  const dir = await mkdtemp(join(tmpdir(), "cloclod-test-"));
  const bare = join(dir, "origin.git");
  const seed = join(dir, "seed");
  const work = join(dir, "work");
  await mkdir(seed);
  const seedGit = new Git(seed);
  await seedGit.ok(["init", "--quiet", "-b", "main"]);
  await seedGit.ok(["config", "user.name", "Seed"]);
  await seedGit.ok(["config", "user.email", "seed@example.com"]);
  for (const [path, content] of Object.entries(APP_FILES)) {
    await mkdir(dirname(join(seed, path)), { recursive: true });
    await writeFile(join(seed, path), content);
  }
  await seedGit.ok(["add", "--all"]);
  await seedGit.ok(["commit", "--quiet", "-m", "Initial app"]);
  await new Git(dir).ok(["clone", "--quiet", "--bare", seed, bare]);
  await new Git(dir).ok(["clone", "--quiet", bare, work]);
  const workGit = new Git(work);
  await workGit.ok(["config", "user.name", "Ada"]);
  await workGit.ok(["config", "user.email", "ada@example.com"]);

  const github = new FakeGitHub(bare);
  const write = async (path: string, content: string, root = work) => {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), content);
  };
  return {
    dir,
    bare,
    work,
    github,
    write,
    ws: () => Workspace.open({ cwd: work, github }),
    teammate: async () => {
      const path = join(dir, `teammate-${Math.random().toString(36).slice(2, 7)}`);
      await new Git(dir).ok(["clone", "--quiet", bare, path]);
      const git = new Git(path);
      await git.ok(["config", "user.name", "Grace"]);
      await git.ok(["config", "user.email", "grace@example.com"]);
      return git;
    },
    remoteLog: async (ref = "main") =>
      (await new Git(bare).ok(["log", "--format=%s", ref])).split("\n").filter(Boolean),
    cleanup: () => rm(dir, { recursive: true, force: true }),
  };
}

/** A virtual clock: sleeping advances time instantly, so polling loops run without waiting. */
export function instant() {
  let t = Date.now();
  return {
    sleep: async (ms: number) => {
      t += ms;
    },
    now: () => new Date(t),
    pollIntervalMs: 4000,
  };
}
