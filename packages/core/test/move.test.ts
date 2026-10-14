import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type LogEvent, runFlow, type StepEvent } from "../src/index.js";
import { copyValue, readExport, splitNames, tableGrants } from "../src/move/export.js";
import { copyFiles } from "../src/move/files.js";
import { repoint } from "../src/move/fixes.js";
import { NetlifyApi } from "../src/move/netlify-api.js";
import { psqlSql, type Sql } from "../src/move/postgres.js";
import { ResendApi } from "../src/move/resend-api.js";
import { copyExport } from "../src/move/restore.js";
import { MOVE_PERMISSIONS, permissionFor, SupabaseApi } from "../src/move/supabase-api.js";
import { exportTime, freezeSql, madeAfterPause } from "../src/move/switch.js";
import { appTriggerIds, parseToc, planRestore } from "../src/move/toc.js";
import { verifyCopy } from "../src/move/verify.js";
import { extractEntry, zipEntries } from "../src/move/zip.js";
import { appSettings } from "../src/settings.js";
import { startFakeSupabase } from "./fake-supabase.js";
import {
  DST,
  jwt,
  type LocalPostgres,
  makeZip,
  PG_BIN,
  SRC,
  startLocalPostgres,
} from "./move-fixtures.js";

describe("reading Lovable's export", () => {
  it("reads every kind of table-of-contents line", () => {
    const toc = parseToc(
      [
        ";",
        "; Archive created at 2026-10-10 17:13:16 CEST",
        ";     Compression: zstd",
        ";     Dumped from database version: 17.4",
        "6; 2615 16388 SCHEMA - auth supabase_admin",
        "3912; 0 16390 TABLE DATA auth users supabase_auth_admin",
        "3929; 0 0 SEQUENCE SET public posts_id_seq postgres",
        "3928; 0 0 SEQUENCE OWNED BY public posts_id_seq postgres",
        "3759; 2620 16494 TRIGGER auth users on_auth_user_created supabase_auth_admin",
        "3758; 2606 16479 FK CONSTRAINT public posts posts_author_fkey postgres",
        "3910; 3256 16492 POLICY public profiles own profile postgres",
        "3908; 0 16456 ROW SECURITY public profiles postgres",
        "4100; 0 0 COMMENT - EXTENSION pgcrypto ",
        "4101; 0 0 MATERIALIZED VIEW DATA public stats postgres",
        "4102; 1259 17000 MATERIALIZED VIEW public stats postgres",
        ";4103; 0 0 TABLE DATA public commented_out postgres",
      ].join("\n"),
    );
    expect(toc.header).toMatchObject({
      "Archive created at": "2026-10-10 17:13:16 CEST",
      Compression: "zstd",
      "Dumped from database version": "17.4",
    });
    const byId = new Map(toc.entries.map((e) => [e.id, e]));
    expect(toc.entries).toHaveLength(11);
    expect(byId.get(6)).toMatchObject({ type: "SCHEMA", schema: null, tag: "auth" });
    expect(byId.get(3912)).toMatchObject({ type: "TABLE DATA", schema: "auth", tag: "users" });
    expect(byId.get(3928)).toMatchObject({ type: "SEQUENCE OWNED BY", tag: "posts_id_seq" });
    expect(byId.get(3759)).toMatchObject({ type: "TRIGGER", tag: "users on_auth_user_created" });
    expect(byId.get(3758)).toMatchObject({ type: "FK CONSTRAINT", tag: "posts posts_author_fkey" });
    expect(byId.get(3910)).toMatchObject({ type: "POLICY", tag: "profiles own profile" });
    expect(byId.get(3908)).toMatchObject({ type: "ROW SECURITY", tag: "profiles" });
    expect(byId.get(4100)).toMatchObject({ type: "COMMENT", tag: "EXTENSION pgcrypto", owner: "" });
    expect(byId.get(4101)).toMatchObject({ type: "MATERIALIZED VIEW DATA", tag: "stats" });
    expect(byId.get(4102)).toMatchObject({ type: "MATERIALIZED VIEW", tag: "stats" });
  });

  it("plans the copy in passes, leaving Supabase's own parts alone", () => {
    const toc = parseToc(
      [
        "1; 0 0 EXTENSION - citext ",
        "2; 2615 1 SCHEMA - auth postgres",
        "3; 2615 2 SCHEMA - billing postgres",
        "4; 1259 3 TABLE auth users postgres",
        "5; 0 3 TABLE DATA auth users postgres",
        "6; 0 4 TABLE DATA auth identities postgres",
        "7; 0 5 TABLE DATA auth schema_migrations postgres",
        "8; 0 6 TABLE DATA storage buckets postgres",
        "9; 0 7 TABLE DATA storage objects postgres",
        "10; 0 8 TABLE DATA cron job postgres",
        "11; 0 9 TABLE DATA vault secrets postgres",
        "12; 1259 10 TABLE public profiles postgres",
        "13; 0 10 TABLE DATA public profiles postgres",
        "14; 2620 11 TRIGGER auth users on_auth_user_created postgres",
        "15; 2620 12 TRIGGER storage objects update_objects_updated_at postgres",
        "16; 3256 13 POLICY storage objects avatar owner postgres",
        "17; 1259 14 TABLE pgmq q_emails postgres",
        "18; 0 15 SEQUENCE SET auth refresh_tokens_id_seq postgres",
        "19; 1259 16 TABLE billing invoices postgres",
      ].join("\n"),
    );
    const plan = planRestore(toc, new Set([14]));
    expect(plan.extensions.map((e) => e.id)).toEqual([1]);
    expect(plan.queues).toEqual(["emails"]);
    // People first, then what hangs off them, then buckets, then counters.
    expect(plan.managedData.map((e) => e.id)).toEqual([5, 6, 8, 18]);
    expect(plan.app.map((e) => e.id)).toEqual([3, 12, 13, 19]);
    expect(plan.managedExtras.map((e) => e.id)).toEqual([14, 16]);
    expect(plan.leftAside).toMatchObject({
      scheduledJobs: true,
      vaultSecrets: true,
      fileRows: true,
    });
  });

  it("tells the app's triggers on Supabase tables from Supabase's own", () => {
    const toc = parseToc(
      [
        "14; 2620 11 TRIGGER auth users on_auth_user_created postgres",
        "15; 2620 12 TRIGGER storage objects update_objects_updated_at postgres",
      ].join("\n"),
    );
    const sql = `--
-- Name: users on_auth_user_created; Type: TRIGGER; Schema: auth; Owner: -
--

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

--
-- Name: objects update_objects_updated_at; Type: TRIGGER; Schema: storage; Owner: -
--

CREATE TRIGGER update_objects_updated_at BEFORE UPDATE ON storage.objects FOR EACH ROW EXECUTE FUNCTION storage.update_updated_at_column();
`;
    expect([...appTriggerIds(toc.entries, sql)]).toEqual([14]);
  });

  it("reads COPY's text format", () => {
    expect(copyValue("\\N")).toBeNull();
    expect(copyValue("a\\tb\\nc\\\\d")).toBe("a\tb\nc\\d");
    expect(copyValue("\\101\\x42")).toBe("AB");
    expect(splitNames('public."my ""odd"" table"', ".")).toEqual(["public", 'my "odd" table']);
    expect(splitNames('id, "Full name", email', ",")).toEqual(["id", "Full name", "email"]);
  });

  it("reads the API's grants, whatever the tables are called", () => {
    const grants = tableGrants(
      [
        "GRANT SELECT,INSERT ON TABLE public.posts TO authenticated;",
        'GRANT ALL ON TABLE public."my table" TO anon;',
        'GRANT SELECT ON TABLE public."v1.2 notes" TO authenticated;',
        "GRANT ALL ON TABLE public.posts TO postgres;",
      ].join("\n"),
    );
    expect(grants).toEqual({
      "public.posts": { authenticated: ["INSERT", "SELECT"] },
      "public.my table": {
        anon: ["DELETE", "INSERT", "REFERENCES", "SELECT", "TRIGGER", "TRUNCATE", "UPDATE"],
      },
      "public.v1.2 notes": { authenticated: ["SELECT"] },
    });
  });

  it("takes the backup out of a zip, checked", async () => {
    const dir = await mkdtemp(join(tmpdir(), "clodable-zip-"));
    try {
      const data = Buffer.from("PGDMP".repeat(5000));
      await writeFile(
        join(dir, "export.zip"),
        makeZip([
          { name: "readme.txt", data: Buffer.from("hello") },
          { name: "app_261010.backup", data, deflate: true },
        ]),
      );
      const entries = await zipEntries(join(dir, "export.zip"));
      expect(entries.map((e) => e.name)).toEqual(["readme.txt", "app_261010.backup"]);
      await extractEntry(join(dir, "export.zip"), entries[1]!, join(dir, "out.backup"));
      expect((await readFile(join(dir, "out.backup"))).equals(data)).toBe(true);
      // A damaged entry never leaves a file behind.
      const bad = { ...entries[1]!, crc: 1 };
      await expect(
        extractEntry(join(dir, "export.zip"), bad, join(dir, "bad.backup")),
      ).rejects.toThrow(/damaged/);
      expect(existsSync(join(dir, "bad.backup"))).toBe(false);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("points text at the new backend, keys swapped by role", () => {
    const text = `perform net.http_post('https://${SRC}.supabase.co/functions/v1/send', headers := jsonb_build_object('apikey', '${jwt(SRC, "anon")}', 'Authorization', 'Bearer ${jwt(SRC, "service_role")}'), other := '${jwt("otherotherotherother", "anon")}');`;
    const out = repoint(text, SRC, DST, { anon: "NEW_ANON", serviceRole: "NEW_SERVICE" });
    expect(out.leftover).toBe(false);
    expect(out.text).toContain(`https://${DST}.supabase.co/functions/v1/send`);
    expect(out.text).toContain("'apikey', 'NEW_ANON'");
    expect(out.text).toContain("'Bearer NEW_SERVICE'");
    expect(out.text).not.toContain(SRC);
    // Keys of other projects are none of the move's business.
    expect(out.text).toContain(jwt("otherotherotherother", "anon"));
    // No legacy key on the new project: said, not guessed.
    expect(repoint(text, SRC, DST, { anon: "NEW_ANON" }).leftover).toBe(true);
  });
});

describe("the app's own settings", () => {
  it("lists every setting the server code reads, whatever its name", async () => {
    const root = await mkdtemp(join(tmpdir(), "clodable-settings-"));
    try {
      await mkdir(join(root, "src/server"), { recursive: true });
      await writeFile(
        join(root, "src/server/env.ts"),
        [
          'const greeting = process.env["GREETING"];',
          "const ai = process.env.LOVABLE_API_KEY;",
          "const { STRIPE_SECRET_KEY, RESEND_API_KEY: resend, NODE_ENV } = process.env;",
          "const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;",
          "const port = process.env.PORT;",
        ].join("\n"),
      );
      expect(await appSettings(root)).toEqual({
        wanted: ["GREETING", "RESEND_API_KEY", "STRIPE_SECRET_KEY"],
        lovable: ["LOVABLE_API_KEY"],
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("the pause", () => {
  const before = {
    "public.posts": { anon: ["SELECT"], authenticated: ["DELETE", "INSERT", "SELECT", "UPDATE"] },
    "public.notes": { authenticated: ["SELECT"] },
  };

  it("takes away exactly the writes the app's API had, and gives them back", () => {
    const { freeze, undo } = freezeSql(before, true);
    expect(freeze).toContain(
      'revoke delete, insert, update on "public"."posts" from authenticated;',
    );
    expect(freeze).toContain("select cron.alter_job(jobid, active := false) from cron.job;");
    expect(freeze).not.toContain("from anon;");
    // Sign-ups, password and email changes wait too (Auth writes as itself: a revoke can't).
    expect(freeze).toContain(
      "create trigger clodable_pause before insert or update of encrypted_password, email on auth.users",
    );
    // Uploads, where Lovable allows it; a refusal doesn't stop the rest.
    expect(freeze).toContain(
      "revoke insert, update, delete on storage.objects from anon, authenticated;",
    );
    expect(freeze).toContain("exception when others then raise notice 'Uploads stay open: %'");
    expect(undo).toContain('grant delete, insert, update on "public"."posts" to authenticated;');
    expect(undo).toContain("select cron.alter_job(jobid, active := true) from cron.job;");
    expect(undo).toContain("drop trigger if exists clodable_pause on auth.users");
    // Without the export's grants: every table in public.
    expect(freezeSql(undefined, false).freeze).toContain(
      "revoke insert, update, delete on all tables in schema public from anon, authenticated;",
    );
  });

  it("names a table with a dot in it whole", () => {
    const { freeze, undo } = freezeSql(
      { "public.v1.2 notes": { authenticated: ["INSERT"] } },
      true,
    );
    expect(freeze).toContain('revoke insert on "public"."v1.2 notes" from authenticated;');
    expect(undo).toContain('grant insert on "public"."v1.2 notes" to authenticated;');
  });

  it("tells an export made after the pause from one made before", () => {
    const at = "2026-10-11T09:00:00.000Z";
    const paused = { ...before, "public.posts": { anon: ["SELECT"], authenticated: ["SELECT"] } };
    const summary = (grants: object, madeAt?: string) =>
      ({ grants, ...(madeAt ? { madeAt } : {}) }) as never;
    expect(madeAfterPause(summary(paused), before, at)).toBe(true);
    expect(madeAfterPause(summary(before), before, at)).toBe(false);
    // Nothing to tell by in the grants: the export's own time.
    expect(madeAfterPause(summary({}, "2026-10-11 11:05:00 CEST"), {}, at)).toBe(true);
    expect(madeAfterPause(summary({}, "2026-10-10 17:13:16 CEST"), {}, at)).toBe(false);
    expect(madeAfterPause(summary({}, "2026-10-11 11:05:00 XYZ"), {}, at)).toBeUndefined();
    expect(exportTime("2026-10-11 09:05:00 UTC")?.toISOString()).toBe("2026-10-11T09:05:00.000Z");
    expect(exportTime("2026-10-11 09:05:00 +02")?.toISOString()).toBe("2026-10-11T07:05:00.000Z");
  });
});

describe("Supabase's free plan", () => {
  it("is said to be too small before copying, when the app is larger than it holds", async () => {
    const { planLimits } = await import("../src/move/progress.js");
    const summary = (bytes: number, files: number) =>
      ({
        bytes,
        buckets: [{ id: "a", public: true, files: 1, bytes: files, largest: files }],
      }) as never;
    const state = (plan: string, bytes: number, files: number) =>
      ({
        version: 1,
        org: { slug: "acme", name: "Acme", plan },
        export: { file: "x", importedAt: "", summary: summary(bytes, files) },
      }) as never;
    expect(planLimits(state("free", 10 * 1024 ** 2, 200 * 1024 ** 2))).toBeUndefined();
    expect(planLimits(state("free", 10 * 1024 ** 2, 2 * 1024 ** 3))).toMatchObject({
      files: 2 * 1024 ** 3,
      filesLimit: 1024 ** 3,
    });
    // The export is compressed: 200 MB of it is about 600 MB in the database.
    expect(planLimits(state("free", 200 * 1024 ** 2, 0))?.data).toBe(600 * 1024 ** 2);
    expect(planLimits(state("pro", 200 * 1024 ** 2, 2 * 1024 ** 3))).toBeUndefined();
  });
});

describe("a Supabase token that's too narrow", () => {
  it("says which permission each call needs", () => {
    expect(permissionFor("POST", "/v1/projects")).toBe("Organization Projects: Read-write");
    expect(permissionFor("GET", "/v1/projects/abcdefghijklmnopqrst/api-keys?reveal=true")).toBe(
      "API Keys: Read and API Key Secrets: Read",
    );
    expect(permissionFor("POST", "/v1/projects/abcdefghijklmnopqrst/database/query")).toBe(
      "Database: Read-write",
    );
    expect(permissionFor("GET", "/v1/projects/available-regions?organization_slug=acme")).toBe(
      "Organization Projects: Read",
    );
    expect(permissionFor("GET", "/v1/projects/abcdefghijklmnopqrst/health?services=db")).toBe(
      "Project Settings: Read",
    );
    // Every permission the move names is in the list a builder is shown.
    for (const [method, path] of [
      ["GET", "/v1/organizations"],
      ["POST", "/v1/projects"],
      ["GET", "/v1/projects/abcdefghijklmnopqrst/config/database/pooler"],
      ["POST", "/v1/projects/abcdefghijklmnopqrst/functions/deploy?slug=x"],
      ["POST", "/v1/projects/abcdefghijklmnopqrst/secrets"],
      ["PATCH", "/v1/projects/abcdefghijklmnopqrst/config/storage"],
    ] as const) {
      const needed = permissionFor(method, path)!;
      for (const part of needed.split(" and ")) expect(MOVE_PERMISSIONS).toContain(part);
    }
  });

  it("names the missing permission when Supabase refuses", async () => {
    const server = createServer((_req, res) => {
      res.writeHead(403, { "content-type": "application/json" });
      res.end(JSON.stringify({ message: "Forbidden resource" }));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as { port: number };
    try {
      const api = new SupabaseApi("sbp_test", `http://127.0.0.1:${port}`);
      await expect(
        api.createProject({ name: "app", org: "acme", password: "x", region: "eu-central-1" }),
      ).rejects.toMatchObject({
        code: "supabase-auth",
        message:
          "Your Supabase access token is missing a permission: Organization Projects: Read-write.",
      });
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});

describe("Netlify and Resend", () => {
  it("say what went wrong in their own terms, even when the answer isn't JSON", async () => {
    const answers = [
      { status: 200, body: "<html>Maintenance</html>" },
      { status: 401, body: '{"message":"Access Denied"}' },
      { status: 403, body: '{"message":"This API key is restricted to only send emails"}' },
    ];
    const server = createServer((_req, res) => {
      const answer = answers.shift()!;
      res.writeHead(answer.status);
      res.end(answer.body);
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    try {
      await expect(new NetlifyApi("nfp_x", base).user()).rejects.toMatchObject({
        code: "netlify-failed",
        message: "Netlify answered in a way Clodable didn't expect.",
        details: "Netlify answered 200: <html>Maintenance</html>",
      });
      await expect(new NetlifyApi("nfp_x", base).user()).rejects.toMatchObject({
        code: "netlify-auth",
        details: "Netlify answered 401: Access Denied",
      });
      await expect(new ResendApi("re_x", base).domains()).rejects.toMatchObject({
        code: "resend-auth",
        message: "That Resend key can only send emails.",
      });
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});

describe("copying files", () => {
  it("says why a file didn't come over", async () => {
    const fake = await startFakeSupabase({ token: "sbp_test", nextRef: DST, sourceKey: "src" });
    const previous = process.env.CLODABLE_SUPABASE_PROJECT_URL;
    process.env.CLODABLE_SUPABASE_PROJECT_URL = fake.projectUrl;
    const dir = await mkdtemp(join(tmpdir(), "clodable-files-"));
    try {
      fake.publicBuckets.add(`${SRC}/images`);
      fake.files.set(`${SRC}/images/here.png`, { body: Buffer.from("png"), type: "image/png" });
      const listed = (name: string) =>
        JSON.stringify({ bucket: "images", name, size: 3, owner: null, ownerId: null });
      await writeFile(join(dir, "files.jsonl"), `${listed("here.png")}\n${listed("gone.png")}\n`);
      const sql: Sql = { rows: async () => [], run: async () => {} };
      const events: Array<StepEvent | LogEvent> = [];
      const outcome = await runFlow(
        copyFiles({ from: SRC, to: DST, secretKey: `sb_secret_${DST}`, maxBytes: 1024, sql }, dir, [
          { id: "images", public: true },
        ]),
        (event) => events.push(event),
      );
      expect(outcome).toMatchObject({ copied: 1, total: 2, failed: 1 });
      expect(events).toContainEqual({
        type: "log",
        level: "warn",
        message: "images: download answered 404",
      });
    } finally {
      if (previous === undefined) delete process.env.CLODABLE_SUPABASE_PROJECT_URL;
      else process.env.CLODABLE_SUPABASE_PROJECT_URL = previous;
      await fake.close();
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe.skipIf(!PG_BIN)("copying an export into a new backend (local PostgreSQL)", () => {
  let pg: LocalPostgres;
  let dir = "";
  let zip = "";
  let previousHome: string | undefined;
  const target = (db: string) => pg.target(db);

  beforeAll(async () => {
    previousHome = process.env.CLODABLE_POSTGRES_HOME;
    // The local install's pg_restore and psql, unless CLODABLE_TEST_FETCHED_TOOLS asks for the
    // ones the move fetches for builders.
    if (!process.env.CLODABLE_TEST_FETCHED_TOOLS) {
      process.env.CLODABLE_POSTGRES_HOME = dirname(PG_BIN!);
    }
    pg = await startLocalPostgres();
    dir = pg.dir;
    zip = await pg.exportZip();
    await mkdir(join(dir, "move"), { recursive: true });
  }, 120_000);

  afterAll(async () => {
    if (previousHome === undefined) delete process.env.CLODABLE_POSTGRES_HOME;
    else process.env.CLODABLE_POSTGRES_HOME = previousHome;
    await pg?.stop();
  });

  it("reads the export: counts and names, never rows", async () => {
    const work = join(dir, "move");
    const { summary } = await readExport(zip, work);
    expect(summary.rows).toEqual({
      "billing.invoices": 2,
      "public.posts": 3,
      "public.profiles": 3,
      "public.settings": 2,
    });
    expect(summary.people).toEqual({
      total: 3,
      withPassword: 2,
      withoutPassword: 1,
      providers: { email: 2, google: 1 },
      sessions: 1,
    });
    expect(summary.buckets).toEqual([
      { id: "avatars", public: false, files: 1, bytes: 1234, largest: 1234 },
      { id: "public-images", public: true, files: 1, bytes: 99000, largest: 99000 },
    ]);
    expect(summary.scheduledJobs).toEqual(["daily-digest"]);
    expect(summary.vaultSecrets).toEqual(["email_queue_service_role_key", "stripe_webhook_key"]);
    expect(summary.sourceRefs).toEqual([SRC]);
    expect(summary.appTriggers).toHaveLength(1);
    expect(summary.extensions).toEqual(expect.arrayContaining(["citext", "pgcrypto"]));
    expect(summary.appSchemas).toEqual(["billing", "public"]);
    expect(summary.grants["public.posts"]).toEqual({
      anon: ["SELECT"],
      authenticated: ["DELETE", "INSERT", "REFERENCES", "SELECT", "TRIGGER", "TRUNCATE", "UPDATE"],
    });
    // The file list stays in the protected folder.
    const files = (await readFile(join(work, "files.jsonl"), "utf8")).trim().split("\n");
    expect(files.map((l) => JSON.parse(l).bucket)).toEqual(["avatars", "public-images"]);
  });

  it("copies it in passes, fixes the copy, and the checks agree", async () => {
    const work = join(dir, "move");
    const { summary, toc } = await readExport(zip, work);
    const sql: Sql = psqlSql(target("dst"));
    const keys = { anon: jwt(DST, "anon"), serviceRole: jwt(DST, "service_role") };
    const outcome = await runFlow(
      copyExport({ pg: target("dst"), sql, ref: DST, keys }, work, toc, summary, {
        sourceRef: SRC,
        migrationVersions: ["20250101120000", "20250102090000"],
      }),
    );
    expect(outcome.problems).toEqual([]);
    const checks = await verifyCopy(sql, summary, { sourceRef: SRC });
    expect(checks.filter((c) => !c.ok)).toEqual([]);
    expect(checks.map((c) => c.id)).toEqual([
      "tables",
      "people",
      "rules",
      "links",
      "access",
      "counters",
      "old-backend",
      "extensions",
      "files",
    ]);

    // Each person once: the new-user trigger didn't fire for people who already existed.
    const [counts] = await sql.rows<{
      users: number;
      profiles: number;
      jobs: number;
      exports: number;
    }>(
      "select (select count(*)::int from auth.users) as users, (select count(*)::int from public.profiles) as profiles, (select count(*)::int from cron.job) as jobs, (select count(*)::int from storage.buckets where id like 'database_export%') as exports",
    );
    expect(counts).toEqual({ users: 3, profiles: 3, jobs: 0, exports: 0 });
    // The trigger is back for new people, and the app's file rule too.
    const [trigger] = await sql.rows<{ n: number }>(
      "select count(*)::int as n from pg_trigger where tgname = 'on_auth_user_created'",
    );
    expect(trigger?.n).toBe(1);
    const [rule] = await sql.rows<{ n: number }>(
      "select count(*)::int as n from pg_policies where schemaname = 'storage' and policyname = 'avatar owner'",
    );
    expect(rule?.n).toBe(1);
    // Counters past their rows, functions pointed at the new backend, history recorded.
    await sql.run(
      "insert into public.posts (author, title) values ('11111111-1111-1111-1111-111111111111', 'After the move'); insert into auth.refresh_tokens (token) values ('t3');",
    );
    const [digest] = await sql.rows<{ body: string }>("select public.send_digest() as body");
    expect(digest?.body).toContain(`https://${DST}.supabase.co/`);
    expect(digest?.body).toContain(keys.anon);
    expect(digest?.body).not.toContain(SRC);
    const history = await sql.rows<{ version: string }>(
      "select version from supabase_migrations.schema_migrations order by 1",
    );
    expect(history.map((r) => r.version)).toEqual([
      "20250101120000",
      "20250101120003",
      "20250102090000",
    ]);
    const [vault] = await sql.rows<{ secret: string }>(
      "select secret from vault.secrets where name = 'email_queue_service_role_key'",
    );
    expect(vault?.secret).toBe(keys.serviceRole);
  });

  it("copies a newer export over an earlier copy, without doubling anything", async () => {
    const work = join(dir, "move");
    pg.psql("src", "insert into public.settings values ('currency', 'EUR');");
    const newer = await pg.exportZip("newer.zip");
    const { summary, toc } = await readExport(newer, work);
    expect(summary.rows["public.settings"]).toBe(3);
    const sql = psqlSql(target("dst"));
    const outcome = await runFlow(
      copyExport(
        { pg: target("dst"), sql, ref: DST, keys: { anon: jwt(DST, "anon") } },
        work,
        toc,
        summary,
        {
          sourceRef: SRC,
          again: true,
        },
      ),
    );
    expect(outcome.problems).toEqual([]);
    const checks = await verifyCopy(sql, summary, { sourceRef: SRC });
    expect(checks.filter((c) => !c.ok)).toEqual([]);
    const [counts] = await sql.rows<{ users: number; profiles: number; buckets: number }>(
      "select (select count(*)::int from auth.users) as users, (select count(*)::int from public.profiles) as profiles, (select count(*)::int from storage.buckets) as buckets",
    );
    expect(counts).toEqual({ users: 3, profiles: 3, buckets: 2 });
  });

  it("notices what didn't come over", async () => {
    const work = join(dir, "move");
    const { summary } = await readExport(join(dir, "newer.zip"), work);
    const sql = psqlSql(target("dst"));
    await sql.run(
      "delete from public.settings where key = 'lang'; drop policy \"avatar owner\" on storage.objects; drop trigger on_auth_user_created on auth.users; revoke insert on public.posts from authenticated;",
    );
    const checks = await verifyCopy(sql, summary, { sourceRef: SRC });
    const failed = Object.fromEntries(checks.filter((c) => !c.ok).map((c) => [c.id, c.detail]));
    expect(Object.keys(failed)).toEqual(["tables", "rules", "links", "access"]);
    expect(failed.access).toContain("public.posts for authenticated: insert");
    expect(failed.tables).toContain("public.settings: 2 of 3 rows");
    expect(failed.rules).toContain("access rules in storage");
    expect(failed.links).toContain("the app's triggers on sign-ins and files: 0 of 1");
  });
});
