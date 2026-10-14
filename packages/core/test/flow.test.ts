import { chmod, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ClodableError,
  type ClodableEvent,
  Git,
  history,
  loadMove,
  MOVE_PATH,
  publish,
  restore,
  runFlow,
  save,
  status,
  undoPublish,
  Workspace,
} from "../src/index.js";
import { createSandbox, instant, type Sandbox } from "./sandbox.js";

let sb: Sandbox;

beforeEach(async () => {
  sb = await createSandbox();
});
afterEach(async () => {
  await sb.cleanup();
});

async function publishAll(events: ClodableEvent[] = []) {
  const ws = await sb.ws();
  return runFlow(publish(ws, instant()), (e) => events.push(e));
}

async function expectError(promise: Promise<unknown>, code: string) {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(ClodableError);
  expect((error as ClodableError).code).toBe(code);
  return error as ClodableError;
}

describe("projects Clodable wasn't set up in", () => {
  it("are left alone: nothing is saved, pushed or published", async () => {
    await rm(join(sb.work, ".clodable/config.json"));
    await sb.write("src/app.txt", "Someone's unrelated work\n");
    await expectError(sb.ws(), "not-set-up");
    // Adding the kit is the one thing that works before setup.
    await expect(
      Workspace.open({ cwd: sb.work, github: sb.github, requireSetup: false }),
    ).resolves.toBeInstanceOf(Workspace);
    expect(await sb.remoteLog("main")).toEqual(["Initial app"]);
  });
});

describe("saving", () => {
  it("saves to the person's draft and opens its pull request", async () => {
    await sb.write("src/app.txt", "Welcome to Crumb & Co.\nWarm bread every morning.\n");
    const result = await save(await sb.ws(), { message: "make the subtitle warmer." });

    expect(result).toMatchObject({
      saved: true,
      pushed: true,
      branch: "draft/ada",
      unpublished: 1,
    });
    expect(await sb.remoteLog("draft/ada")).toEqual(["Make the subtitle warmer", "Initial app"]);
    expect(sb.github.pullRequests).toHaveLength(1);
    expect(sb.github.pullRequests[0]).toMatchObject({
      title: "Make the subtitle warmer",
      headRef: "draft/ada",
      baseRef: "main",
    });
    expect(result.pullRequest?.number).toBe(1);
  });

  it("does nothing when nothing changed", async () => {
    const result = await save(await sb.ws(), { message: "Nothing" });
    expect(result.saved).toBe(false);
    expect(sb.github.pullRequests).toHaveLength(0);
  });

  it("keeps one pull request per draft and lists every save in it", async () => {
    const ws = await sb.ws();
    await sb.write("src/app.txt", "One\n");
    await save(ws, { message: "First change" });
    await sb.write("src/app.txt", "Two\n");
    const second = await save(ws, { message: "Second change" });

    expect(second.unpublished).toBe(2);
    expect(sb.github.pullRequests).toHaveLength(1);
    expect(sb.github.pullRequests[0]!.body).toContain("- First change");
    expect(sb.github.pullRequests[0]!.body).toContain("- Second change");
  });

  it("reports status in builder terms", async () => {
    const ws = await sb.ws();
    await sb.write("src/app.txt", "One\n");
    await save(ws, { message: "First change" });
    await sb.write("src/new.txt", "unsaved\n");
    const s = await status(ws);

    expect(s.onDraft).toBe(true);
    expect(s.unsaved).toBe(1);
    expect(s.unpublished.map((c) => c.subject)).toEqual(["First change"]);
    expect(s.unpublished[0]!.kind).toBe("save");
    expect(s.pullRequest?.number).toBe(1);
  });
});

describe("publishing", () => {
  it("publishes: checks, merges into main, waits for the host, starts a fresh draft", async () => {
    await sb.write("src/app.txt", "Welcome!\n");
    await save(await sb.ws(), { message: "Shorter welcome" });
    await sb.write("src/menu.txt", "Sourdough\n");
    await save(await sb.ws(), { message: "Added the menu" });

    const events: ClodableEvent[] = [];
    const result = await publishAll(events);

    expect(result.title).toBe("Shorter welcome; added the menu");
    expect(result.deploy).toBe("live");
    expect(result.url).toBe("https://crumb-and-co.example");
    expect(await sb.remoteLog("main")).toEqual(["Shorter welcome; added the menu", "Initial app"]);

    const steps = events
      .filter((e) => e.type === "step" && e.state === "done")
      .map((e) => (e as { id: string }).id);
    expect(steps).toEqual([
      "save",
      "sync",
      "check:secrets",
      "check:build",
      "checks",
      "pull-request",
      "merge",
      "deploy",
      "fresh-draft",
    ]);

    // The fresh draft starts exactly at what's live, and the old remote draft is gone.
    const ws = await sb.ws();
    const s = await status(ws);
    expect(s.unpublished).toHaveLength(0);
    expect(s.lastPublish?.title).toBe("Shorter welcome; added the menu");
    expect(s.pullRequest).toBeUndefined();
    expect(
      await new Git(sb.bare).run(["rev-parse", "--verify", "draft/ada"]).then((r) => r.exitCode),
    ).not.toBe(0);
    expect(await readFile(join(sb.work, "src/menu.txt"), "utf8")).toBe("Sourdough\n");
  });

  it("refuses when there's nothing to publish", async () => {
    await expectError(publishAll(), "nothing-to-publish");
  });

  it("blocks a broken build: nothing goes live", async () => {
    await sb.write("src/app.txt", "BROKEN page\n");
    await save(await sb.ws(), { message: "Oops" });

    const error = await expectError(publishAll(), "checks-failed");
    expect(error.message).toMatch(/doesn't build/);
    expect(await sb.remoteLog("main")).toEqual(["Initial app"]);
  });

  it("brings in a teammate's publish first, then publishes both", async () => {
    const grace = await sb.teammate();
    await sb.write("src/about.txt", "Our story\n", grace.cwd);
    await grace.ok(["add", "--all"]);
    await grace.ok(["commit", "--quiet", "-m", "About page"]);
    await grace.ok(["push", "--quiet", "origin", "main"]);

    await sb.write("src/menu.txt", "Croissants\n");
    await save(await sb.ws(), { message: "Menu" });
    const result = await publishAll();

    expect(result.title).toBe("Menu");
    expect(await sb.remoteLog("main")).toEqual(["Menu", "About page", "Initial app"]);
    expect(await readFile(join(sb.work, "src/about.txt"), "utf8")).toBe("Our story\n");
  });

  it("stops on an overlap with the live site and leaves it for Claude to combine", async () => {
    const grace = await sb.teammate();
    await sb.write("src/app.txt", "Grace's welcome\n", grace.cwd);
    await grace.ok(["commit", "--quiet", "-am", "Grace's welcome"]);
    await grace.ok(["push", "--quiet", "origin", "main"]);

    await sb.write("src/app.txt", "Ada's welcome\n");
    await save(await sb.ws(), { message: "Ada's welcome" });

    const error = await expectError(publishAll(), "conflict");
    expect(error.files).toEqual(["src/app.txt"]);
    const s = await status(await sb.ws());
    expect(s.merging).toBe(true);
    expect(s.conflicts).toEqual(["src/app.txt"]);
    expect(await sb.remoteLog("main")).toEqual(["Grace's welcome", "Initial app"]);
  });

  it("waits for the project's own CI and stops if it fails", async () => {
    let calls = 0;
    sb.github.checkFor = () =>
      ++calls < 3
        ? { state: "pending", total: 2, done: 1 }
        : { state: "failure", total: 2, failed: [{ name: "lint" }] };
    await sb.write(".github/workflows/ci.yml", "on: [pull_request]\njobs: {}\n");
    await sb.write("src/app.txt", "New\n");
    await save(await sb.ws(), { message: "New" });

    const events: ClodableEvent[] = [];
    const error = await expectError(publishAll(events), "ci-failed");
    expect(error.message).toContain("lint");
    expect(events.some((e) => e.type === "step" && e.id === "ci" && e.state === "running")).toBe(
      true,
    );
    expect(await sb.remoteLog("main")).toEqual(["Initial app"]);
  });

  it("says what a long build is doing, and for how long, while it goes live", async () => {
    let polls = 0;
    sb.github.deploymentFor = () => {
      polls++;
      return [
        {
          id: 8,
          environment: "Production",
          isProduction: true,
          state: polls > 20 ? "success" : "pending",
          url: "https://crumb-and-co.example",
        },
      ];
    };
    sb.github.buildFor = () => ({
      step: polls < 5 ? "Install the app's packages" : "Build and put it live on Netlify",
      lastSeconds: 95,
    });
    await sb.write("src/app.txt", "New\n");
    await save(await sb.ws(), { message: "New" });
    const events: ClodableEvent[] = [];
    await publishAll(events);
    // Said once per change: what it's doing, or another minute; never the same line twice.
    const going = events
      .filter((e) => e.type === "step" && e.id === "deploy" && e.state === "running")
      .map((e) => (e as { detail?: string }).detail);
    expect(going).toEqual([
      undefined,
      "Installing your app's packages · under a minute so far · usually about 2 min",
      "Building your site · under a minute so far · usually about 2 min",
      "Building your site · 1 min so far · usually about 2 min",
    ]);
    expect(events.some((e) => e.type === "step" && e.id === "deploy" && e.state === "done")).toBe(
      true,
    );
  });

  it("reports a host that failed to deploy", async () => {
    sb.github.deploymentFor = () => [
      {
        id: 7,
        environment: "Production",
        isProduction: true,
        state: "failure",
        logUrl: "https://host.example/logs/7",
      },
    ];
    await sb.write("src/app.txt", "New\n");
    await save(await sb.ws(), { message: "New" });

    const error = await expectError(publishAll(), "deploy-failed");
    expect(error.details).toBe("https://host.example/logs/7");
    // It's merged: the host is what failed, and the previous version stays live.
    expect(await sb.remoteLog("main")).toEqual(["New", "Initial app"]);
  });
});

describe("secret keys", () => {
  const live = ["sk", "live", "51NzQx8LkTmV3pR7wYb2Hc9Dj4Fg6Ks1Qa"].join("_");
  const remoteHas = async (text: string) =>
    (await new Git(sb.bare).run(["log", "--all", "-p"])).stdout.includes(text);

  it("stay on this computer: the save stops before GitHub, and so does Publish", async () => {
    await sb.write("src/pay.ts", `// payments\nexport const stripe = "${live}";\n`);
    const error = await expectError(save(await sb.ws(), { message: "Payments" }), "secret-found");
    expect(error.message).toBe("A secret key is in src/pay.ts");
    expect(error.files).toEqual(["src/pay.ts:2"]);
    expect(error.details).toContain("Stripe live secret key");
    expect(error.details).not.toContain(live);
    expect(await remoteHas(live)).toBe(false);
    expect(await readFile(join(sb.work, "src/pay.ts"), "utf8")).toContain(live);

    await expectError(publishAll(), "secret-found");
    expect(await sb.remoteLog("main")).toEqual(["Initial app"]);

    // Claude moves the key out of the code, and the next save goes through.
    await sb.write(
      "src/pay.ts",
      "// payments\nexport const stripe = import.meta.env.VITE_STRIPE;\n",
    );
    expect((await save(await sb.ws(), { message: "Payments" })).pushed).toBe(true);
    expect(await remoteHas(live)).toBe(false);
  });

  it("in a save made by hand that wasn't sent yet are taken back with it", async () => {
    await sb.write("src/menu.txt", "Sourdough\n");
    await save(await sb.ws(), { message: "Menu" });
    const git = new Git(sb.work);
    await sb.write("src/pay.ts", `export const stripe = "${live}";\n`);
    await git.ok(["add", "--all"]);
    await git.ok(["commit", "--quiet", "-m", "Payments, saved by hand"]);

    await expectError(save(await sb.ws(), { message: "More" }), "secret-found");
    expect(await git.ok(["log", "-1", "--format=%s"])).toBe("Menu");
    expect(await remoteHas(live)).toBe(false);

    await sb.write("src/pay.ts", "export const stripe = import.meta.env.VITE_STRIPE;\n");
    const saved = await save(await sb.ws(), { message: "Payments" });
    expect(saved.pushed).toBe(true);
    expect(await remoteHas(live)).toBe(false);
    expect(await remoteHas("Payments, saved by hand")).toBe(false);
  });

  it("never leave unchecked: without the scanner, saves wait on this computer", async () => {
    process.env.CLODABLE_GITLEAKS = join(sb.dir, "no-gitleaks-here");
    try {
      await sb.write("src/pay.ts", `export const stripe = "${live}";\n`);
      const saved = await save(await sb.ws(), { message: "Payments" });
      expect(saved).toMatchObject({ saved: true, pushed: false });
      expect(saved.unscanned).toBeTruthy();
      expect(await remoteHas(live)).toBe(false);
    } finally {
      delete process.env.CLODABLE_GITLEAKS;
    }
    // Once the check can run, the waiting save is checked before anything is sent.
    await expectError(save(await sb.ws(), { message: "More" }), "secret-found");
    expect(await remoteHas(live)).toBe(false);
  });

  it("only get a note when they're test keys", async () => {
    const test = ["sk", "test", "51NzQx8LkTmV3pR7wYb2Hc9Dj4Fg6Ks1Qa"].join("_");
    await sb.write("src/pay.ts", `export const stripe = "${test}";\n`);
    const saved = await save(await sb.ws(), { message: "Test payments" });
    expect(saved.pushed).toBe(true);
    expect(saved.notes).toEqual([expect.stringContaining("Stripe test key in src/pay.ts:1")]);
  });
});

describe("apps hosted by Lovable", () => {
  it("publish to GitHub, then say the last click happens in Lovable", async () => {
    const config = JSON.parse(await readFile(join(sb.work, ".clodable/config.json"), "utf8"));
    await sb.write(".clodable/config.json", JSON.stringify({ ...config, hosting: "lovable" }));
    const lovable = "https://lovable.dev/projects/e1a96225-0edb-4967-ae0f-256c871f673e";
    await sb.write("README.md", `Edit it in [Lovable](${lovable}).\n`);
    await sb.write("src/menu.txt", "Croissants\n");
    await save(await sb.ws(), { message: "Menu" });

    const events: ClodableEvent[] = [];
    const result = await publishAll(events);
    expect(result).toMatchObject({ deploy: "lovable", lovableUrl: lovable });
    const deploy = events.filter((e) => e.type === "step" && e.id === "deploy");
    expect(deploy).toEqual([
      expect.objectContaining({ state: "done", title: "Published on GitHub" }),
    ]);
    expect((await sb.remoteLog("main"))[0]).toBe("Menu");
  });

  it("while moving, follow the new site on Netlify: up to date, didn't update, still updating", async () => {
    const config = JSON.parse(await readFile(join(sb.work, ".clodable/config.json"), "utf8"));
    await sb.write(".clodable/config.json", JSON.stringify({ ...config, hosting: "lovable" }));
    const site = {
      id: "s1",
      name: "crumb",
      url: "https://crumb.netlify.app",
      admin: "https://app.netlify.com/sites/crumb",
      account: "acme",
    };
    await sb.write(MOVE_PATH, JSON.stringify({ version: 1, site }));
    const publishChange = async (text: string) => {
      await sb.write("src/menu.txt", `${text}\n`);
      await save(await sb.ws(), { message: text });
      const events: ClodableEvent[] = [];
      const result = await publishAll(events);
      const steps = events.filter((e) => e.type === "step" && e.id === "move:site");
      return { result, last: steps.at(-1) };
    };

    const live = await publishChange("Croissants");
    expect(live.result.site).toEqual({ url: "https://crumb-and-co.example", state: "live" });
    expect(live.last).toMatchObject({ state: "done", title: "Your site on Netlify is up to date" });
    expect((await loadMove(sb.work)).site?.liveAt).toEqual(live.result.at);

    const log = "https://app.netlify.com/sites/crumb/deploys/1";
    sb.github.deploymentFor = () => [
      { id: 2, environment: "Production", isProduction: true, state: "failure", logUrl: log },
    ];
    const failed = await publishChange("Baguettes");
    expect(failed.result.site).toEqual({ url: site.url, state: "failed", logUrl: log });
    expect(failed.last).toMatchObject({
      state: "warning",
      title: "Your site on Netlify didn't update",
    });

    sb.github.deploymentFor = () => [];
    const quiet = await publishChange("Brioche");
    expect(quiet.result.site).toEqual({ url: site.url, state: "pending" });
    expect(quiet.last).toMatchObject({ title: "Your site on Netlify is still updating" });
    expect(quiet.result.deploy).toBe("lovable");
  });
});

describe("apps on their own Supabase", () => {
  it("put changed backend functions live at Publish through Supabase's API, no other tool needed", async () => {
    const { startFakeSupabase } = await import("./fake-supabase.js");
    const { storeSecret } = await import("../src/local-secrets.js");
    const token = `sbp_${"f5".repeat(20)}`;
    const ref = "ownownownownownownow";
    const fake = await startFakeSupabase({
      token,
      nextRef: "unusedunusedunusedun",
      sourceKey: "unused",
      existing: [
        {
          ref,
          name: "crumb",
          region: "eu-west-3",
          organization_slug: "acme",
          status: "ACTIVE_HEALTHY",
          looks: 0,
          storageLimit: 50 * 1024 * 1024,
        },
      ],
    });
    const before = {
      api: process.env.CLODABLE_SUPABASE_API,
      config: process.env.CLODABLE_CONFIG_DIR,
    };
    process.env.CLODABLE_SUPABASE_API = fake.url;
    process.env.CLODABLE_CONFIG_DIR = join(sb.dir, "config");
    try {
      await storeSecret("supabase-token", token);
      const config = JSON.parse(await readFile(join(sb.work, ".clodable/config.json"), "utf8"));
      await sb.write(
        ".clodable/config.json",
        JSON.stringify({ ...config, backend: "supabase", supabase: { projectRef: ref } }),
      );
      await sb.write(
        "supabase/functions/hello/index.ts",
        'import { cors } from "../_shared/cors.ts";\nDeno.serve(() => new Response("hi", { headers: cors }));\n',
      );
      await sb.write("supabase/functions/_shared/cors.ts", "export const cors = {};\n");
      await save(await sb.ws(), { message: "Hello function" });
      const events: ClodableEvent[] = [];
      const result = await publishAll(events);
      expect(result.functions).toMatchObject({ deployed: ["hello"], pending: [], failed: [] });
      expect(fake.deployed.get(ref)?.[0]).toMatchObject({
        slug: "hello",
        files: ["supabase/functions/_shared/cors.ts", "supabase/functions/hello/index.ts"],
      });
    } finally {
      process.env.CLODABLE_SUPABASE_API = before.api;
      process.env.CLODABLE_CONFIG_DIR = before.config;
      if (before.api === undefined) delete process.env.CLODABLE_SUPABASE_API;
      if (before.config === undefined) delete process.env.CLODABLE_CONFIG_DIR;
      await fake.close();
    }
  });

  it("put them live with the Supabase CLI when Supabase isn't connected on this computer", async () => {
    // A stand-in `supabase`: `functions deploy <name>` works, asks to sign in, or fails, by name.
    const bin = join(sb.dir, "bin");
    await sb.write(
      "supabase",
      [
        "#!/bin/sh",
        'case "$3" in',
        "  later) echo 'Access token not provided. Supply an access token by running supabase login' >&2; exit 1 ;;",
        "  broken) printf 'Bundling broken\\nError: failed to bundle\\n' >&2; exit 1 ;;",
        "esac",
        "",
      ].join("\n"),
      bin,
    );
    await chmod(join(bin, "supabase"), 0o755);
    const before = { path: process.env.PATH, config: process.env.CLODABLE_CONFIG_DIR };
    process.env.PATH = `${bin}:${process.env.PATH}`;
    process.env.CLODABLE_CONFIG_DIR = join(sb.dir, "no-secrets");
    try {
      const config = JSON.parse(await readFile(join(sb.work, ".clodable/config.json"), "utf8"));
      await sb.write(
        ".clodable/config.json",
        JSON.stringify({
          ...config,
          backend: "supabase",
          supabase: { projectRef: "ownownownownownownow" },
        }),
      );
      for (const name of ["hello", "later", "broken"]) {
        await sb.write(
          `supabase/functions/${name}/index.ts`,
          "Deno.serve(() => new Response());\n",
        );
      }
      await save(await sb.ws(), { message: "Three functions" });
      const events: ClodableEvent[] = [];
      const result = await publishAll(events);
      expect(result.functions).toEqual({
        deployed: ["hello"],
        pending: ["later"],
        failed: ["broken"],
      });
      expect(events).toContainEqual({
        type: "log",
        level: "warn",
        message: "Function broken: Error: failed to bundle",
      });
    } finally {
      process.env.PATH = before.path;
      if (before.config === undefined) delete process.env.CLODABLE_CONFIG_DIR;
      else process.env.CLODABLE_CONFIG_DIR = before.config;
    }
  });
});

describe("projects without CI", () => {
  it("don't wait for checks that will never come", async () => {
    let asked = 0;
    sb.github.checkFor = () => {
      asked++;
      return { state: "none" };
    };
    await sb.write("src/app.txt", "New\n");
    await save(await sb.ws(), { message: "New" });
    await publishAll();
    expect(asked).toBe(0);
  });
});

describe("undo and restore", () => {
  it("undoes the last publish and updates the builder's files", async () => {
    await sb.write("src/app.txt", "Brand new welcome\n");
    await save(await sb.ws(), { message: "New welcome" });
    await publishAll();

    const result = await runFlow(undoPublish(await sb.ws(), instant()));

    expect(result.undid.title).toBe("New welcome");
    expect(await sb.remoteLog("main")).toEqual(["Undo: New welcome", "New welcome", "Initial app"]);
    expect(await readFile(join(sb.work, "src/app.txt"), "utf8")).toBe(
      "Welcome to Crumb & Co.\nFresh bread every morning.\n",
    );
  });

  it("restores an earlier save as a new save, keeping history", async () => {
    const ws = await sb.ws();
    await sb.write("src/app.txt", "Version A\n");
    const a = await save(ws, { message: "Version A" });
    await sb.write("src/app.txt", "Version B\n");
    await save(ws, { message: "Version B" });

    const restored = await restore(ws, a.sha!);

    expect(restored.saved).toBe(true);
    expect(await readFile(join(sb.work, "src/app.txt"), "utf8")).toBe("Version A\n");
    const h = await history(ws);
    expect(h.draft.map((c) => c.subject)).toEqual([
      expect.stringMatching(/^Restored the version from .*: Version A$/),
      "Version B",
      "Version A",
    ]);
    expect(h.draft[0]!.kind).toBe("restore");
  });
});
