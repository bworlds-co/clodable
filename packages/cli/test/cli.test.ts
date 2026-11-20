import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
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
  it("records dated rehearsal evidence over stdin and reads it in a fresh process", async () => {
    const copy = { ref: "test-copy", dataAt: "2026-10-10T10:00:00.000Z" };
    await sb.write(
      ".clodable/local/move.json",
      JSON.stringify({ version: 1, home: { ref: copy.ref }, data: { at: copy.dataAt, ok: true } }),
    );
    expect(clodable("move", "rehearsal").result).toMatchObject({
      ok: true,
      data: { copy, observations: [] },
    });
    const run = spawnSync(tsx, [entry, "move", "rehearsal", "--set", "--json"], {
      cwd: sb.work,
      env: { ...process.env, CLODABLE_FAKE_GITHUB: sb.bare },
      encoding: "utf8",
      input: JSON.stringify({
        copy,
        observations: [
          {
            feature: "Add a note",
            result: "passed",
            method: "browser",
            observedAt: "2026-10-10T11:00:00.000Z",
            evidence: "Created and reloaded a disposable note.",
          },
        ],
      }),
    });
    expect(run.status).toBe(0);
    expect(JSON.parse(run.stdout.trim().split("\n").at(-1)!)).toMatchObject({
      type: "result",
      ok: true,
    });
    expect(clodable("move", "rehearsal").result.data.observations[0]).toMatchObject({
      feature: "Add a note",
      scope: "current-copy",
      method: "browser",
    });
  });

  it("reports retained failed delivery and confirms the same version on retry", async () => {
    await sb.write("src/app.txt", "New welcome\n");
    const failed = clodableWith({ CLODABLE_FAKE_HOST: "failed" }, "publish");
    expect(failed.result).toMatchObject({ ok: false, error: { code: "deploy-failed" } });
    const before = clodable("status").result.data;
    expect(before.pendingPublish).toMatchObject({ state: "failed" });
    expect(before.unpublished).toEqual([]);
    const retried = clodable("publish");
    expect(retried.result).toMatchObject({
      ok: true,
      data: { sha: before.pendingPublish.sha, deploy: "live" },
    });
    expect(clodable("status").result.data.pendingPublish).toBeUndefined();
    expect(await sb.remoteLog()).toHaveLength(2);
  });

  it("sets up saving for a local idea only in the approved account, with a private destination", async () => {
    const root = join(sb.dir, "idea");
    const bare = join(sb.dir, "idea.git");
    const bin = join(sb.dir, "idea-tools");
    await mkdir(root);
    await mkdir(join(root, "node_modules"));
    await mkdir(bin);
    await writeFile(
      join(bin, "gh"),
      '#!/bin/sh\nif [ "$1 $2" = "api user" ]; then echo \'{"login":"ada","name":"Ada","id":1}\'; fi\n',
      { mode: 0o755 },
    );
    await writeFile(
      join(root, "package.json"),
      JSON.stringify({ name: "idea", dependencies: { vite: "*", react: "*" } }),
    );
    await writeFile(join(root, "index.html"), "<h1>My first idea</h1>");
    const env = { CLODABLE_FAKE_GITHUB: bare, PATH: `${bin}:${process.env.PATH}` };
    const rejected = clodableWith(
      env,
      "setup",
      "--cwd",
      root,
      "--new",
      "my-idea",
      "--account",
      "someone-else",
      "--yes",
    );
    expect(rejected.result).toMatchObject({ ok: false, error: { code: "gh-auth" } });
    const started = clodableWith(
      env,
      "setup",
      "--cwd",
      root,
      "--new",
      "my-idea",
      "--account",
      "ada",
      "--yes",
    );
    expect(started.result).toMatchObject({
      ok: true,
      data: { saved: true, pushed: true, published: false, appType: "vite-spa" },
    });
    expect(started.events).toContainEqual(
      expect.objectContaining({ id: "setup:app", state: "done" }),
    );
    const status = clodableWith(env, "status", "--cwd", root);
    expect(status.result.data.project).toMatchObject({ hosting: "none", backend: "none" });
    const remote = spawnSync("git", ["--git-dir", bare, "ls-tree", "--name-only", "main"], {
      encoding: "utf8",
    });
    expect(remote.stdout.trim()).toBe("README.md");
    expect(readFileSync(join(root, "index.html"), "utf8")).toBe("<h1>My first idea</h1>");
  });

  it("refreshes the installed runtime without changing account settings, and runs it without npm", async () => {
    const source = join(sb.dir, "installed copy.mjs");
    const bundle =
      'console.log(JSON.stringify({ args: process.argv.slice(2), port: process.env.PORT, version: "installed" }));';
    await writeFile(source, bundle);
    await mkdir(join(sb.work, ".claude"), { recursive: true });
    await sb.write(".claude/settings.json", '{"ownerSetting":true}\n');
    await sb.write(
      ".claude/launch.json",
      JSON.stringify({
        configurations: [
          {
            name: "app",
            runtimeExecutable: "npx",
            runtimeArgs: ["clodable", "dev"],
            port: 5199,
            autoPort: false,
          },
        ],
      }),
    );
    const config = readFileSync(join(sb.work, ".clodable/config.json"), "utf8");
    const refresh = () =>
      clodableWith({ CLODABLE_RUNTIME_SOURCE: source }, "kit", "--apply", "--runtime");
    const first = refresh();
    expect(first.result.ok).toBe(true);
    expect(first.events.every((event) => !JSON.stringify(event).includes(bundle))).toBe(true);
    expect(readFileSync(join(sb.work, ".clodable/local/clodable.mjs"), "utf8")).toBe(bundle);
    expect(readFileSync(join(sb.work, ".claude/settings.json"), "utf8")).toBe(
      '{"ownerSetting":true}\n',
    );
    expect(readFileSync(join(sb.work, ".clodable/config.json"), "utf8")).toBe(config);
    expect(readFileSync(join(sb.work, "AGENTS.md"), "utf8")).toContain(
      'node ".clodable/local/clodable.mjs"',
    );
    const launch = JSON.parse(readFileSync(join(sb.work, ".claude/launch.json"), "utf8"))
      .configurations[0];
    const preview = spawnSync(launch.runtimeExecutable, [...launch.runtimeArgs, "--port", "5189"], {
      cwd: sb.work,
      env: { PATH: "/usr/bin:/bin", PORT: "5189" },
      encoding: "utf8",
    });
    expect(launch.port).toBe(5199);
    expect(launch.autoPort).toBe(false);
    expect(preview.status).toBe(0);
    expect(JSON.parse(preview.stdout)).toEqual({
      args: ["dev", "--port", "5189"],
      port: "5189",
      version: "installed",
    });
    const ignored = spawnSync(
      "git",
      ["check-ignore", ".clodable/local/clodable.mjs", ".clodable/local/preview.sh"],
      { cwd: sb.work, encoding: "utf8" },
    );
    expect(ignored.stdout.trim().split("\n")).toHaveLength(2);
    expect(
      refresh().result.data.changes.every(
        (change: { action: string }) => change.action === "unchanged",
      ),
    ).toBe(true);
    await writeFile(source, bundle.replace("installed", "updated"));
    expect(refresh().result.ok).toBe(true);
    expect(readFileSync(join(sb.work, ".clodable/local/clodable.mjs"), "utf8")).toContain(
      '"updated"',
    );
    // Standalone kit runs keep the local runtime; an explicit developer preview override survives.
    expect(clodable("kit", "--apply").result.ok).toBe(true);
    expect(
      JSON.parse(readFileSync(join(sb.work, ".claude/launch.json"), "utf8")).configurations[0]
        .runtimeArgs,
    ).toEqual(launch.runtimeArgs);
    await sb.write(
      ".claude/launch.json",
      JSON.stringify({
        configurations: [
          { name: "app", runtimeExecutable: "node", runtimeArgs: ["/dev/clodable.mjs", "dev"] },
        ],
      }),
    );
    expect(refresh().result.ok).toBe(true);
    expect(
      JSON.parse(readFileSync(join(sb.work, ".claude/launch.json"), "utf8")).configurations[0]
        .runtimeArgs,
    ).toEqual(["/dev/clodable.mjs", "dev"]);
    const beforeFailure = readFileSync(join(sb.work, ".claude/launch.json"), "utf8");
    await rm(source);
    expect(refresh().result.ok).toBe(false);
    expect(readFileSync(join(sb.work, ".claude/launch.json"), "utf8")).toBe(beforeFailure);
    expect(readFileSync(join(sb.work, ".clodable/local/clodable.mjs"), "utf8")).toContain(
      '"updated"',
    );
  });

  it("keeps site.live boolean and marks an unavailable imported site's status unknown", async () => {
    const privateDir = await mkdtemp(join(tmpdir(), "clodable-status-contract-"));
    try {
      const config = JSON.parse(readFileSync(join(sb.work, ".clodable/config.json"), "utf8"));
      config.netlify = {
        siteId: "fixture-site",
        name: "fixture",
        url: "https://fixture.example",
        admin: "https://app.netlify.com/sites/fixture",
        account: "fixture-team",
      };
      await sb.write(".clodable/config.json", JSON.stringify(config));
      const result = clodableWith({ CLODABLE_CONFIG_DIR: privateDir }, "status").result;
      expect(result).toMatchObject({
        type: "result",
        ok: true,
        data: { site: { url: "https://fixture.example", live: false, statusKnown: false } },
      });
    } finally {
      await rm(privateDir, { recursive: true, force: true });
    }
  });

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
    // Front ends ask Lovable's questions only of an app made with Lovable, and open on a move under way.
    expect(status.result.data.project.madeWithLovable).toBe(false);
    expect(status.result.data.movingOffLovable).toBeUndefined();
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
        hint: expect.stringContaining("check, facts, status, rehearsal, connect"),
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
      // Builders open the Clodable panel; they have no `clodable` command to run.
      expect(run.result.error).toMatchObject({
        code: "not-set-up",
        hint: expect.stringMatching(/^Type \/clodable to open the Clodable panel/),
      });
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
    // The fake GitHub (a folder on this computer) is the app's GitHub here: nothing to fix.
    expect(doctor.result.data).toContainEqual(
      expect.objectContaining({
        id: "repo",
        status: "ok",
        detail: "a stand-in for GitHub on this computer",
      }),
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
      // Each step as it goes, for the panel: the last word on each is how it ended.
      const stepsOf = (events: Array<{ type: string; [key: string]: unknown }>) => {
        const last = new Map<unknown, unknown>();
        for (const e of events) if (e.type === "step") last.set(e.id, `${e.state}: ${e.title}`);
        return [...last.entries()];
      };
      const signedOut = clodableWith({ PATH }, "setup", "--yes");
      expect(signedOut.code).toBe(1);
      expect(signedOut.result.error).toMatchObject({
        code: "gh-auth",
        hint: "Run `gh auth login --web` to connect your account",
      });
      expect(stepsOf(signedOut.events)).toEqual([
        ["setup:tools", "failed: A few tools are needed first"],
      ]);

      const setup = clodableWith({ PATH, FAKE_GH: "signed-in" }, "setup", "--yes");
      expect(setup.code).toBe(0);
      expect(setup.result.data).toMatchObject({ saved: true, published: false });
      expect(setup.result.data.files).toContain("AGENTS.md");
      expect(setup.events[0]).toMatchObject({ type: "step", id: "setup:tools", state: "running" });
      expect(stepsOf(setup.events).filter(([id]) => id !== "setup:packages")).toEqual([
        ["setup:tools", "done: Your tools are ready"],
        ["setup:files", "done: Added Clodable's files"],
        ["setup:save", "done: Saved to your draft on GitHub"],
      ]);
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
