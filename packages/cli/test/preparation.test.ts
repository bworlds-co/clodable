import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const repo = resolve(import.meta.dirname, "../../..");
const entry = resolve(repo, "packages/cli/src/index.ts");
const roots: string[] = [];

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "clodable-prepare-cli-"));
  roots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function prepare(root: string, action = "backup") {
  const run = spawnSync(
    process.execPath,
    ["--import", "tsx", entry, "prepare", action, "--cwd", root, "--json"],
    {
      cwd: repo,
      env: {
        ...process.env,
        PATH: "",
        CLODABLE_FAKE_GITHUB: undefined,
        CLODABLE_LANGUAGE: "en",
        NO_COLOR: "1",
      },
      encoding: "utf8",
      timeout: 30_000,
    },
  );
  const events = run.stdout
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  return { ...run, events, result: events.at(-1) };
}

describe("prepare backup CLI contract", () => {
  it("works before saving setup, without Git or other external tools, and emits only safe metadata", async () => {
    const root = await fixture();
    await writeFile(join(root, "index.html"), "<button>Original app</button>");
    await writeFile(join(root, ".env.local"), "BACKUP_FIXTURE_SECRET=keep-on-this-computer\n");
    await mkdir(join(root, "assets"));
    await writeFile(join(root, "assets", "untracked.txt"), "original asset");
    const run = prepare(root);
    expect(run.status, run.stderr).toBe(0);
    expect(run.events).toHaveLength(1);
    expect(run.result).toMatchObject({
      type: "result",
      ok: true,
      data: { completed: true, files: 3 },
    });
    const path = join(root, run.result.data.path);
    expect(await readFile(join(path, "files/.env.local"), "utf8")).toBe(
      "BACKUP_FIXTURE_SECRET=keep-on-this-computer\n",
    );
    expect(existsSync(join(path, "complete.json"))).toBe(true);
    expect(run.stdout + run.stderr).not.toContain("keep-on-this-computer");
    expect(existsSync(join(root, ".git"))).toBe(false);
    expect(existsSync(join(root, ".clodable/config.json"))).toBe(false);
    await writeFile(join(root, "index.html"), "later work");
    const retry = prepare(root);
    expect(retry.status, retry.stderr).toBe(0);
    expect(retry.result.data.path).not.toBe(run.result.data.path);
    expect(await readFile(join(path, "files/index.html"), "utf8")).toBe(
      "<button>Original app</button>",
    );
  });

  it("rejects unsupported preparation actions without creating local state", async () => {
    const root = await fixture();
    const run = prepare(root, "replace");
    expect(run.status).toBe(1);
    expect(run.result).toMatchObject({
      type: "result",
      ok: false,
      error: { code: "invalid-config" },
    });
    expect(existsSync(join(root, ".clodable"))).toBe(false);
  });

  it("reports a failed backup as NDJSON and preserves app files", async () => {
    const root = await fixture();
    const outside = await fixture();
    await writeFile(join(root, "index.html"), "original app");
    await symlink(outside, join(root, ".clodable"));
    const run = prepare(root);
    expect(run.status).toBe(1);
    expect(run.result).toMatchObject({ type: "result", ok: false, error: { code: "copy-failed" } });
    expect(await readFile(join(root, "index.html"), "utf8")).toBe("original app");
    expect(existsSync(join(root, ".gitignore"))).toBe(false);
  });
});
