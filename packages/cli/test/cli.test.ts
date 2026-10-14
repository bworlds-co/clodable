import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { writeInbox } from "../../core/src/index.js";
import { createSandbox, type Sandbox } from "../../core/test/sandbox.js";

/**
 * The contract every front end relies on (the Claude plugin first): with --json, every line is one
 * event, and the last line is the result.
 */

const repo = resolve(import.meta.dirname, "../../..");
const tsx = resolve(repo, "node_modules/.bin/tsx");
const entry = resolve(repo, "packages/cli/src/index.ts");

let sb: Sandbox;
beforeEach(async () => {
  sb = await createSandbox();
});
afterEach(async () => {
  await sb.cleanup();
});

function clodable(...args: string[]) {
  return clodableWith({}, ...args);
}

function clodableWith(env: Record<string, string>, ...args: string[]) {
  const run = spawnSync(tsx, [entry, ...args, "--json"], {
    cwd: sb.work,
    env: { ...process.env, CLODABLE_FAKE_GITHUB: sb.bare, NO_COLOR: "1", ...env },
    encoding: "utf8",
    timeout: 60_000,
  });
  const lines = run.stdout.split("\n").filter(Boolean);
  const events = lines.map((line) => JSON.parse(line) as { type: string; [key: string]: unknown });
  // biome-ignore lint/suspicious/noExplicitAny: each test reads the result's data in its own shape
  const result = events.at(-1) as { type: "result"; ok: boolean; data?: any; error?: any };
  return { events, result, code: run.status, stderr: run.stderr };
}

describe("clodable --json", () => {
  it("prints only JSON events, ending with the result", async () => {
    await sb.write("src/app.txt", "Hello\n");
    const save = clodable("save", "-m", "warmer welcome");
    expect(save.code).toBe(0);
    expect(save.result).toMatchObject({
      type: "result",
      ok: true,
      data: { saved: true, branch: "draft/ada", pushed: true },
    });

    const status = clodable("status");
    expect(status.result.data.unpublished.map((c: { subject: string }) => c.subject)).toEqual([
      "Warmer welcome",
    ]);
    expect(status.result.data.pullRequest).toMatchObject({ number: 1 });
  });

  it("streams publish steps, then the live result", async () => {
    await sb.write("src/app.txt", "Hello\n");
    clodable("save", "-m", "warmer welcome");
    const publish = clodable("publish");
    expect(publish.code).toBe(0);
    const steps = publish.events.filter((e) => e.type === "step");
    expect(steps.length).toBeGreaterThan(5);
    for (const step of steps) {
      expect(step).toMatchObject({
        id: expect.any(String),
        state: expect.any(String),
        title: expect.any(String),
      });
    }
    expect(steps.some((s) => s.id === "merge" && s.state === "done")).toBe(true);
    expect(publish.result).toMatchObject({
      ok: true,
      data: { title: "Warmer welcome", deploy: "live" },
    });
  });

  it("reports problems as a result with a code, a message and exit code 1", () => {
    const publish = clodable("publish");
    expect(publish.code).toBe(1);
    expect(publish.result).toMatchObject({
      ok: false,
      error: { code: "nothing-to-publish", message: expect.any(String) },
    });
    // A move step that doesn't exist, even one every object has, says which ones do.
    for (const step of ["nope", "constructor"]) {
      const move = clodable("move", step);
      expect(move.code).toBe(1);
      expect(move.result.error).toMatchObject({
        code: "not-found",
        hint: expect.stringContaining("check, facts, status, connect"),
      });
    }
  });

  it("keeps a secret key off GitHub: the save stops with secret-found", async () => {
    const key = ["sk", "live", "51NzQx8LkTmV3pR7wYb2Hc9Dj4Fg6Ks1Qa"].join("_");
    await sb.write("src/pay.ts", `export const stripe = "${key}";\n`);
    const save = clodable("save", "-m", "payments");
    expect(save.code).toBe(1);
    expect(save.result).toMatchObject({
      ok: false,
      error: {
        code: "secret-found",
        message: "A secret key is in src/pay.ts",
        hint: expect.any(String),
        files: ["src/pay.ts:1"],
      },
    });
    expect(JSON.stringify(save.events)).not.toContain(key);
    const drafts = spawnSync("git", ["branch", "--list", "draft/*"], {
      cwd: sb.bare,
      encoding: "utf8",
    });
    expect(drafts.stdout.trim()).toBe("");
  });

  it("hands each preview request to one conversation only", async () => {
    await writeInbox(sb.work, {
      kind: "fix",
      page: { url: "http://localhost:8080/", path: "/" },
      error: { message: "boom", kind: "runtime" },
    });
    const first = clodable("inbox", "--claim", "s1");
    expect(first.result).toMatchObject({ ok: true, data: [{ kind: "fix" }] });
    expect(clodable("inbox", "--claim", "s2").result).toMatchObject({ ok: true, data: [] });
  });

  it("records where the app runs, and updates Claude's instructions to match", async () => {
    const set = clodable("config", "backend", "lovable-cloud");
    expect(set.result).toMatchObject({
      ok: true,
      data: { backend: "lovable-cloud", hosting: "unknown" },
    });
    const config = JSON.parse(readFileSync(join(sb.work, ".clodable/config.json"), "utf8"));
    expect(config.backend).toBe("lovable-cloud");
    expect(readFileSync(join(sb.work, "AGENTS.md"), "utf8")).toContain("on Lovable Cloud");
    expect(clodable("config", "backend", "mars").result).toMatchObject({
      ok: false,
      error: { code: "invalid-config" },
    });
    expect(clodable("move", "check").result).toMatchObject({
      ok: true,
      data: { level: expect.any(String), items: expect.any(Array) },
    });
  });

  it("leaves projects it wasn't set up in alone", async () => {
    await rm(join(sb.work, ".clodable/config.json"));
    await sb.write("src/app.txt", "Someone's unrelated work\n");
    for (const command of ["save", "status", "publish"]) {
      const run = clodable(command);
      expect(run.code).toBe(1);
      expect(run.result.error).toMatchObject({ code: "not-set-up", hint: expect.any(String) });
    }
    const drafts = spawnSync("git", ["branch", "--list", "draft/*"], {
      cwd: sb.bare,
      encoding: "utf8",
    });
    expect(drafts.stdout.trim()).toBe("");
  });

  it("doctor lists checks a front end can draw", () => {
    const doctor = clodable("doctor");
    expect(Array.isArray(doctor.result.data)).toBe(true);
    expect(doctor.result.data).toContainEqual(
      expect.objectContaining({ id: "secrets", status: "ok" }),
    );
    for (const item of doctor.result.data) {
      expect(item).toMatchObject({
        id: expect.any(String),
        label: expect.any(String),
        status: expect.stringMatching(/ok|warn|fail|info/),
      });
    }
  });

  it("sets up the app in this folder once its tools are there, and stops before when they aren't", async () => {
    // A stand-in `gh`: signed in as ada (FAKE_GH=signed-in), or not.
    const bin = await mkdtemp(join(tmpdir(), "clodable-gh-"));
    const gh = [
      "#!/bin/sh",
      '[ "$FAKE_GH" = signed-in ] || { echo "You are not logged into any GitHub hosts." >&2; exit 1; }',
      'if [ "$1 $2" = "api user" ]; then echo \'{"login":"ada","name":"Ada","id":1}\'; fi',
      "",
    ].join("\n");
    await writeFile(join(bin, "gh"), gh, { mode: 0o755 });
    const PATH = `${bin}:${process.env.PATH}`;
    try {
      const signedOut = clodableWith({ PATH }, "setup", "--yes");
      expect(signedOut.code).toBe(1);
      expect(signedOut.result.error).toMatchObject({
        code: "gh-auth",
        hint: "Run `gh auth login --web` to connect your account",
      });

      const setup = clodableWith({ PATH, FAKE_GH: "signed-in" }, "setup", "--yes");
      expect(setup.code).toBe(0);
      expect(setup.result.data).toMatchObject({ saved: true, published: false });
      expect(setup.result.data.files).toContain("AGENTS.md");
      expect(readFileSync(join(sb.work, "AGENTS.md"), "utf8")).toContain("clodable:begin");
    } finally {
      await rm(bin, { recursive: true, force: true });
    }
  }, 120_000);

  it("says a repository it can't find is the problem, not the internet", async () => {
    // A stand-in `gh`, signed in, that finds no such repository, in gh's own words.
    const bin = await mkdtemp(join(tmpdir(), "clodable-gh-"));
    const empty = await mkdtemp(join(tmpdir(), "clodable-empty-"));
    const gh = [
      "#!/bin/sh",
      'if [ "$1 $2" = "api user" ]; then echo \'{"login":"ada","name":"Ada","id":1}\'; exit 0; fi',
      `if [ "$1 $2" = "repo clone" ]; then echo "GraphQL: Could not resolve to a Repository with the name 'ada/typo'. (repository)" >&2; exit 1; fi`,
      "",
    ].join("\n");
    await writeFile(join(bin, "gh"), gh, { mode: 0o755 });
    try {
      const run = spawnSync(tsx, [entry, "setup", "--repo", "ada/typo", "--yes", "--json"], {
        cwd: empty,
        env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, NO_COLOR: "1" },
        encoding: "utf8",
        timeout: 60_000,
      });
      const result = JSON.parse(run.stdout.trim().split("\n").at(-1)!);
      expect(run.status).toBe(1);
      expect(result.error).toMatchObject({
        code: "not-found",
        message: "Couldn't bring in ada/typo.",
      });
    } finally {
      await rm(bin, { recursive: true, force: true });
      await rm(empty, { recursive: true, force: true });
    }
  }, 120_000);
});
