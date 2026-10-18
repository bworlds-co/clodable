import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type FakeNetlify, startFakeNetlify } from "../../core/test/fake-netlify.js";
import { type FakeSupabase, startFakeSupabase } from "../../core/test/fake-supabase.js";
import { createSandbox, type Sandbox } from "../../core/test/sandbox.js";

/**
 * An app that isn't online and has no backend gets both from Cloclod, on the builder's own
 * Netlify and Supabase (fakes here): the commands the panel's buttons and Claude run, in order.
 */

const repo = resolve(import.meta.dirname, "../../..");
const tsx = resolve(repo, "node_modules/.bin/tsx");
const entry = resolve(repo, "packages/cli/src/index.ts");

const TOKEN = `sbp_${"c3".repeat(20)}`;
const NETLIFY = `nfp_${"k7".repeat(20)}`;
const REF = "newbackendrefabcdefg";

// biome-ignore lint/suspicious/noExplicitAny: each test reads the result's data in its own shape
type Loose = any;

let sb: Sandbox;
let fake: FakeSupabase;
let netlify: FakeNetlify;
let config = "";

/** The CLI, run without blocking: the fakes answer from this same process. */
function cloclod(args: string[], input?: string, extra: Record<string, string> = {}) {
  return new Promise<{ events: Loose[]; result: Loose; code: number | null }>((done, fail) => {
    const child = spawn(tsx, [entry, ...args, "--json"], {
      cwd: sb.work,
      env: {
        ...process.env,
        CLODABLE_FAKE_GITHUB: sb.bare,
        CLODABLE_CONFIG_DIR: config,
        CLODABLE_SUPABASE_API: fake.url,
        CLODABLE_SUPABASE_PROJECT_URL: fake.projectUrl,
        CLODABLE_NETLIFY_API: netlify.url,
        NO_COLOR: "1",
        ...extra,
      },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.on("error", fail);
    child.on("close", (code) => {
      const events = stdout
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line) as Loose);
      done({ events, result: events.at(-1), code });
    });
    child.stdin.end(input ?? "");
  });
}

const file = (path: string) => readFileSync(join(sb.work, path), "utf8");

beforeAll(async () => {
  sb = await createSandbox();
  config = await mkdtemp(join(tmpdir(), "cloclod-config-"));
  fake = await startFakeSupabase({ token: TOKEN, nextRef: REF, sourceKey: "unused" });
  netlify = await startFakeNetlify({ token: NETLIFY });
});

afterAll(async () => {
  await fake.close();
  await netlify.close();
  await rm(config, { recursive: true, force: true });
  await sb.cleanup();
});

describe("an app with no backend and no site", () => {
  it("says so, and what's connected on this computer", async () => {
    expect((await cloclod(["config", "backend", "none"])).result.ok).toBe(true);
    expect((await cloclod(["config", "hosting", "none"])).result.ok).toBe(true);
    const status = (await cloclod(["status"])).result.data;
    expect(status.project).toMatchObject({ backend: "none", hosting: "none" });
    expect(status.database).toEqual({ connected: false });
    expect(status.netlify).toEqual({ connected: false });
    expect(status.site).toBeUndefined();
    // Claude's instructions say where a backend and a site come from.
    expect(file("AGENTS.md")).toContain("backend consent view");
    expect(file("AGENTS.md")).toContain("**Set up hosting**");
  });

  it("needs Supabase connected first, then offers its organizations with what it costs", async () => {
    const refused = (await cloclod(["backend", "create"])).result;
    expect(refused).toMatchObject({ ok: false, error: { code: "supabase-auth" } });
    expect((await cloclod(["backend"])).result.data).toEqual({ connected: false });

    const connected = (await cloclod(["connect", "supabase"], TOKEN)).result;
    expect(connected.ok).toBe(true);
    const choices = (await cloclod(["backend"])).result.data;
    expect(choices.connected).toBe(true);
    expect(choices.organizations).toEqual([
      { slug: "acme", name: "Acme", plan: "free", freeLeft: 2 },
    ]);
    expect(choices.costs).toEqual({ acme: "Free" });
    expect(choices.region).toMatchObject({ code: "eu-central-1" });
  });

  it("gets its own backend: the project, its public address in .env, its server keys kept here", async () => {
    const run = await cloclod(["backend", "create"]);
    expect(run.result.ok).toBe(true);
    expect(run.result.data).toMatchObject({ ref: REF, region: "eu-central-1", files: [".env"] });
    expect(run.events.filter((e) => e.type === "step").map((e) => e.id)).toEqual(
      expect.arrayContaining(["backend"]),
    );
    expect(fake.projects.get(REF)).toMatchObject({ organization_slug: "acme" });

    const env = file(".env");
    expect(env).toContain(`VITE_SUPABASE_PROJECT_ID="${REF}"`);
    expect(env).toContain(`VITE_SUPABASE_PUBLISHABLE_KEY="sb_publishable_${REF}"`);
    expect(env).not.toContain("secret");
    expect(env).not.toContain("service");
    const project = JSON.parse(file(".clodable/config.json"));
    expect(project).toMatchObject({ backend: "supabase", supabase: { projectRef: REF } });
    expect(file("AGENTS.md")).toContain(`Supabase project \`${REF}\``);
    expect(JSON.parse(file(".mcp.json")).mcpServers.supabase.url).toContain(REF);
    // Sign-in works from the preview straight away: no confirmation email to wait for.
    expect(fake.projects.get(REF)?.auth).toMatchObject({ mailer_autoconfirm: true });
    expect(String(fake.projects.get(REF)?.auth?.uri_allow_list)).toContain("http://localhost:*/**");
    // The server's keys are on this computer for the preview, never in the project.
    const names = JSON.parse(file(".clodable/local/settings.json")).names;
    expect(names).toEqual([
      "SUPABASE_PUBLISHABLE_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
      "SUPABASE_URL",
    ]);
    expect((await cloclod(["settings"])).result.data.wanted).toEqual([]);

    expect((await cloclod(["backend", "create"])).result).toMatchObject({
      ok: false,
      error: { code: "already-there" },
    });
    expect((await cloclod(["status"])).result.data.database).toEqual({ connected: true });
  });

  it("goes online on Netlify: the site, its settings, and Publish set up through GitHub", async () => {
    expect((await cloclod(["site", "create"])).result).toMatchObject({
      ok: false,
      error: { code: "netlify-auth" },
    });
    expect((await cloclod(["connect", "netlify"], NETLIFY)).result.ok).toBe(true);
    expect((await cloclod(["site"])).result.data).toMatchObject({
      connected: true,
      teams: [{ slug: "builder-team", name: "Builder's team" }],
    });

    const run = await cloclod(["site", "create"]);
    expect(run.result.ok).toBe(true);
    const url = "https://crumb-site.netlify.app";
    expect(run.result.data.site).toMatchObject({
      name: "crumb-site",
      url,
      account: "builder-team",
    });
    expect(run.result.data.files).toEqual([
      "netlify.toml",
      ".github/workflows/cloclod-netlify.yml",
    ]);

    const vars = netlify.env.get("site-1")!;
    expect(vars.get("VITE_SUPABASE_URL")?.secret).toBe(false);
    expect(vars.get("SUPABASE_SERVICE_ROLE_KEY")).toMatchObject({ secret: true });
    const secrets = JSON.parse(readFileSync(join(sb.bare, "cloclod-fake-secrets.json"), "utf8"));
    expect(secrets).toEqual({ NETLIFY_AUTH_TOKEN: NETLIFY, NETLIFY_SITE_ID: "site-1" });
    expect(file(".github/workflows/cloclod-netlify.yml")).toContain("netlify-cli@");
    expect(JSON.parse(file(".clodable/config.json"))).toMatchObject({
      hosting: "github",
      liveUrl: url,
      netlify: { siteId: "site-1", name: "crumb-site", url, account: "builder-team" },
    });
    // Sign-in links come back to the site.
    expect(fake.projects.get(REF)?.auth).toMatchObject({ site_url: url });
    expect(file("AGENTS.md")).not.toContain("**Set up hosting**");

    const status = (await cloclod(["status"])).result.data;
    expect(status.site).toEqual({
      url,
      admin: "https://app.netlify.com/sites/crumb-site",
      live: false,
    });
    expect(status.netlify).toBeUndefined();
    // Running it again finds the same site.
    expect((await cloclod(["site", "create"])).result.data.site.url).toBe(url);
    expect(netlify.sites.size).toBe(1);
  });

  it("is online after the next Publish", async () => {
    expect((await cloclod(["save", "-m", "Put my site online"])).result.data.unpublished).toBe(1);
    const published = await cloclod(["publish"]);
    expect(published.result.ok).toBe(true);
    expect(published.result.data.deploy).toBe("live");
    expect(published.result.data.noHost).toBeUndefined();
    expect((await cloclod(["status"])).result.data.site.live).toBe(true);
  });

  it("a setting pasted here goes to the site too", async () => {
    const set = await cloclod(["setting", "GREETING"], "Bonjour");
    expect(set.result.ok).toBe(true);
    expect(netlify.env.get("site-1")?.get("GREETING")).toEqual({ value: "Bonjour", secret: true });
  });

  it("recognizes an existing live site without this computer's publish record", async () => {
    const statePath = join(sb.work, ".clodable/local/state.json");
    const state = JSON.parse(file(".clodable/local/state.json"));
    delete state.siteLiveAt;
    delete state.lastPublish;
    writeFileSync(statePath, JSON.stringify(state));
    const site = netlify.sites.get("site-1")!;
    // A failed host lookup must not invite a first Publish or claim the site is live.
    netlify.sites.delete("site-1");
    expect((await cloclod(["status"])).result.data.site).toMatchObject({
      live: false,
      statusKnown: false,
    });
    site.published_deploy = { state: "ready", published_at: "2026-10-17T10:00:00Z" };
    netlify.sites.set("site-1", site);
    expect((await cloclod(["status"])).result.data.site).toMatchObject({ live: true });
    expect(JSON.parse(file(".clodable/local/state.json")).siteLiveAt).toBe("2026-10-17T10:00:00Z");
  });

  it("does not replace a remembered site when Netlify cannot find it", async () => {
    const site = netlify.sites.get("site-1")!;
    const before = file(".clodable/config.json");
    netlify.sites.delete("site-1");
    try {
      expect((await cloclod(["site", "create"])).result.ok).toBe(false);
      expect(netlify.sites.size).toBe(0);
      expect(file(".clodable/config.json")).toBe(before);
    } finally {
      netlify.sites.set("site-1", site);
    }
  });

  it("does not replace an inaccessible backend while retrying unfinished setup", async () => {
    const before = file(".clodable/config.json");
    const pending = JSON.parse(before);
    pending.backend = "none";
    pending.supabase.projectRef = "unavailable";
    writeFileSync(join(sb.work, ".clodable/config.json"), JSON.stringify(pending));
    const start = fake.requests.length;
    try {
      expect((await cloclod(["backend", "create"])).result.ok).toBe(false);
      expect(
        fake.requests.slice(start).some((r) => r.method === "POST" && r.path === "/v1/projects"),
      ).toBe(false);
      expect(JSON.parse(file(".clodable/config.json")).supabase.projectRef).toBe("unavailable");
    } finally {
      writeFileSync(join(sb.work, ".clodable/config.json"), before);
    }
  });
});
