import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const repo = resolve(import.meta.dirname, "../../..");
let dir: string;
let root: string;
let bin: string;
let log: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "clodable-prerequisites-"));
  root = join(dir, "app");
  bin = join(dir, "bin");
  log = join(dir, "commands.log");
  await mkdir(root);
  await mkdir(bin);
  await writeFile(log, "");
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({ dependencies: { vite: "*", react: "*" } }),
  );
  await writeFile(
    join(bin, "git"),
    '#!/bin/sh\nprintf "git %s\\n" "$*" >> "$PROBE_LOG"\necho "developer tools unavailable" >&2\nexit 1\n',
    { mode: 0o755 },
  );
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
        CLODABLE_FAKE_GITHUB: "",
        CLODABLE_GH: join(bin, "gh"),
        CLODABLE_GITLEAKS: join(bin, "unused-scanner"),
        PROBE_LOG: log,
      },
      encoding: "utf8",
      timeout: 15_000,
    },
  );
  if (!result.stdout.trim()) throw new Error(result.stderr || String(result.error));
  const events = result.stdout
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  return { code: result.status, events, result: events.at(-1) };
}

describe.skipIf(process.platform === "win32")("unusable Git at CLI boundaries", () => {
  it("reports failed Git with diagnostics and the exact GitHub executable", async () => {
    const checked = run("doctor");
    expect(checked.result.data).toContainEqual(
      expect.objectContaining({
        id: "git",
        status: "fail",
        details: expect.stringContaining("developer tools unavailable"),
      }),
    );
    expect(checked.result.data).toContainEqual(
      expect.objectContaining({
        id: "gh",
        executable: join(bin, "gh"),
      }),
    );
    expect(await readFile(log, "utf8")).not.toContain("rev-parse");
  });

  it.each([
    ["status"],
    ["kit", "--apply", "--runtime"],
    ["setup", "--repo", "ada/app", "--yes"],
    ["setup", "--new", "app", "--account", "ada", "--yes"],
  ])("blocks %j before repository or account work", async (...args) => {
    const checked = run(...args);
    expect(checked.code).toBe(1);
    expect(checked.result).toMatchObject({ ok: false, error: { code: "tools-unavailable" } });
    expect(await readFile(log, "utf8")).toBe("git --version\n");
    expect(existsSync(join(root, ".clodable"))).toBe(false);
    expect(existsSync(join(root, ".git"))).toBe(false);
  });

  it("preserves a previous same-name destination when retry is blocked", async () => {
    await mkdir(join(root, ".clodable/local"), { recursive: true });
    const marker = join(root, ".clodable/local/new-app.json");
    const pending = JSON.stringify({
      name: "app",
      account: "ada",
      destination: { cloneUrl: "https://github.com/ada/app.git" },
    });
    await writeFile(marker, pending);
    expect(run("setup", "--new", "app", "--account", "ada", "--yes").result.error.code).toBe(
      "tools-unavailable",
    );
    expect(await readFile(marker, "utf8")).toBe(pending);
    expect(await readFile(log, "utf8")).toBe("git --version\n");
  });
});
