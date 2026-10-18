import { spawn } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type FakeNetlify, startFakeNetlify } from "../../core/test/fake-netlify.js";
import { type FakeResend, startFakeResend } from "../../core/test/fake-resend.js";
import { type FakeSupabase, startFakeSupabase } from "../../core/test/fake-supabase.js";
import {
  DST,
  type LocalPostgres,
  PG_BIN,
  SRC,
  startLocalPostgres,
} from "../../core/test/move-fixtures.js";
import { createSandbox, type Sandbox } from "../../core/test/sandbox.js";

/**
 * The whole move, step by step, the way the plugin drives it: the CLI with --json, a stand-in for
 * Supabase's API and storage, and a local PostgreSQL as the new backend's database.
 */

const repo = resolve(import.meta.dirname, "../../..");
const tsx = resolve(repo, "node_modules/.bin/tsx");
const entry = resolve(repo, "packages/cli/src/index.ts");

// biome-ignore lint/suspicious/noExplicitAny: the CLI's JSON results are read loosely here.
type Loose = any;

const TOKEN = `sbp_${"a1".repeat(20)}`;
const NETLIFY = `nfp_${"z9".repeat(20)}`;
const SOURCE_KEY = "eyJsource.eyJservice.key";
/** What Claude finds in the test app's code: its AI call, Google sign-in, a job, uploads. */
const FACTS = {
  ai: [{ feature: "Ask the AI", where: "src/server/greet.ts" }],
  signIn: { email: true, google: true },
  scheduledJobs: [{ feature: "A nightly clean-up" }],
  uploads: [{ feature: "Avatars and covers" }],
};
const RESEND = `re_full_${"r4".repeat(12)}`;

/** Everything a move talks to: a local PostgreSQL, fake Supabase, Netlify and Resend, an app. */
interface World {
  sb: Sandbox;
  pg: LocalPostgres;
  fake: FakeSupabase;
  netlify: FakeNetlify;
  resend: FakeResend;
  config: string;
  zip: string;
  /** Everything the CLI printed, to check no secret ever is. */
  outputs: string[];
  clodable(
    args: string[],
    input?: string,
    env?: Record<string, string>,
  ): Promise<{
    events: Array<{ type: string; [key: string]: Loose }>;
    result: Loose;
    code: number | null;
  }>;
}

async function startWorld(): Promise<World> {
  let sb: Sandbox;
  let pg: LocalPostgres;
  let fake: FakeSupabase;
  let netlify: FakeNetlify;
  let resend: FakeResend;
  let config = "";
  let zip = "";
  const outputs: string[] = [];

  /** The CLI, run without blocking: the fake Supabase answers from this same process. */
  const clodable = (args: string[], input?: string, extra: Record<string, string> = {}) =>
    new Promise<{
      events: Array<{ type: string; [key: string]: Loose }>;
      result: Loose;
      code: number | null;
    }>((done, fail) => {
      const child = spawn(tsx, [entry, ...args, "--json"], {
        cwd: sb.work,
        env: {
          ...process.env,
          CLODABLE_FAKE_GITHUB: sb.bare,
          CLODABLE_CONFIG_DIR: config,
          CLODABLE_SUPABASE_API: fake.url,
          CLODABLE_SUPABASE_PROJECT_URL: fake.projectUrl,
          CLODABLE_MOVE_DATABASE_URL: pg.url("dst"),
          CLODABLE_POSTGRES_HOME: dirname(PG_BIN!),
          CLODABLE_NETLIFY_API: netlify.url,
          CLODABLE_RESEND_API: resend.url,
          NO_COLOR: "1",
          ...extra,
        },
        stdio: ["pipe", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString();
      });
      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      child.on("error", fail);
      child.on("close", (code) => {
        outputs.push(stdout, stderr);
        const events = stdout
          .split("\n")
          .filter(Boolean)
          .map((line) => JSON.parse(line) as { type: string; [key: string]: Loose });
        done({ events, result: events.at(-1), code });
      });
      child.stdin.end(input ?? "");
    });

  pg = await startLocalPostgres();
  zip = await pg.exportZip();
  config = await mkdtemp(join(tmpdir(), "clodable-config-"));
  netlify = await startFakeNetlify({ token: NETLIFY });
  resend = await startFakeResend({ fullKeys: [RESEND] });
  fake = await startFakeSupabase({
    token: TOKEN,
    nextRef: DST,
    sourceKey: SOURCE_KEY,
    // Uploads land in the new database's file list, as Supabase's storage does.
    onUpload: (ref, bucket, name, size, type) => {
      if (ref !== DST) return;
      pg.psql(
        "dst",
        `insert into storage.objects (bucket_id, name, metadata) values ('${bucket}', '${name}', '{"size": ${size}, "mimetype": "${type}"}') on conflict (bucket_id, name) do nothing;`,
      );
    },
  });
  // The files Lovable Cloud holds today.
  fake.files.set(`${SRC}/avatars/11111111-1111-1111-1111-111111111111/me.png`, {
    body: Buffer.alloc(1234, 7),
    type: "image/png",
  });
  fake.files.set(`${SRC}/public-images/hero.jpg`, {
    body: Buffer.alloc(99000, 3),
    type: "image/jpeg",
  });
  fake.publicBuckets.add(`${SRC}/public-images`);

  sb = await createSandbox();
  await sb.write(
    "src/integrations/supabase/client.ts",
    `export const SUPABASE_URL = "https://${SRC}.supabase.co";\n`,
  );
  await sb.write(
    "supabase/config.toml",
    `project_id = "${SRC}"\n\n[functions.hello]\nverify_jwt = false\n`,
  );
  await sb.write(
    "supabase/functions/hello/index.ts",
    `import { cors } from "../_shared/cors.ts";\nDeno.serve(() => new Response(Deno.env.get("RESEND_API_KEY") ?? "", { headers: cors }));\n`,
  );
  await sb.write(
    "supabase/functions/_shared/cors.ts",
    `export const cors = { "Access-Control-Allow-Origin": "*" };\n`,
  );
  await sb.write("supabase/migrations/20250101120000_init.sql", "-- the first change\n");
  // Lovable's own settings file: the old backend's public address and key.
  await sb.write(
    ".env",
    `VITE_SUPABASE_PROJECT_ID="${SRC}"\nVITE_SUPABASE_PUBLISHABLE_KEY="eyJold.publishable"\nVITE_SUPABASE_URL="https://${SRC}.supabase.co"\n`,
  );
  // Server code reading settings Lovable's hosting kept for it, and calling Lovable's AI.
  await sb.write(
    "src/server/greet.ts",
    // biome-ignore lint/suspicious/noTemplateCurlyInString: the app's own source, a template literal
    'export const greet = () => process.env["GREETING"] ?? "";\nexport const ai = () => fetch("https://ai.gateway.lovable.dev/v1/chat/completions", { headers: { Authorization: `Bearer ${process.env.LOVABLE_API_KEY}` } });\n',
  );
  return { sb, pg, fake, netlify, resend, config, zip, outputs, clodable };
}

async function stopWorld(w: World | undefined) {
  await w?.sb.cleanup();
  await w?.fake.close();
  await w?.netlify.close();
  await w?.resend.close();
  await w?.pg.stop();
  if (w?.config) await rm(w.config, { recursive: true, force: true });
}

describe.skipIf(!PG_BIN)("clodable move", () => {
  let world: World;
  let sb: Sandbox;
  let pg: LocalPostgres;
  let fake: FakeSupabase;
  let netlify: FakeNetlify;
  let resend: FakeResend;
  let config = "";
  let zip = "";
  let outputs: string[] = [];
  const clodable = (args: string[], input?: string, env?: Record<string, string>) =>
    world.clodable(args, input, env);

  beforeAll(async () => {
    world = await startWorld();
    ({ sb, pg, fake, netlify, resend, config, zip, outputs } = world);
  }, 180_000);

  afterAll(() => stopWorld(world));

  it("starts with Claude looking at the app, then connecting Supabase", async () => {
    const first = await clodable(["move", "status"]);
    expect(first.result.data.steps.slice(0, 2).map((s: Loose) => [s.id, s.state])).toEqual([
      ["facts", "next"],
      ["connect", "later"],
    ]);
    // Clodable's scan is where Claude starts; it checks each thing in the code.
    const look = (await clodable(["move", "facts"])).result.data;
    expect(look.facts).toBeUndefined();
    expect(look.hints).toMatchObject({
      ai: ["src/server/greet.ts"],
      settings: { wanted: ["GREETING"], lovable: ["LOVABLE_API_KEY"] },
    });
    // What it records has one shape; anything else is refused, plainly.
    expect((await clodable(["move", "facts", "--set"], "not json")).result.error.code).toBe(
      "invalid-config",
    );
    const wrong = await clodable(["move", "facts", "--set"], '{"ai":"yes","extra":1}');
    expect(wrong.result.error).toMatchObject({ code: "invalid-config" });
    const set = await clodable(["move", "facts", "--set"], JSON.stringify(FACTS));
    expect(set.result.data).toMatchObject({
      ai: [{ feature: "Ask the AI" }],
      signIn: { email: true, google: true, apple: false, other: [] },
      appEmails: [],
    });
    // What it found names the move's parts, and decides which steps there are.
    const check = (await clodable(["move", "check"])).result.data;
    expect(check.checked).toBe(true);
    expect(check.items.find((i: Loose) => i.id === "lovable-ai")).toMatchObject({
      label: "An AI feature",
      detail: expect.stringMatching(/^Ask the AI: it runs on Lovable's AI\./),
    });
    expect(check.items.find((i: Loose) => i.id === "sign-in")?.label).toBe("Sign in with Google");
    const status = await clodable(["move", "status"]);
    expect(status.result.ok).toBe(true);
    expect(status.result.data.steps[0]).toEqual({
      id: "facts",
      title: "Look at your app",
      state: "done",
      detail: "AI · Google sign-in · scheduled jobs · uploads",
    });
    expect(status.result.data.steps.map((s: Loose) => [s.id, s.state])).toEqual([
      ["facts", "done"],
      ["connect", "next"],
      ["create", "later"],
      ["export", "later"],
      ["copy", "later"],
      ["functions", "later"],
      ["try", "later"],
      ["netlify", "later"],
      ["site", "later"],
      ["emails", "later"],
      ["services", "later"],
      ["google", "later"],
      ["freeze", "later"],
      ["final-export", "later"],
      ["final-copy", "later"],
      ["golive", "later"],
      ["domain", "later"],
      ["lovable", "later"],
    ]);
  });

  it("connects with a token from stdin, and keeps it on this computer only", async () => {
    expect((await clodable(["move", "connect"], "not a token")).result.error.code).toBe(
      "supabase-auth",
    );
    expect((await clodable(["move", "connect"], `sbp_${"b2".repeat(20)}`)).result).toMatchObject({
      ok: false,
      error: { code: "supabase-auth", message: "Supabase didn't accept your access token." },
    });
    const connect = await clodable(["move", "connect"], TOKEN);
    expect(connect.result).toMatchObject({
      ok: true,
      data: { organizations: [{ slug: "acme", name: "Acme", plan: "free", freeLeft: 2 }] },
    });
    const stored = join(config, "secrets.json");
    expect(statSync(stored).mode & 0o777).toBe(0o600);
    expect(JSON.parse(readFileSync(stored, "utf8"))["supabase-token"]).toBe(TOKEN);

    const choices = await clodable(["move", "choices"]);
    expect(choices.result.data).toMatchObject({
      organizations: [{ slug: "acme", cost: "Free" }],
      region: { code: "eu-central-1" },
    });
  });

  it("creates the new backend and waits until it's up", async () => {
    const create = await clodable(["move", "create", "--org", "acme"]);
    expect(create.result).toMatchObject({ ok: true, data: { ref: DST, region: "eu-central-1" } });
    const steps = create.events.filter((e) => e.type === "step");
    expect(steps.at(-1)).toMatchObject({ id: "move:create", state: "done" });
    // The database password went to Supabase and to this computer's secret store, nowhere else.
    const password = fake.projects.get(DST)?.dbPass ?? "";
    expect(password).toMatch(/^[A-Za-z0-9]{32}$/);
    expect(
      JSON.parse(readFileSync(join(config, "secrets.json"), "utf8"))[`db-password:${DST}`],
    ).toBe(password);
    // Again: nothing new is created.
    expect((await clodable(["move", "create"])).result.data.ref).toBe(DST);
    expect(
      fake.requests.filter((r) => r.method === "POST" && r.path === "/v1/projects"),
    ).toHaveLength(1);
  });

  it("doesn't call an unavailable or paused copy ready, or hide an account error", async () => {
    const project = fake.projects.get(DST)!;
    const before = fake.requests.filter((r) => r.method === "POST").length;
    try {
      fake.projects.delete(DST);
      for (const command of ["create", "diagnose"]) {
        const missing = await clodable(["move", command]);
        expect(missing.result).toMatchObject({
          ok: false,
          error: {
            code: "not-found",
            message: "Your new backend isn't available to this Supabase account.",
          },
        });
        expect(missing.events).not.toContainEqual(
          expect.objectContaining({ id: "move:create", state: "done" }),
        );
      }
      fake.projects.set(DST, project);
      project.status = "INACTIVE";
      expect((await clodable(["move", "create"])).result).toMatchObject({
        ok: false,
        error: { code: "move-not-ready", message: "Your new backend is paused." },
      });
      expect((await clodable(["move", "diagnose"])).result.data.findings).toEqual([
        expect.objectContaining({ ok: false, label: "Your new backend is paused" }),
      ]);
      expect(fake.requests.filter((r) => r.method === "POST")).toHaveLength(before);
      const saved = readFileSync(join(config, "secrets.json"), "utf8");
      try {
        writeFileSync(
          join(config, "secrets.json"),
          JSON.stringify({ "supabase-token": "expired-test-token" }),
        );
        expect((await clodable(["move", "diagnose"])).result).toMatchObject({
          ok: false,
          error: { code: "supabase-auth" },
        });
      } finally {
        writeFileSync(join(config, "secrets.json"), saved);
      }
    } finally {
      fake.projects.set(DST, project);
      project.status = "ACTIVE_HEALTHY";
    }
  });

  it("reads the export and copies it, then checks everything is there", async () => {
    const read = await clodable(["move", "export", "--file", zip]);
    expect(read.result).toMatchObject({
      ok: true,
      data: { people: { total: 3, withPassword: 2 }, sourceRefs: [SRC] },
    });
    // A failed replacement must leave the previous archive usable for the next copy.
    const damaged = join(sb.work, "damaged.dump");
    writeFileSync(damaged, "not a PostgreSQL archive");
    expect((await clodable(["move", "export", "--file", damaged])).result.ok).toBe(false);
    await rm(damaged);
    const copy = await clodable(["move", "copy"]);
    expect(copy.result.ok).toBe(true);
    expect(copy.result.data.ok).toBe(true);
    // The preview can sign people in on the copy: links come back to it, no confirmation email.
    expect(fake.projects.get(DST)?.auth).toMatchObject({
      site_url: "http://localhost:8080",
      uri_allow_list: "http://localhost:*/**,http://127.0.0.1:*/**",
      mailer_autoconfirm: true,
    });
    const ids = new Set(copy.events.filter((e) => e.type === "step").map((e) => e.id));
    expect([...ids]).toEqual(["move:data", "move:fixes", "move:checks"]);
    // Copied, but its encrypted secret is still to add: the step stays open for it.
    const status = await clodable(["move", "status"]);
    expect(status.result.data.vaultLeft).toEqual(["stripe_webhook_key"]);
    expect(status.result.data.steps.find((s: Loose) => s.id === "copy")).toMatchObject({
      state: "next",
      detail: "1 database secret to add",
    });
    expect(status.result.data.steps.map((s: Loose) => [s.id, s.state])).toEqual([
      ["facts", "done"],
      ["connect", "done"],
      ["create", "done"],
      ["export", "done"],
      ["copy", "next"],
      ["files", "later"],
      ["functions", "later"],
      ["try", "later"],
      ["netlify", "later"],
      ["site", "later"],
      ["emails", "later"],
      ["services", "later"],
      ["google", "later"],
      ["freeze", "later"],
      ["final-export", "later"],
      ["final-copy", "later"],
      ["golive", "later"],
      ["domain", "later"],
      ["lovable", "later"],
    ]);
  });

  it("asks for the database's own secrets Lovable can't hand over, and keeps them in the vault", async () => {
    const before = (await clodable(["move", "vault"])).result.data;
    expect(before).toMatchObject({ wanted: ["stripe_webhook_key"], set: [] });
    expect(before.query).toBe(
      "select name, decrypted_secret from vault.decrypted_secrets where name in ('stripe_webhook_key');",
    );
    expect((await clodable(["move", "vault-secret", "nope"], "x")).result.error.code).toBe(
      "invalid-config",
    );
    const saved = await clodable(
      ["move", "vault-secret", "stripe_webhook_key"],
      "whsec_vault_value\n",
    );
    expect(saved.result.data).toEqual({
      wanted: ["stripe_webhook_key"],
      set: ["stripe_webhook_key"],
    });
    const stored = pg.psql(
      "dst",
      "\\pset tuples_only on\nselect secret from vault.secrets where name = 'stripe_webhook_key';",
    );
    expect(stored.trim()).toBe("whsec_vault_value");
    // Added: the copy is done, the files come next.
    const after = (await clodable(["move", "status"])).result.data;
    expect(after.vaultLeft).toBeUndefined();
    expect(after.steps.slice(4, 6).map((s: Loose) => [s.id, s.state])).toEqual([
      ["copy", "done"],
      ["files", "next"],
    ]);
  });

  it("points database webhooks at the new backend", async () => {
    const def = pg.psql(
      "dst",
      "\\pset tuples_only on\nselect pg_get_triggerdef(oid) from pg_trigger where tgname = 'posts_webhook';",
    );
    expect(def).toContain(`https://${DST}.supabase.co/functions/v1/send-digest`);
    expect(def).not.toContain(SRC);
  });

  it("diagnoses the copy in safe facts, and fixes what's Clodable's to fix", async () => {
    // Sign-in settings undone, as on a copy made before Clodable set them.
    const project = fake.projects.get(DST)!;
    project.auth = {
      site_url: "http://localhost:3000",
      uri_allow_list: "",
      mailer_autoconfirm: false,
    };
    const look = await clodable(["move", "diagnose"]);
    const findings = Object.fromEntries(
      look.result.data.findings.map((f: Loose) => [f.id, f]),
    ) as Record<string, Loose>;
    expect(findings.running).toMatchObject({ ok: true });
    expect(findings["sign-in"]).toMatchObject({
      ok: false,
      fix: "Run `clodable move diagnose --fix`.",
    });
    expect(findings.people.label).toBe("3 people on the copy");
    expect(findings.data).toMatchObject({ ok: true });
    // Nothing was changed by looking.
    expect(project.auth.mailer_autoconfirm).toBe(false);

    const fixed = await clodable(["move", "diagnose", "--fix"]);
    expect(fixed.result.data.findings.find((f: Loose) => f.id === "sign-in")).toMatchObject({
      ok: true,
      fixed: true,
    });
    expect(project.auth).toMatchObject({
      uri_allow_list: "http://localhost:*/**,http://127.0.0.1:*/**",
      mailer_autoconfirm: true,
    });
  });

  it("copies public files on its own, and private ones with Lovable's key", async () => {
    const first = await clodable(["move", "files"]);
    expect(first.result.data).toMatchObject({ copied: 1, total: 2, waiting: ["avatars"] });
    expect(fake.files.get(`${DST}/public-images/hero.jpg`)?.body.length).toBe(99000);

    const second = await clodable(["move", "files", "--private"], SOURCE_KEY);
    expect(second.result.data).toMatchObject({ copied: 2, total: 2, waiting: [], failed: 0 });
    // Links in people's profiles follow; a signed link (old backend's token) is counted, not changed.
    expect(second.result.data.signedLinks).toBe(1);
    const meta = pg.psql(
      "dst",
      "\\pset tuples_only on\nselect raw_user_meta_data->>'avatar_url' from auth.users where email = 'ada@example.com';",
    );
    expect(meta.trim()).toBe(`https://${DST}.supabase.co/storage/v1/object/public/avatars/ada.png`);
    // The file keeps its owner, so "only you see your avatar" still holds.
    const owner = pg.psql(
      "dst",
      "\\pset tuples_only on\nselect owner_id from storage.objects where bucket_id = 'avatars';",
    );
    expect(owner.trim()).toBe("11111111-1111-1111-1111-111111111111");
    const verify = await clodable(["move", "verify"]);
    expect(verify.result.data.checks.find((c: Loose) => c.id === "files")).toMatchObject({
      ok: true,
      label: "All 2 files are there",
    });
  });

  it("deploys every function with its shared files, and takes secrets from stdin", async () => {
    const deploy = await clodable(["move", "functions"]);
    expect(deploy.result.data).toEqual({
      deployed: ["hello"],
      failed: [],
      missingSecrets: ["RESEND_API_KEY"],
    });
    expect(fake.deployed.get(DST)?.[0]).toMatchObject({
      slug: "hello",
      metadata: { entrypoint_path: "supabase/functions/hello/index.ts", verify_jwt: false },
      files: ["supabase/functions/_shared/cors.ts", "supabase/functions/hello/index.ts"],
    });
    const secret = await clodable(["move", "secret", "RESEND_API_KEY"], "re_test_123\n");
    expect(secret.result.data).toEqual({ wanted: ["RESEND_API_KEY"], set: ["RESEND_API_KEY"] });
    expect(fake.secrets.get(DST)?.get("RESEND_API_KEY")).toBe("re_test_123");
  });

  it("puts the site on Netlify, with Publish set up through GitHub", async () => {
    expect((await clodable(["move", "netlify"], "short")).result.error.code).toBe("netlify-auth");
    const connect = await clodable(["move", "netlify"], NETLIFY);
    expect(connect.result.data.accounts).toEqual([
      { id: "a1", slug: "builder-team", name: "Builder's team" },
    ]);
    // A name someone else has on Netlify: another one is picked.
    netlify.taken.add("crumb-site");
    const site = await clodable(["move", "site"]);
    expect(site.result.ok).toBe(true);
    expect(site.result.data.site.url).toMatch(/^https:\/\/crumb-site-[a-z0-9]{4}\.netlify\.app$/);
    expect(site.result.data.settings).toEqual({
      wanted: ["GREETING"],
      set: [],
      lovable: ["LOVABLE_API_KEY"],
    });
    const [siteId] = [...netlify.sites.keys()];
    const vars = netlify.env.get(siteId!)!;
    expect(vars.get("VITE_SUPABASE_URL")?.value).toBe(fake.projectUrl.replace("{ref}", DST));
    expect(vars.get("VITE_SUPABASE_PUBLISHABLE_KEY")?.value).toBe(`sb_publishable_${DST}`);
    expect(vars.get("SUPABASE_SERVICE_ROLE_KEY")).toEqual({
      value: `legacy-service-${DST}`,
      secret: true,
    });
    // The files Publish needs, and the secrets GitHub Actions deploys with.
    expect(site.result.data.files).toEqual([
      "netlify.toml",
      ".github/workflows/clodable-netlify.yml",
    ]);
    const workflow = readFileSync(join(sb.work, ".github/workflows/clodable-netlify.yml"), "utf8");
    expect(workflow).toContain("deploy --build --prod");
    expect(workflow).toContain(["$", "{{ secrets.NETLIFY_AUTH_TOKEN }}"].join(""));
    const secrets = JSON.parse(readFileSync(join(sb.bare, "clodable-fake-secrets.json"), "utf8"));
    expect(secrets).toEqual({ NETLIFY_AUTH_TOKEN: NETLIFY, NETLIFY_SITE_ID: siteId });

    const setting = await clodable(["move", "setting", "GREETING"], "Hello from Netlify\n");
    expect(setting.result.data).toEqual({
      wanted: ["GREETING"],
      set: ["GREETING"],
      lovable: ["LOVABLE_API_KEY"],
    });
    expect(vars.get("GREETING")).toEqual({ value: "Hello from Netlify", secret: true });
    // One paste, both places: the preview on this computer has it too.
    expect((await clodable(["settings"])).result.data).toEqual({
      wanted: ["GREETING"],
      local: ["GREETING"],
      lovable: ["LOVABLE_API_KEY"],
      site: ["GREETING"],
    });
    // Again: the same site, nothing created twice.
    expect((await clodable(["move", "site"])).result.data.site.url).toBe(site.result.data.site.url);
    expect(netlify.sites.size).toBe(1);
  });

  it("points the preview at the copy", async () => {
    expect((await clodable(["move", "preview", "copy"])).result.ok).toBe(true);
    const status = await clodable(["move", "status"]);
    expect(status.result.data.preview).toBe("copy");
    const steps = status.result.data.steps.map((s: Loose) => [s.id, s.state]);
    expect(steps.slice(0, 10).every(([, state]: string[]) => state === "done")).toBe(true);
    expect(steps.slice(10)).toEqual([
      ["emails", "next"],
      ["services", "later"],
      ["google", "later"],
      ["freeze", "later"],
      ["final-export", "later"],
      ["final-copy", "later"],
      ["golive", "later"],
      ["domain", "later"],
      ["lovable", "later"],
    ]);
  });

  it("sets up emails from the builder's domain, through Resend", async () => {
    expect((await clodable(["move", "resend"], "nope")).result.error.code).toBe("resend-auth");
    expect(
      (await clodable(["move", "resend"], "re_sendingonly_123456789")).result.error,
    ).toMatchObject({
      code: "resend-auth",
      message: "Resend didn't accept that key.",
    });
    expect((await clodable(["move", "resend"], RESEND)).result.data).toEqual({ domains: [] });
    expect((await clodable(["move", "emails"])).result.error.message).toBe(
      "Which domain should your emails come from?",
    );

    const waiting = await clodable(["move", "emails", "--domain", "Crumb.app"]);
    expect(waiting.result.data).toMatchObject({
      domain: "crumb.app",
      sender: "no-reply@crumb.app",
      connected: false,
    });
    expect(waiting.result.data.records.map((r: Loose) => [r.type, r.name])).toEqual([
      ["MX", "send"],
      ["TXT", "send"],
      ["TXT", "resend._domainkey"],
    ]);
    // Nearest to the new backend; Supabase still sends with its own test mailer.
    expect([...resend.domains.values()][0]).toMatchObject({
      name: "crumb.app",
      region: "eu-west-1",
    });
    expect(fake.projects.get(DST)?.auth?.smtp_host).toBeUndefined();
    let status = await clodable(["move", "status"]);
    expect(status.result.data.steps.find((s: Loose) => s.id === "emails")).toMatchObject({
      state: "attention",
      detail: "crumb.app: waiting for its records",
    });

    // The builder added the records at their domain's provider.
    [...resend.domains.values()][0]!.status = "verified";
    const ready = await clodable(["move", "emails"]);
    expect(ready.result.data).toMatchObject({ connected: true, status: "verified" });
    // Supabase gets a key that can only send, and only from that domain.
    expect(resend.keys).toEqual([
      expect.objectContaining({ permission: "sending_access", domainId: "dom-1" }),
    ]);
    expect(fake.projects.get(DST)?.auth).toMatchObject({
      smtp_host: "smtp.resend.com",
      smtp_port: "465",
      smtp_user: "resend",
      smtp_pass: resend.keys[0]!.token,
      smtp_admin_email: "no-reply@crumb.app",
      rate_limit_email_sent: 100,
    });
    // Again: nothing created twice.
    await clodable(["move", "emails"]);
    expect(resend.keys).toHaveLength(1);
    status = await clodable(["move", "status"]);
    expect(status.result.data.steps.find((s: Loose) => s.id === "services")).toMatchObject({
      state: "next",
      detail: "AI",
    });
  });

  it("can go on without switching Lovable's AI, saying it stops with Lovable", async () => {
    expect((await clodable(["move", "services", "--skip"])).result.ok).toBe(true);
    const steps = (await clodable(["move", "status"])).result.data.steps;
    expect(steps.find((s: Loose) => s.id === "services")).toMatchObject({
      state: "done",
      detail: "Skipped: AI stops with Lovable",
    });
    expect(steps.find((s: Loose) => s.id === "google")).toMatchObject({ state: "next" });
  });

  it("turns Google sign-in on with the builder's own client, its secret never in the chat", async () => {
    expect(
      (await clodable(["move", "google", "not-a-client"], "x".repeat(20))).result.error.code,
    ).toBe("invalid-config");
    const id = "1234-abc.apps.googleusercontent.com";
    const on = await clodable(["move", "google", id], "GOCSPX-google-secret-value\n");
    expect(on.result.data).toMatchObject({ used: true, configured: true });
    expect(fake.projects.get(DST)?.auth).toMatchObject({
      external_google_enabled: true,
      external_google_client_id: id,
      external_google_secret: "GOCSPX-google-secret-value",
    });
    // The preview and the site sign in with Supabase's Google from now on.
    const [siteId] = [...netlify.sites.keys()];
    // Built into the page on purpose: a plain value, or Netlify's secret scan stops the deploy.
    expect(netlify.env.get(siteId!)?.get("VITE_GOOGLE_SIGN_IN")).toEqual({
      value: "supabase",
      secret: false,
    });
    const steps = (await clodable(["move", "status"])).result.data.steps;
    expect(steps.find((s: Loose) => s.id === "google")).toMatchObject({ state: "done" });
    expect(steps.find((s: Loose) => s.id === "freeze")).toMatchObject({ state: "next" });
  });

  it("pauses the live app, and refuses an export made before the pause", async () => {
    const plan = (await clodable(["move", "pause"])).result.data;
    expect(plan.freeze).toContain('on "public"."posts" from authenticated;');
    expect(plan.freeze).toContain('on "public"."profiles" from authenticated;');
    // anon could only read posts: nothing to take away from it there.
    expect(plan.freeze).not.toContain('"public"."posts" from anon');
    expect(plan.freeze).toContain("select cron.alter_job(jobid, active := false) from cron.job;");
    expect(plan.undo).toContain('on "public"."posts" to authenticated;');
    expect((await clodable(["move", "paused"])).result.ok).toBe(true);

    // The builder pastes it in Lovable: the live app keeps reading, and stops writing.
    pg.psql("src", plan.freeze);
    // New sign-ups and password changes wait too; signing in (last_sign_in_at) still works.
    expect(() =>
      pg.psql(
        "src",
        "insert into auth.users (id, email) values ('99999999-9999-9999-9999-999999999999', 'late@example.com');",
      ),
    ).toThrow(/moving to a new home/);
    expect(() =>
      pg.psql("src", "update auth.users set encrypted_password = 'x' where email is not null;"),
    ).toThrow(/moving to a new home/);
    pg.psql("src", "update auth.users set last_sign_in_at = now();");
    const stale = await clodable(["move", "export", "--file", zip]);
    expect(stale.result.error).toMatchObject({ code: "move-not-ready" });
    expect(stale.result.error.message).toContain("made before the pause");

    pg.psql("src", "insert into public.posts (title) values ('written just before the pause');");
    const final = await pg.exportZip("final.zip");
    expect((await clodable(["move", "export", "--file", final])).result.ok).toBe(true);
    const status = await clodable(["move", "status"]);
    expect(
      status.result.data.steps
        .filter((s: Loose) => ["freeze", "final-export", "final-copy"].includes(s.id))
        .map((s: Loose) => s.state),
    ).toEqual(["done", "done", "next"]);
    // The pause stays as it was before it, for the copy and for undoing it.
    expect((await clodable(["move", "pause"])).result.data.undo).toBe(plan.undo);
  });

  it("copies it in for good, with the app's writes and its scheduled jobs", async () => {
    const copy = await clodable(["move", "copy"]);
    expect(copy.result.data.ok).toBe(true);
    const rows = (sql: string) => pg.psql("dst", `\\pset tuples_only on\n${sql}`).trim();
    expect(
      rows("select count(*) from public.posts where title = 'written just before the pause';"),
    ).toBe("1");
    expect(
      rows(
        "select string_agg(privilege_type, ',' order by privilege_type) from information_schema.role_table_grants where grantee = 'authenticated' and table_name = 'posts' and privilege_type in ('INSERT','UPDATE','DELETE');",
      ),
    ).toBe("DELETE,INSERT,UPDATE");
    expect(rows("select jobname || ' ' || active::text || ' ' || command from cron.job;")).toBe(
      `daily-digest true select net.http_post('https://${DST}.supabase.co/functions/v1/send-digest')`,
    );
    // Sign-in stays as it was: the copy's preview settings aren't put back.
    expect(fake.projects.get(DST)?.auth?.smtp_host).toBe("smtp.resend.com");
    // The pause's guard stayed on Lovable.
    expect(rows("select count(*) from pg_trigger where tgname = 'clodable_pause';")).toBe("0");
    expect(rows("select count(*) from pg_proc where proname = 'clodable_pause';")).toBe("0");
    // A second final copy doesn't start the jobs twice.
    expect((await clodable(["move", "copy"])).result.data.ok).toBe(true);
    expect(rows("select count(*) from cron.job;")).toBe("1");
  });

  it("goes live: sign-in, the app's files and Clodable's settings use the new backend", async () => {
    const live = await clodable(["move", "golive", "--confirm-email", "yes", "--sign-up", "no"]);
    expect(live.result.ok).toBe(true);
    const site = live.result.data.url as string;
    expect(site).toMatch(/^https:\/\/crumb-site-[a-z0-9]{4}\.netlify\.app$/);
    expect(live.result.data.files).toEqual([
      ".env",
      "supabase/config.toml",
      "src/integrations/supabase/client.ts",
    ]);
    expect(fake.projects.get(DST)?.auth).toMatchObject({
      site_url: site,
      mailer_autoconfirm: false,
      // Only people the builder invites.
      disable_signup: true,
    });
    expect(live.result.data.signUp).toBe(false);
    expect(String(fake.projects.get(DST)?.auth?.uri_allow_list)).toContain(`${site}/**`);
    const env = readFileSync(join(sb.work, ".env"), "utf8");
    expect(env).toContain(`VITE_SUPABASE_PROJECT_ID="${DST}"`);
    expect(env).toContain(`VITE_SUPABASE_PUBLISHABLE_KEY="sb_publishable_${DST}"`);
    expect(env).not.toContain(SRC);
    expect(readFileSync(join(sb.work, "supabase/config.toml"), "utf8")).toContain(
      `project_id = "${DST}"`,
    );
    const config = JSON.parse(readFileSync(join(sb.work, ".clodable/config.json"), "utf8"));
    expect(config).toMatchObject({ backend: "supabase", hosting: "github", liveUrl: site });
    expect(config.supabase.projectRef).toBe(DST);

    // Looking again doesn't put the preview's sign-in settings back.
    const look = await clodable(["move", "diagnose", "--fix"]);
    expect(look.result.data.findings.find((f: Loose) => f.id === "sign-in")).toMatchObject({
      ok: true,
      label: "Sign-in links come back to your site",
    });
    expect(fake.projects.get(DST)?.auth).toMatchObject({
      site_url: site,
      mailer_autoconfirm: false,
    });
    // Nor does the preview's own switch.
    await clodable(["move", "preview", "copy"]);
    expect(fake.projects.get(DST)?.auth?.site_url).toBe(site);
  });

  it("moves the app's own domain to its new site, then sign-in links use it", async () => {
    const status = (await clodable(["move", "status"])).result.data;
    expect(status.steps.find((s: Loose) => s.id === "domain")).toMatchObject({ state: "next" });
    const site = new URL(status.site.url).host;
    const waiting = await clodable(["move", "domain", "https://Crumb.app/"]);
    expect(waiting.result.data).toMatchObject({
      name: "crumb.app",
      ready: false,
      records: [
        { type: "A", name: "@", value: "75.2.60.5" },
        { type: "CNAME", name: "www", value: site },
      ],
    });
    expect([...netlify.sites.values()][0]?.custom_domain).toBe("crumb.app");
    expect((await clodable(["move", "domain", "crumb.lovable.app"])).result.error.code).toBe(
      "invalid-config",
    );
    // The builder changed the records at the domain's provider.
    const ready = await clodable(["move", "domain"], undefined, {
      CLODABLE_FAKE_DNS: JSON.stringify({ "crumb.app": { A: ["75.2.60.5"] } }),
    });
    expect(ready.result.data).toMatchObject({ ready: true, url: "https://crumb.app" });
    expect(fake.projects.get(DST)?.auth?.site_url).toBe("https://crumb.app");
    expect(String(fake.projects.get(DST)?.auth?.uri_allow_list)).toContain("https://crumb.app/**");
    const config = JSON.parse(readFileSync(join(sb.work, ".clodable/config.json"), "utf8"));
    expect(config.liveUrl).toBe("https://crumb.app");
    expect(netlify.certificates.size).toBe(1);
  });

  it("finishes once Lovable is done with", async () => {
    const moves = join(config, "moves");
    expect(readdirSync(moves).length).toBeGreaterThan(0);
    expect((await clodable(["move", "finished"])).result.data.exportDeleted).toBe(true);
    // The export, with every person's password hash, is gone from this computer.
    expect(existsSync(moves) ? readdirSync(moves) : []).toEqual([]);
    const status = await clodable(["move", "status"]);
    expect(status.result.data.steps.every((s: Loose) => s.state === "done")).toBe(true);
    expect(status.result.data.switch).toMatchObject({
      frozenAt: expect.any(String),
      liveAt: expect.any(String),
      finishedAt: expect.any(String),
    });
    // Off Lovable, the AI it went on without is said plainly, named as Claude found it.
    const doctor = (await clodable(["doctor"])).result.data;
    expect(doctor.find((i: Loose) => i.id === "lovable-ai")).toMatchObject({
      status: "warn",
      detail: "“Ask the AI” doesn't work: it calls Lovable's AI, which your app no longer has",
    });
    expect(doctor.find((i: Loose) => i.id === "lovable-sync")).toBeUndefined();
  });

  it("never lets a key, a token or a password out", async () => {
    const password = fake.projects.get(DST)?.dbPass ?? "";
    const leaks = [
      TOKEN,
      password,
      SOURCE_KEY,
      "re_test_123",
      `sb_secret_${DST}`,
      NETLIFY,
      "Hello from Netlify",
      "whsec_vault_value",
      "GOCSPX-google-secret-value",
      RESEND,
      ...resend.keys.map((k) => k.token),
    ];
    for (const output of outputs) {
      for (const secret of leaks) expect(output.includes(secret)).toBe(false);
    }
    // Nor into the project: not in move.json, not anywhere.
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.name === ".git" ? [] : e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
      );
    for (const file of walk(sb.work)) {
      const text = readFileSync(file, "utf8");
      for (const secret of leaks) expect(text.includes(secret)).toBe(false);
    }
    expect(existsSync(join(sb.work, ".clodable/local/move.json"))).toBe(true);
  });
});

describe.skipIf(!PG_BIN)("clodable move, in one go", () => {
  let world: World;
  const clodable = (args: string[], input?: string, env?: Record<string, string>) =>
    world.clodable(args, input, env);

  beforeAll(async () => {
    world = await startWorld();
  }, 180_000);

  afterAll(() => stopWorld(world));

  it("goes live from the first export: no pause, its jobs started, sign-in for real people", async () => {
    expect((await clodable(["move", "method", "soon"])).result.error.code).toBe("invalid-config");
    expect((await clodable(["move", "method", "quick"])).result.data).toEqual({ method: "quick" });
    expect((await clodable(["move", "facts", "--set"], JSON.stringify(FACTS))).result.ok).toBe(
      true,
    );
    expect((await clodable(["move", "connect"], TOKEN)).result.ok).toBe(true);
    expect((await clodable(["move", "create", "--org", "acme"])).result.ok).toBe(true);
    expect((await clodable(["move", "export", "--file", world.zip])).result.ok).toBe(true);
    expect((await clodable(["move", "copy"])).result.data.ok).toBe(true);
    // A prototype can go on without what's left of a step: it then counts as done.
    const open = async (id: string) =>
      (await clodable(["move", "status"])).result.data.steps.find((s: Loose) => s.id === id).state;
    expect(await open("copy")).toBe("next");
    expect((await clodable(["move", "vault", "--skip"])).result.data).toEqual({ skipped: "vault" });
    expect(await open("copy")).toBe("done");
    expect((await clodable(["move", "files", "--private"], SOURCE_KEY)).result.ok).toBe(true);
    expect((await clodable(["move", "functions"])).result.ok).toBe(true);
    expect((await clodable(["move", "status"])).result.data.secretsLeft).toEqual([
      "RESEND_API_KEY",
    ]);
    expect((await clodable(["move", "secrets", "--skip"])).result.ok).toBe(true);
    expect(await open("functions")).toBe("done");
    expect((await clodable(["move", "netlify"], NETLIFY)).result.ok).toBe(true);
    const site = (await clodable(["move", "site"])).result.data.site.url as string;
    expect((await clodable(["move", "status"])).result.data.settingsLeft).toEqual(["GREETING"]);
    expect((await clodable(["move", "settings", "--skip"])).result.ok).toBe(true);
    expect(await open("site")).toBe("done");
    expect((await clodable(["move", "emails", "--skip"])).result.ok).toBe(true);
    expect((await clodable(["move", "services", "--skip"])).result.ok).toBe(true);
    expect((await clodable(["move", "google", "--skip"])).result.ok).toBe(true);

    const steps = (await clodable(["move", "status"])).result.data.steps.map((s: Loose) => [
      s.id,
      s.state,
    ]);
    expect(steps.slice(-6)).toEqual([
      ["emails", "done"],
      ["services", "done"],
      ["google", "done"],
      ["golive", "next"],
      ["domain", "later"],
      ["lovable", "later"],
    ]);
    expect(steps.map(([id]: string[]) => id)).not.toContain("freeze");

    // The confirm-email choice doesn't apply without emails: people sign in straight away.
    const live = await clodable(["move", "golive", "--confirm-email", "yes"]);
    expect(live.result.data).toMatchObject({
      url: site,
      confirmEmail: false,
      jobs: { created: 1, check: [] },
    });
    expect(world.fake.projects.get(DST)?.auth).toMatchObject({
      site_url: site,
      mailer_autoconfirm: true,
    });
    // Its scheduled job runs on the new backend, never on the working copy before.
    const jobs = world.pg.psql("dst", "\\pset tuples_only on\nselect command from cron.job;");
    expect(jobs.trim()).toBe(
      `select net.http_post('https://${DST}.supabase.co/functions/v1/send-digest')`,
    );
    expect(readFileSync(join(world.sb.work, "supabase/config.toml"), "utf8")).toContain(
      `project_id = "${DST}"`,
    );
    // Too late to change the way now.
    expect((await clodable(["move", "method", "careful"])).result.error.message).toBe(
      "Your app is live on its new home already.",
    );
  });
});

describe.skipIf(!PG_BIN)("clodable db", () => {
  let world: World;
  const clodable = (args: string[], input?: string, env?: Record<string, string>) =>
    world.clodable(args, input, env);
  const rows = (sql: string) => world.pg.psql("dst", `\\pset tuples_only on\n${sql}`).trim();

  beforeAll(async () => {
    world = await startWorld();
  }, 180_000);

  afterAll(() => stopWorld(world));

  it("reads, changes data and applies migrations on the app's own Supabase, as on Lovable", async () => {
    const configPath = join(world.sb.work, ".clodable/config.json");
    const config = JSON.parse(readFileSync(configPath, "utf8"));
    // On Lovable Cloud, Lovable owns the database.
    writeFileSync(configPath, JSON.stringify({ ...config, backend: "lovable-cloud" }, null, 2));
    expect((await clodable(["db", "query", "select 1"])).result.error.message).toBe(
      "Lovable owns this database: it can't be changed from here.",
    );
    writeFileSync(
      configPath,
      JSON.stringify({ ...config, backend: "supabase", supabase: { projectRef: DST } }, null, 2),
    );
    expect((await clodable(["db", "query", "select 1"])).result.error.code).toBe("supabase-auth");
    expect((await clodable(["move", "connect"], TOKEN)).result.ok).toBe(true);

    // A migration: applied once, in one go, and recorded where Supabase keeps its history.
    await world.sb.write(
      "supabase/migrations/20261011120000_add_notes.sql",
      "create table public.notes (id bigserial primary key, body text not null);\nalter table public.notes enable row level security;\n",
    );
    const applied = await clodable([
      "db",
      "apply",
      "supabase/migrations/20261011120000_add_notes.sql",
    ]);
    expect(applied.result.data).toEqual({
      version: "20261011120000",
      name: "add_notes",
      applied: true,
    });
    expect(rows("select name from supabase_migrations.schema_migrations;")).toBe("add_notes");
    expect(
      (await clodable(["db", "apply", "supabase/migrations/20261011120000_add_notes.sql"])).result
        .data.applied,
    ).toBe(false);
    expect((await clodable(["db", "apply", "src/server/greet.ts"])).result.error.message).toBe(
      "Which migration?",
    );

    // Data: changed with run, read with query.
    expect(
      (await clodable(["db", "run", "insert into public.notes (body) values ('Hello')"])).result.ok,
    ).toBe(true);
    expect(
      (await clodable(["db", "run"], "insert into public.notes (body) values ('It''s me');")).result
        .ok,
    ).toBe(true);
    const read = await clodable(["db", "query", "select body from public.notes order by id"]);
    expect(read.result.data).toEqual({
      rows: [{ body: "Hello" }, { body: "It's me" }],
      truncated: false,
    });

    // Each command does its own job only.
    expect((await clodable(["db", "query", "delete from public.notes"])).result.error.message).toBe(
      "Only a query that reads goes here.",
    );
    const sneaky = await clodable([
      "db",
      "query",
      "with gone as (delete from public.notes returning *) select * from gone",
    ]);
    expect(sneaky.result.ok).toBe(false);
    expect((await clodable(["db", "run", "drop table public.notes"])).result.error.message).toBe(
      "That changes the tables: it goes in a migration.",
    );
    expect(rows("select count(*) from public.notes;")).toBe("2");

    // Supabase's own security advice after a change to the tables.
    world.fake.projects.set(DST, {
      ref: DST,
      name: "crumb",
      region: "eu-west-3",
      organization_slug: "acme",
      status: "ACTIVE_HEALTHY",
      looks: 0,
      storageLimit: 50 * 1024 * 1024,
    });
    world.fake.lints.set(DST, [
      {
        name: "rls_disabled_in_public",
        title: "RLS Disabled in Public",
        level: "ERROR",
        detail: "Table public.drafts is public, but RLS has not been enabled.",
        remediation: "https://supabase.com/docs/guides/database/database-linter",
      },
      { name: "auth_otp_long_expiry", title: "Auth OTP long expiry", level: "INFO" },
    ]);
    const check = await clodable(["db", "check"]);
    expect(check.result.data).toEqual({
      ok: false,
      findings: [
        {
          level: "error",
          title: "RLS Disabled in Public",
          detail: "Table public.drafts is public, but RLS has not been enabled.",
          fix: "https://supabase.com/docs/guides/database/database-linter",
        },
      ],
    });
    world.fake.lints.set(DST, []);
    expect((await clodable(["db", "check"])).result.data).toEqual({ ok: true, findings: [] });
  });
});

describe.skipIf(!PG_BIN)("clodable settings", () => {
  let world: World;
  const clodable = (args: string[], input?: string, env?: Record<string, string>) =>
    world.clodable(args, input, env);

  beforeAll(async () => {
    world = await startWorld();
  }, 180_000);

  afterAll(() => stopWorld(world));

  it("keeps the settings the server code reads on this computer, for the preview, never in the project", async () => {
    expect((await clodable(["settings"])).result.data).toEqual({
      wanted: ["GREETING"],
      local: [],
      lovable: ["LOVABLE_API_KEY"],
    });
    expect(
      (await clodable(["setting", "GREETING"], "Hello from here\n")).result.data.local,
    ).toEqual(["GREETING"]);
    expect((await clodable(["setting", "greeting"], "x")).result.error.code).toBe("invalid-config");
    // The dev server watches the names (never the values) to restart with them.
    const marker = JSON.parse(
      readFileSync(join(world.sb.work, ".clodable/local/settings.json"), "utf8"),
    );
    expect(marker.names).toEqual(["GREETING"]);
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.name === ".git" ? [] : e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
      );
    for (const file of walk(world.sb.work)) {
      expect(readFileSync(file, "utf8").includes("Hello from here")).toBe(false);
    }
    for (const output of world.outputs) expect(output.includes("Hello from here")).toBe(false);
  });

  it("gives the new site the settings already pasted here, so they're never asked twice", async () => {
    expect((await clodable(["move", "connect"], TOKEN)).result.ok).toBe(true);
    expect((await clodable(["move", "create", "--org", "acme"])).result.ok).toBe(true);
    expect((await clodable(["move", "netlify"], NETLIFY)).result.ok).toBe(true);
    const site = await clodable(["move", "site"]);
    expect(site.result.data.settings).toMatchObject({ wanted: ["GREETING"], set: ["GREETING"] });
    const [siteId] = [...world.netlify.sites.keys()];
    expect(world.netlify.env.get(siteId!)!.get("GREETING")).toEqual({
      value: "Hello from here",
      secret: true,
    });
    const status = (await clodable(["move", "status"])).result.data;
    expect(status.settingsLeft).toBeUndefined();
    expect(status.steps.find((s: Loose) => s.id === "site")).toMatchObject({
      state: "done",
      detail: site.result.data.site.url,
    });
  });
});

describe.skipIf(!PG_BIN)("clodable move, Lovable's services", () => {
  let world: World;
  const clodable = (args: string[], input?: string, env?: Record<string, string>) =>
    world.clodable(args, input, env);
  const services = async () =>
    (await clodable(["move", "status"])).result.data.steps.find((s: Loose) => s.id === "services");

  beforeAll(async () => {
    world = await startWorld();
    // An app using Lovable's AI, its email API, a connector, and its own sign-in emails.
    await world.sb.write(
      "supabase/functions/hello/index.ts",
      'import { cors } from "../_shared/cors.ts";\nDeno.serve(() => new Response("hi", { headers: cors }));\n',
    );
    await world.sb.write(
      "src/server/ai.ts",
      // biome-ignore lint/suspicious/noTemplateCurlyInString: the app's own source, a template literal
      'export const ask = (q: string) => fetch("https://ai.gateway.lovable.dev/v1/chat/completions", { method: "POST", headers: { Authorization: `Bearer ${process.env.LOVABLE_API_KEY}` }, body: q });\n',
    );
    await world.sb.write(
      "src/server/slack.ts",
      'export const post = () => fetch("https://connector-gateway.lovable.dev/slack/api/chat.postMessage");\n',
    );
    await world.sb.write(
      "supabase/functions/send-welcome/index.ts",
      'Deno.serve(() => fetch("https://api.lovable.dev/v1/email/send", { headers: { "x-lovable-signature": Deno.env.get("LOVABLE_API_KEY") ?? "" } }));\n',
    );
    await world.sb.write(
      "supabase/functions/auth-email-hook/index.ts",
      'Deno.serve(() => new Response(Deno.env.get("SEND_EMAIL_HOOK_SECRET") ? "ok" : "no"));\n',
    );
  }, 180_000);

  afterAll(() => stopWorld(world));

  it("switches Lovable's AI, emails, sign-in emails and connectors to the builder's own", async () => {
    // What Claude found decides the parts; the scan alone would add the AI code Claude ruled out.
    const facts = {
      ai: [] as Array<{ feature: string }>,
      appEmails: [{ feature: "The welcome email" }],
      connectors: [{ service: "Slack", feature: "New posts, in Slack" }],
    };
    expect((await clodable(["move", "facts", "--set"], JSON.stringify(facts))).result.ok).toBe(
      true,
    );
    expect(await services()).toMatchObject({ detail: "emails · slack" });
    facts.ai = [{ feature: "Ask, on the help page" }];
    expect((await clodable(["move", "facts", "--set"], JSON.stringify(facts))).result.ok).toBe(
      true,
    );
    expect(await services()).toMatchObject({ detail: "AI · emails · slack" });
    expect((await clodable(["move", "connect"], TOKEN)).result.ok).toBe(true);
    expect((await clodable(["move", "create", "--org", "acme"])).result.ok).toBe(true);
    expect((await clodable(["move", "export", "--file", world.zip])).result.ok).toBe(true);
    expect((await clodable(["move", "copy"])).result.data.ok).toBe(true);
    // Lovable's own key is never asked for: its value only exists inside Lovable.
    const deployed = await clodable(["move", "functions"]);
    expect(deployed.result.data.missingSecrets).not.toContain("LOVABLE_API_KEY");
    expect(await services()).toMatchObject({ detail: "AI · emails · slack" });

    // AI: the builder's provider, where the code will read it.
    expect((await clodable(["move", "ai", "nope"], "x".repeat(40))).result.error.code).toBe(
      "invalid-config",
    );
    const ai = await clodable(["move", "ai", "openrouter"], `sk-or-v1-${"a".repeat(40)}\n`);
    expect(ai.result.data).toMatchObject({
      provider: "openrouter",
      url: "https://openrouter.ai/api/v1",
    });
    expect(world.fake.secrets.get(DST)?.get("AI_API_KEY")).toBe(`sk-or-v1-${"a".repeat(40)}`);
    expect((await clodable(["settings"])).result.data.local).toEqual([]);
    // Claude points the code at it (keeping Lovable's as the fallback).
    await world.sb.write(
      "src/server/ai.ts",
      // biome-ignore lint/suspicious/noTemplateCurlyInString: the app's own source, a template literal
      'export const ask = (q: string) => fetch(`${process.env.AI_API_URL ?? "https://ai.gateway.lovable.dev/v1"}/chat/completions`, { method: "POST", headers: { Authorization: `Bearer ${process.env.AI_API_KEY ?? process.env.LOVABLE_API_KEY}` }, body: q });\n',
    );
    expect(await services()).toMatchObject({ detail: "emails · slack" });

    // Emails: the app's own key, from the builder's verified domain.
    expect((await clodable(["move", "app-emails"])).result.error.code).toBe("move-not-ready");
    expect((await clodable(["move", "resend"], RESEND)).result.ok).toBe(true);
    await clodable(["move", "emails", "--domain", "crumb.app"]);
    [...world.resend.domains.values()][0]!.status = "verified";
    expect((await clodable(["move", "emails"])).result.data.connected).toBe(true);
    expect(await services()).toMatchObject({ detail: "emails · sign-in emails · slack" });
    const appEmails = await clodable(["move", "app-emails"]);
    expect(appEmails.result.data).toEqual({ sender: "no-reply@crumb.app", domain: "crumb.app" });
    const appKey = world.resend.keys.at(-1)!;
    expect(appKey).toMatchObject({ permission: "sending_access", domainId: "dom-1" });
    expect(world.fake.secrets.get(DST)?.get("RESEND_API_KEY")).toBe(appKey.token);
    expect(world.fake.secrets.get(DST)?.get("EMAIL_FROM")).toBe("no-reply@crumb.app");
    await world.sb.write(
      "supabase/functions/send-welcome/index.ts",
      // biome-ignore lint/suspicious/noTemplateCurlyInString: the app's own source, a template literal
      'Deno.serve(() => fetch("https://api.resend.com/emails", { headers: { Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}` } }));\n',
    );

    // Sign-in emails through the app's own templates, signed with a secret both sides share.
    await clodable(["move", "functions"]);
    expect((await clodable(["move", "emails", "--hook"])).result.ok).toBe(true);
    const auth = world.fake.projects.get(DST)?.auth ?? {};
    expect(auth).toMatchObject({
      hook_send_email_enabled: true,
      hook_send_email_uri: `${world.fake.projectUrl.replace("{ref}", DST)}/functions/v1/auth-email-hook`,
    });
    expect(String(auth.hook_send_email_secrets)).toMatch(/^v1,whsec_/);
    expect(world.fake.secrets.get(DST)?.get("SEND_EMAIL_HOOK_SECRET")).toBe(
      auth.hook_send_email_secrets,
    );
    expect(await services()).toMatchObject({ detail: "slack" });

    // Connectors: the builder's own key, and the code calls the service itself.
    await world.sb.write(
      "src/server/slack.ts",
      // biome-ignore lint/suspicious/noTemplateCurlyInString: the app's own source, a template literal
      'export const post = () => fetch("https://slack.com/api/chat.postMessage", { headers: { Authorization: `Bearer ${process.env.SLACK_API_KEY}` } });\n',
    );
    expect(await services()).toMatchObject({ state: "done" });
    // No key or token in what the commands printed.
    for (const output of world.outputs) {
      expect(output.includes(appKey.token)).toBe(false);
      expect(output.includes(String(auth.hook_send_email_secrets))).toBe(false);
    }
  });
});
