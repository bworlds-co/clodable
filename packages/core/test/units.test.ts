import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { exec } from "../src/exec.js";
import type { Commit } from "../src/index.js";
import {
  ackInbox,
  agentsMd,
  applyKit,
  assessMove,
  checksFailed,
  claimInbox,
  classify,
  cleanSubject,
  detectProject,
  draftBranchFor,
  forgetSecret,
  formatRelative,
  GhCli,
  Git,
  inboxOwner,
  lovableAiLeft,
  mergeManagedBlock,
  ProjectConfigSchema,
  parseGitHubRemote,
  planKit,
  previewCommand,
  publishTitle,
  readInbox,
  readSecret,
  scanStaged,
  scanVersion,
  storeSecret,
  summarizeBuildOutput,
  writeInbox,
} from "../src/index.js";
import { buildLine } from "../src/waits.js";

const commit = (subject: string, kind: Commit["kind"] = "save"): Commit => ({
  sha: subject,
  subject,
  body: "",
  date: "2026-10-10T12:00:00Z",
  author: "Ada",
  kind,
});

describe("words", () => {
  it("turns any request into a clean commit subject", () => {
    expect(cleanSubject("  make the header   blue. ")).toBe("Make the header blue");
    expect(cleanSubject("\n\nfirst line\nsecond")).toBe("First line");
    expect(cleanSubject("x".repeat(100))).toHaveLength(72);
    expect(cleanSubject("")).toBe("Update");
  });

  it("titles a publish from its saves, oldest first", () => {
    expect(publishTitle([commit("Added menu")])).toBe("Added menu");
    expect(publishTitle([commit("Added menu"), commit("Blue header")])).toBe(
      "Blue header; added menu",
    );
    expect(publishTitle([commit("C"), commit("B"), commit("A")])).toBe("A and 2 more changes");
    expect(publishTitle([commit("Sync", "sync")])).toBe("Updated the site");
    // Clodable's own saves, around a restore or a publish, never name it.
    expect(
      publishTitle([
        commit("Last touches before publishing"),
        commit("Added menu"),
        commit("Saved changes before restoring"),
      ]),
    ).toBe("Added menu");
    expect(publishTitle([commit("Saved changes before restoring")])).toBe("Updated the site");
  });

  it("names one draft per GitHub login", () => {
    expect(draftBranchFor("Ada-Lovelace")).toBe("draft/ada-lovelace");
    expect(draftBranchFor("weird_name.x")).toBe("draft/weird-name-x");
  });

  it("reads GitHub remotes in both forms", () => {
    expect(parseGitHubRemote("git@github.com:crumb/site.git")).toEqual({
      owner: "crumb",
      repo: "site",
    });
    expect(parseGitHubRemote("https://github.com/crumb/site")).toEqual({
      owner: "crumb",
      repo: "site",
    });
    expect(parseGitHubRemote("https://gitlab.com/crumb/site")).toBeUndefined();
  });

  it("says time like a person", () => {
    const now = new Date("2026-10-10T15:00:00Z");
    expect(formatRelative("2026-10-10T14:59:50Z", now)).toBe("just now");
    expect(formatRelative("2026-10-10T14:48:00Z", now)).toBe("12 min ago");
  });
});

describe("the inbox, with several conversations open on the app", () => {
  const fix = { kind: "fix", page: { url: "", path: "/" } } as const;
  async function app() {
    const root = await mkdtemp(join(tmpdir(), "clodable-inbox-"));
    await mkdir(join(root, ".clodable/local"), { recursive: true });
    const present = (id: string, alive: number, active: number) =>
      writeFile(
        join(root, `.clodable/local/session-${id}.json`),
        JSON.stringify({ id, alive, active }),
      );
    return { root, present };
  }

  it("goes to the live conversation its person used last, and to only one", async () => {
    const { root, present } = await app();
    try {
      const now = Date.now();
      await present("older", now, now - 60 * 60_000); // still running in the background
      await present("current", now, now - 5_000); // the one the person is using
      await present("closed", now - 60_000, now); // used last, but no longer running
      await present("ancient", now - 3 * 24 * 60 * 60_000, now);
      expect(await inboxOwner(root)).toBe("current");
      expect(existsSync(join(root, ".clodable/local/session-ancient.json"))).toBe(false);

      await writeInbox(root, { ...fix, error: { message: "boom", kind: "runtime" } });
      expect(await claimInbox(root, "older")).toEqual([]);
      const [first, second] = await Promise.all([
        claimInbox(root, "current"),
        claimInbox(root, "current"),
      ]);
      expect([...first, ...second].map((i) => i.kind)).toEqual(["fix"]);
      expect(await readInbox(root)).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("from a labelled preview goes to that pane's conversation while it's open", async () => {
    const { root, present } = await app();
    try {
      const now = Date.now();
      await present("background", now, now - 60 * 60_000);
      await present("current", now, now - 5_000);
      // The person clicked Try to fix in the background conversation's own preview pane.
      await writeInbox(root, {
        ...fix,
        error: { message: "boom", kind: "runtime" },
        conversation: "background",
      });
      expect(await claimInbox(root, "current")).toEqual([]);
      expect(await claimInbox(root, "background")).toEqual([
        expect.objectContaining({ kind: "fix", conversation: "background" }),
      ]);

      // A pane whose conversation has closed: the one used last takes it.
      await writeInbox(root, {
        ...fix,
        error: { message: "boom", kind: "runtime" },
        conversation: "closed",
      });
      expect(await claimInbox(root, "background")).toEqual([]);
      expect(await claimInbox(root, "current")).toHaveLength(1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("goes to whoever asks when no conversation says it's there", async () => {
    const { root } = await app();
    try {
      await writeInbox(root, { ...fix, error: { message: "boom", kind: "runtime" } });
      expect(await claimInbox(root, "anyone")).toHaveLength(1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("secret scanning", () => {
  const jwt = (payload: object) =>
    [
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9",
      Buffer.from(JSON.stringify(payload)).toString("base64url"),
      "c2lnbmF0dXJlLXNpZ25hdHVyZQ",
    ].join(".");
  const found = (RuleID: string, Secret: string) => ({
    RuleID,
    Description: "",
    File: "src/a.ts",
    StartLine: 3,
    Secret,
    Match: `key = "${Secret}"`,
  });
  const live = ["sk", "live", "51NzQx8LkTmV3pR7wYb2Hc9Dj4Fg6Ks1Qa"].join("_");
  const test = ["sk", "test", "51NzQx8LkTmV3pR7wYb2Hc9Dj4Fg6Ks1Qa"].join("_");

  it("blocks Supabase's secret keys, never the public ones every Lovable app ships", () => {
    expect(classify(found("jwt", jwt({ role: "service_role", iss: "supabase" })))).toMatchObject({
      kind: "Supabase service_role key",
      severity: "block",
      file: "src/a.ts",
      line: 3,
    });
    expect(classify(found("jwt", jwt({ role: "anon", iss: "supabase" })))).toBeUndefined();
    expect(
      classify(found("generic-api-key", "sb_publishable_N7xQ2mLp9Kw4Rt8Vb3Hc")),
    ).toBeUndefined();
    expect(classify(found("generic-api-key", "sb_secret_N7xQ2mLp9Kw4Rt8Vb3Hc6Jd1"))).toMatchObject({
      kind: "Supabase secret key",
      severity: "block",
    });
  });

  it("stops live keys, and only notes test keys, guesses and keys made for browsers", () => {
    expect(classify(found("stripe-access-token", live))?.severity).toBe("block");
    expect(classify(found("stripe-access-token", test))).toMatchObject({
      kind: "Stripe test key",
      severity: "warn",
    });
    expect(classify(found("aws-access-token", "AKIAIOSFODNN7EXAMPLE"))?.severity).toBe("block");
    for (const rule of [
      "gcp-api-key",
      "mapbox-api-token",
      "generic-api-key",
      "discord-client-id",
    ]) {
      expect(classify(found(rule, "x".repeat(30)))?.severity).toBe("warn");
    }
  });

  it("never echoes a key", () => {
    expect(classify(found("stripe-access-token", live))!.preview).not.toContain("Hc9Dj4");
  });
});

describe("secret scanning with gitleaks", () => {
  // A key pasted into text ends in punctuation or a tag, not the quote gitleaks' own rules expect.
  it("finds keys pasted into a sentence or between tags, whatever follows them", async () => {
    const root = await mkdtemp(join(tmpdir(), "clodable-gitleaks-text-"));
    try {
      const git = new Git(root);
      await git.ok(["init", "--quiet", "-b", "main"]);
      const stripe = ["sk", "live", "51NzDemoOnlyNotARealKey00"].join("_");
      const jwt = (role: string) =>
        [
          "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9",
          Buffer.from(JSON.stringify({ iss: "supabase", ref: "abcdefghij", role })).toString(
            "base64url",
          ),
          "Mn7Bv2Cx9Zl4Kj8Hg6Fd1Sa3Qw5Er0Ty2Ui7Op4As6D",
        ].join(".");
      await writeFile(
        join(root, "Hero.tsx"),
        [
          "<p>",
          `  Crumb &amp; Co. is the ${stripe}. still baked by hand.`,
          `  <span>${jwt("service_role")}</span>`,
          `  Our public key is ${jwt("anon")}, and that's fine.`,
          "</p>",
          "",
        ].join("\n"),
      );
      await git.ok(["add", "--all"]);
      const found = await scanStaged(root);
      expect(found.map((f) => `${f.kind} ${f.file}:${f.line} ${f.severity}`)).toEqual([
        "Stripe live secret key Hero.tsx:2 block",
        "Supabase service_role key Hero.tsx:3 block",
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  // Real gitleaks: the pinned release, downloaded once and checked.
  it("finds a key in what's about to be saved and in a whole version", async () => {
    const root = await mkdtemp(join(tmpdir(), "clodable-gitleaks-"));
    try {
      const git = new Git(root);
      await git.ok(["init", "--quiet", "-b", "main"]);
      const key = ["sk", "live", "51NzQx8LkTmV3pR7wYb2Hc9Dj4Fg6Ks1Qa"].join("_");
      const anon = [
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9",
        Buffer.from(JSON.stringify({ iss: "supabase", ref: "abcdefghij", role: "anon" })).toString(
          "base64url",
        ),
        "Xq3n9vT1kPz8LmW2rY6sD4fH7jK0bN5cV8xZ1aQ3wE9",
      ].join(".");
      await writeFile(join(root, "client.ts"), `export const key = "${anon}";\n`);
      await writeFile(join(root, "pay.ts"), `// payments\nexport const stripe = "${key}";\n`);
      await git.ok(["add", "--all"]);

      const staged = await scanStaged(root);
      expect(staged).toEqual([
        expect.objectContaining({ file: "pay.ts", line: 2, severity: "block" }),
      ]);

      await git.ok(["-c", "user.name=A", "-c", "user.email=a@b.c", "commit", "-qm", "Keys"]);
      const version = await scanVersion(root, "HEAD");
      expect(version.map((f) => `${f.file}:${f.line}`)).toEqual(["pay.ts:2"]);
      expect(JSON.stringify(version)).not.toContain(key);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("build output", () => {
  it("finds the failing file and line in Vite's output", () => {
    const out = `vite v8.3.4 building for production...\n\u001b[31mx\u001b[0m Build failed in 1.2s\nerror during build:\n[vite:esbuild] Transform failed with 1 error:\nsrc/pages/Pricing.tsx:42:7: ERROR: Unexpected "}"`;
    const { excerpt, location } = summarizeBuildOutput(out);
    expect(location).toEqual({ file: "src/pages/Pricing.tsx", line: 42 });
    expect(excerpt).toContain("Unexpected");
    expect(excerpt).not.toContain("\u001b");
  });

  it("names the file from the project's top, whatever its folder is called", () => {
    const root = "/Users/ada/my-app";
    const out = `error during build:\n${root}/src/components/Hero.tsx:17:3: ERROR: Expected ")"`;
    const { excerpt, location } = summarizeBuildOutput(out, root);
    expect(location).toEqual({ file: "src/components/Hero.tsx", line: 17 });
    expect(excerpt).toContain("src/components/Hero.tsx:17:3");
    expect(excerpt).not.toContain(root);
    // Without the project's folder, a path that isn't the app's own isn't guessed at.
    expect(summarizeBuildOutput(out).location).toBeUndefined();
  });
});

describe("secrets kept on this computer", () => {
  it("live in one file only this user can read, and can be forgotten", async () => {
    const dir = await mkdtemp(join(tmpdir(), "clodable-config-"));
    const before = process.env.CLODABLE_CONFIG_DIR;
    process.env.CLODABLE_CONFIG_DIR = dir;
    try {
      await storeSecret("supabase-token", "sbp_example");
      await storeSecret("db-password:abc", "p4ss");
      expect(await readSecret("supabase-token")).toBe("sbp_example");
      const { mode } = await import("node:fs").then((fs) => fs.statSync(join(dir, "secrets.json")));
      if (process.platform !== "win32") expect(mode & 0o777).toBe(0o600);
      await forgetSecret("supabase-token");
      expect(await readSecret("supabase-token")).toBeUndefined();
      expect(await readSecret("db-password:abc")).toBe("p4ss");
    } finally {
      if (before === undefined) delete process.env.CLODABLE_CONFIG_DIR;
      else process.env.CLODABLE_CONFIG_DIR = before;
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("moving off Lovable", () => {
  async function app(files: Record<string, string>) {
    const root = await mkdtemp(join(tmpdir(), "clodable-move-"));
    for (const [path, content] of Object.entries(files)) {
      await mkdir(join(root, path, ".."), { recursive: true });
      await writeFile(join(root, path), content);
    }
    return root;
  }
  const lovableApp = {
    "package.json": JSON.stringify({
      dependencies: { "@supabase/supabase-js": "2", react: "19", vite: "7" },
      devDependencies: { "lovable-tagger": "1" },
    }),
    "README.md":
      "Built with Lovable.\n\nEdit it in the [Lovable editor](https://lovable.dev/projects/e1a96225-0edb-4967-ae0f-256c871f673e).\nLive: https://crumb-and-co.lovable.app\n",
  };

  it("finds the Lovable project and its address in the README", async () => {
    const root = await app(lovableApp);
    try {
      const project = await detectProject(root);
      expect(project.lovable).toMatchObject({
        generated: true,
        projectUrl: "https://lovable.dev/projects/e1a96225-0edb-4967-ae0f-256c871f673e",
        appUrl: "https://crumb-and-co.lovable.app",
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("says what the move involves and who does each part, from the code", async () => {
    const root = await app({
      ...lovableApp,
      "supabase/functions/_shared/mail.ts": 'fetch("https://api.lovable.dev/email/send");',
      "supabase/functions/send-invite/index.ts":
        'Deno.env.get("RESEND_API_KEY"); Deno.env.get("SUPABASE_URL"); Deno.env.get("LOVABLE_API_KEY");',
      "supabase/functions/stripe-webhook/index.ts":
        'import Stripe from "stripe"; Deno.env.get("STRIPE_SECRET_KEY");',
      "supabase/migrations/1_jobs.sql":
        "select cron.schedule('nightly', '0 3 * * *', $$select 1$$);",
      "supabase/migrations/2_files.sql": "insert into storage.buckets (id) values ('photos');",
      "src/pages/Login.tsx":
        'supabase.auth.signInWithOAuth({ provider: "google" }); supabase.auth.signInWithOAuth({ provider: "apple" });',
      "src/ai.ts": "const url = 'https://ai.gateway.lovable.dev/v1/chat';",
    });
    try {
      const project = await detectProject(root);
      const config = ProjectConfigSchema.parse({ backend: "lovable-cloud", hosting: "lovable" });
      const { level, items } = await assessMove(project, config);
      const by = Object.fromEntries(items.map((i) => [i.id, i.by]));
      expect(by).toEqual({
        database: "clodable",
        functions: "clodable",
        secrets: "you",
        "lovable-ai": "you",
        emails: "you",
        "sign-in": "help",
        "scheduled-jobs": "clodable",
        files: "clodable",
        payments: "you",
        hosting: "you",
        "lovable-sync": "you",
      });
      expect(items.find((i) => i.id === "functions")?.label).toBe("2 backend functions");
      // Built-in secrets aren't listed: only what the builder must carry over.
      expect(items.find((i) => i.id === "secrets")?.detail).toContain(
        "RESEND_API_KEY, STRIPE_SECRET_KEY.",
      );
      expect(items.find((i) => i.id === "sign-in")?.label).toBe("Sign in with Apple, Google");
      expect(level).toBe("needs-help");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("sees Lovable's AI from its gateway or TanStack AI's adapter, not from the key alone", async () => {
    const uses = async (files: Record<string, string>) => {
      const root = await app({ ...lovableApp, ...files });
      try {
        return (await detectProject(root)).lovable.usesLovableAi;
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    };
    expect(
      await uses({
        "src/lib/summarize.ts":
          'import { lovableText } from "@tanstack/ai-lovable";\nexport const model = lovableText("google/gemini-2.5-flash");',
      }),
    ).toBe(true);
    expect(
      await uses({
        "server/ai.ts": "fetch('https://ai.gateway.lovable.dev/v1/chat/completions');",
      }),
    ).toBe(true);
    // Lovable's connectors and email API read the same key: no AI there.
    expect(
      await uses({
        "supabase/functions/post/index.ts":
          'fetch("https://connector-gateway.lovable.dev/slack/api/chat.postMessage", { headers: { Authorization: Deno.env.get("LOVABLE_API_KEY") } });',
        "supabase/functions/mail/index.ts":
          'fetch("https://api.lovable.dev/v1/email/send", { headers: { "x-lovable-signature": Deno.env.get("LOVABLE_API_KEY") } });',
      }),
    ).toBe(false);
  });

  it("knows when Lovable's AI is still called without a key of the builder's own", async () => {
    const gateway = "fetch('https://ai.gateway.lovable.dev/v1/responses');";
    const facts = (ai: string[]) =>
      JSON.stringify({
        version: 1,
        facts: { ai: ai.map((feature) => ({ feature })), at: "2026-10-12" },
      });
    const left = async (files: Record<string, string>) => {
      const root = await app({ ...lovableApp, ...files });
      try {
        return await lovableAiLeft(root);
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    };
    expect(await left({ "src/ai.ts": gateway })).toEqual({ features: [] });
    // Claude's facts name it, and decide: code it ruled out doesn't count.
    expect(
      await left({ "src/ai.ts": gateway, ".clodable/local/move.json": facts(["Summarize"]) }),
    ).toEqual({ features: ["Summarize"] });
    expect(
      await left({ "src/ai.ts": gateway, ".clodable/local/move.json": facts([]) }),
    ).toBeUndefined();
    // Switched: the code reads the builder's key (Lovable's stays as the fallback).
    expect(
      await left({ "src/ai.ts": `${gateway}\nconst key = process.env.AI_API_KEY;` }),
    ).toBeUndefined();
  });

  it("calls a plain app on Lovable Cloud a simple move", async () => {
    const root = await app(lovableApp);
    try {
      const project = await detectProject(root);
      const { level } = await assessMove(
        project,
        ProjectConfigSchema.parse({ backend: "lovable-cloud", hosting: "github" }),
      );
      expect(level).toBe("simple");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("counts only named sign-in providers, not a variable passed along", async () => {
    // Lovable's own sign-in helper passes the provider through; the page names it.
    const root = await app({
      ...lovableApp,
      "src/integrations/lovable/index.ts":
        "export const signIn = (provider) => lovableAuth.signInWithOAuth(provider, { redirect_uri });\n",
      "src/routes/auth.tsx":
        'const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: location.origin });\n',
    });
    try {
      const { level, items } = await assessMove(
        await detectProject(root),
        ProjectConfigSchema.parse({ backend: "lovable-cloud", hosting: "github" }),
      );
      expect(items.find((i) => i.id === "sign-in")).toMatchObject({
        label: "Sign in with Google",
        by: "you",
      });
      expect(level).toBe("some-steps");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("tells Claude the database can't be changed from here on Lovable Cloud", () => {
    const base = { appName: "Crumb", appType: "vite-spa", liveBranch: "main" } as const;
    const own = agentsMd({ ...base, supabaseRef: "abcdefghijklmnopqrst", backend: "supabase" });
    const cloud = agentsMd({
      ...base,
      supabaseRef: "abcdefghijklmnopqrst",
      backend: "lovable-cloud",
      hosting: "lovable",
    });
    expect(own).toContain("Before any database change");
    expect(own).not.toContain("${");
    expect(cloud).toContain("## Database and backend: on Lovable Cloud");
    expect(cloud).not.toContain("Before any database change");
    expect(cloud).toContain("click **Publish → Publish changes** in Lovable");
    expect(cloud).not.toContain("${");
  });

  it("doesn't connect Claude to a Supabase project Lovable owns", async () => {
    const root = await app({
      ...lovableApp,
      "src/integrations/supabase/client.ts":
        'const SUPABASE_URL = "https://abcdefghijklmnopqrst.supabase.co";',
      ".mcp.json": JSON.stringify({
        mcpServers: {
          supabase: { type: "http", url: "https://mcp.supabase.com/mcp?project_ref=abc" },
          other: { type: "http", url: "https://example.com/mcp" },
        },
      }),
    });
    try {
      const project = await detectProject(root);
      const changes = await planKit(
        project,
        ProjectConfigSchema.parse({ backend: "lovable-cloud" }),
      );
      const mcp = JSON.parse(changes.find((c) => c.path === ".mcp.json")!.content);
      expect(Object.keys(mcp.mcpServers)).toEqual(["other"]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("repo kit", () => {
  it("merges the managed AGENTS.md block without touching the owner's text", () => {
    const generated = "# Title\n<!-- clodable:begin x -->\nNEW\n<!-- clodable:end -->\n";
    expect(mergeManagedBlock(undefined, generated)).toBe(generated);
    expect(mergeManagedBlock("# Mine\nkeep me\n", generated)).toBe(
      "# Mine\nkeep me\n\n## Working with Clodable\n\n<!-- clodable:begin x -->\nNEW\n<!-- clodable:end -->\n",
    );
    expect(
      mergeManagedBlock(
        "# Mine\n<!-- clodable:begin old -->\nOLD\n<!-- clodable:end -->\nafter\n",
        generated,
      ),
    ).toBe("# Mine\n<!-- clodable:begin x -->\nNEW\n<!-- clodable:end -->\nafter\n");
  });

  it("plans and applies the kit on a Lovable-style project, merging existing settings", async () => {
    const root = await mkdtemp(join(tmpdir(), "clodable-kit-"));
    try {
      await writeFile(
        join(root, "package.json"),
        JSON.stringify({
          name: "crumb",
          scripts: { dev: "vite", build: "vite build" },
          dependencies: { react: "^18", "@supabase/supabase-js": "^2" },
          devDependencies: { vite: "^5", "lovable-tagger": "^1" },
        }),
      );
      await writeFile(join(root, "package-lock.json"), "{}");
      const { mkdir } = await import("node:fs/promises");
      await mkdir(join(root, "src/integrations/supabase"), { recursive: true });
      await writeFile(
        join(root, "src/integrations/supabase/client.ts"),
        'const SUPABASE_URL = "https://abcdefghijklmnopqrst.supabase.co";',
      );
      await mkdir(join(root, ".claude"), { recursive: true });
      await writeFile(
        join(root, ".claude/settings.json"),
        JSON.stringify({ model: "opus", permissions: { allow: ["Bash(ls)"] } }),
      );

      const project = await detectProject(root);
      expect(project).toMatchObject({ appType: "vite-spa", packageManager: "npm" });
      expect(project.lovable.generated).toBe(true);
      expect(project.supabase.projectRef).toBe("abcdefghijklmnopqrst");

      const changes = await planKit(project, ProjectConfigSchema.parse({}));
      const paths = changes.map((c) => c.path);
      expect(paths).toEqual([
        "AGENTS.md",
        "CLAUDE.md",
        ".claude/launch.json",
        ".claude/settings.json",
        ".mcp.json",
        ".clodable/config.json",
        ".gitignore",
      ]);
      await applyKit(root, changes);

      const settings = JSON.parse(await readFile(join(root, ".claude/settings.json"), "utf8"));
      expect(settings.model).toBe("opus");
      expect(settings.permissions.allow).toContain("Bash(ls)");
      expect(settings.permissions.deny).toContain("Bash(git push:*)");
      expect(settings.enabledPlugins["clodable@clodable"]).toBe(true);
      // From the public marketplace, kept up to date on its own.
      expect(settings.extraKnownMarketplaces.clodable).toEqual({
        source: { source: "github", repo: "bworlds-co/clodable" },
        autoUpdate: true,
      });

      const launch = JSON.parse(await readFile(join(root, ".claude/launch.json"), "utf8"));
      expect(launch.configurations[0]).toMatchObject({
        runtimeExecutable: previewCommand().executable,
        runtimeArgs: previewCommand().args,
        port: 8080,
        autoPort: true,
      });

      const mcp = JSON.parse(await readFile(join(root, ".mcp.json"), "utf8"));
      expect(mcp.mcpServers.supabase.url).toContain("project_ref=abcdefghijklmnopqrst");

      expect(await readFile(join(root, "CLAUDE.md"), "utf8")).toBe("@AGENTS.md\n");
      expect(await readFile(join(root, "AGENTS.md"), "utf8")).toContain("live data");

      // Running it again changes nothing.
      const again = await planKit(
        await detectProject(root),
        ProjectConfigSchema.parse(
          JSON.parse(await readFile(join(root, ".clodable/config.json"), "utf8")),
        ),
      );
      expect(again.filter((c) => c.action !== "unchanged").map((c) => c.path)).toEqual([]);

      // A preview that runs Clodable from a folder (a demo, a test) keeps doing so when the kit is
      // planned again, as answering a question does. Anything else in its place is Clodable's again.
      const local = ["/work/clodable/packages/cli/dist/clodable.mjs", "dev"];
      const keep = async (runtimeExecutable: string, runtimeArgs: string[]) => {
        await writeFile(
          join(root, ".claude/launch.json"),
          JSON.stringify({ configurations: [{ name: "app", runtimeExecutable, runtimeArgs }] }),
        );
        await applyKit(
          root,
          await planKit(await detectProject(root), ProjectConfigSchema.parse({})),
        );
        return JSON.parse(await readFile(join(root, ".claude/launch.json"), "utf8"))
          .configurations[0];
      };
      expect(await keep("node", local)).toMatchObject({
        runtimeExecutable: "node",
        runtimeArgs: local,
      });
      expect(await keep("vite", ["--port", "8080"])).toMatchObject({
        runtimeExecutable: previewCommand().executable,
        runtimeArgs: previewCommand().args,
      });
      // The plain command of earlier versions becomes today's, which finds Clodable's own Node.js.
      expect(await keep("npx", ["clodable", "dev"])).toMatchObject({
        runtimeExecutable: previewCommand().executable,
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("starts the preview through sh on macOS and Linux, with Clodable's tools after the builder's", async () => {
    expect(previewCommand("win32")).toEqual({ executable: "npx", args: ["clodable", "dev"] });
    const mac = previewCommand("darwin");
    expect(mac.executable).toBe("/bin/sh");
    const dir = await mkdtemp(join(tmpdir(), "clodable-path-"));
    try {
      // The command really finds a tool in Clodable's bin folder, when nothing else has it.
      const bin = join(dir, "Library/Caches/clodable/bin");
      await mkdir(bin, { recursive: true });
      await writeFile(join(bin, "npx"), '#!/bin/sh\necho "npx $*"\n', { mode: 0o755 });
      const run = spawnSync(mac.executable, mac.args, {
        env: { HOME: dir, PATH: "/usr/bin:/bin" },
        encoding: "utf8",
      });
      expect(run.stdout.trim()).toBe("npx clodable dev");
      // The builder's own tools come first.
      const own = join(dir, "own");
      await mkdir(own, { recursive: true });
      await writeFile(join(own, "npx"), '#!/bin/sh\necho "own npx"\n', { mode: 0o755 });
      const first = spawnSync(mac.executable, mac.args, {
        env: { HOME: dir, PATH: `${own}:/usr/bin:/bin` },
        encoding: "utf8",
      });
      expect(first.stdout.trim()).toBe("own npx");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("inbox", () => {
  it("queues items in order and forgets acknowledged ones", async () => {
    const root = await mkdtemp(join(tmpdir(), "clodable-inbox-"));
    try {
      const page = { url: "http://localhost:8080/menu", path: "/menu" };
      const fix = await writeInbox(root, {
        kind: "fix",
        page,
        error: { message: "x is undefined", kind: "runtime" },
      });
      await writeInbox(root, { kind: "ask", page, request: "make this bigger" });
      expect((await readInbox(root)).map((i) => i.kind)).toEqual(["ask", "fix"].sort());
      await ackInbox(root, fix.id);
      expect((await readInbox(root)).map((i) => i.kind)).toEqual(["ask"]);
      await ackInbox(root, "../../etc/passwd");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("the line Publish shows while the host builds", () => {
  it("names the build's step in plain words, with the time so far and the usual time", () => {
    const at = (step: string) => buildLine({ step, lastSeconds: 95 }, 70_000).split(" · ")[0];
    expect(at("Set up job")).toBe("Getting ready");
    expect(at("Run actions/checkout@v5")).toBe("Getting ready");
    expect(at("Tell GitHub a deployment started")).toBe("Getting ready");
    expect(at("Install the app's packages")).toBe("Installing your app's packages");
    expect(at("Build and put it live on Netlify")).toBe("Building your site");
    expect(at("Tell GitHub it's live")).toBe("Finishing");
    expect(at("Post Run actions/checkout@v5")).toBe("Finishing");
    expect(buildLine({ step: "Build and put it live on Netlify", lastSeconds: 95 }, 70_000)).toBe(
      "Building your site · 1 min so far · usually about 2 min",
    );
    // The first build has no usual time yet; a queued one hasn't started a step.
    expect(buildLine({ step: "Install the app's packages" }, 10_000)).toBe(
      "Installing your app's packages · under a minute so far · the first one takes a few minutes",
    );
    expect(buildLine({}, 10_000)).toBe(
      "Waiting for GitHub to start the build · under a minute so far · the first one takes a few minutes",
    );
    // A host that builds outside GitHub: only how long so far.
    expect(buildLine(undefined, 130_000)).toBe("Your host is building it · 2 min so far");
  });
});

describe("settings", () => {
  it("fill in every default, a section at a time", () => {
    expect(ProjectConfigSchema.parse({})).toEqual({
      version: 1,
      liveBranch: "main",
      app: { type: "unknown", buildScript: "build" },
      supabase: {},
      backend: "unknown",
      hosting: "unknown",
      checks: { build: true, packages: true, secrets: true },
      publish: { waitForCi: true, ciTimeoutMinutes: 20, deployTimeoutMinutes: 10 },
    });
    expect(ProjectConfigSchema.parse({ checks: { build: false } }).checks).toEqual({
      build: false,
      packages: true,
      secrets: true,
    });
  });
});

describe("failed checks", () => {
  it("say what failed first, keep everything for developers, and name the files", () => {
    const error = checksFailed(
      [
        {
          id: "build",
          status: "failed",
          summary: "Your app doesn't build",
          details: "src/App.tsx:4 error: Cannot find name 'Hero'",
          locations: [{ file: "src/App.tsx", line: 4 }],
        },
        {
          id: "secrets",
          status: "failed",
          summary: "A secret key is in your code",
          locations: [{ file: "src/lib/stripe.ts" }],
        },
      ],
      "Ask Claude to fix it.",
    );
    expect(error.toJSON()).toEqual({
      code: "checks-failed",
      message: "Your app doesn't build",
      hint: "Ask Claude to fix it.",
      details:
        "Your app doesn't build\nsrc/App.tsx:4 error: Cannot find name 'Hero'\n\nA secret key is in your code",
      files: ["src/App.tsx:4", "src/lib/stripe.ts"],
    });
  });
});

describe("running a program", () => {
  it("gives its exit code when it stops before reading its input", async () => {
    // More than a pipe holds, so the write fails once the program is gone (EPIPE).
    const result = await exec("sh", ["-c", "exit 3"], {
      cwd: tmpdir(),
      input: "x".repeat(4 * 1024 * 1024),
    });
    expect(result.exitCode).toBe(3);
  });
});

describe("GitHub through gh", () => {
  // A stand-in `gh` on the PATH: it answers `repo view`, and fails everything else the way
  // FAKE_GH says, in gh's own words (as gh 2.87 prints them).
  const script = [
    "#!/bin/sh",
    'if [ "$1 $2" = "repo view" ]; then',
    `  echo '{"name":"app","owner":{"login":"ada"},"url":"u","isPrivate":true,"defaultBranchRef":{"name":"main"}}'`,
    "  exit 0",
    "fi",
    'case "$FAKE_GH" in',
    '  signed-out) echo "To get started with GitHub CLI, please run:  gh auth login" >&2; exit 4 ;;',
    "  offline) printf 'error connecting to api.github.com\\ncheck your internet connection\\n' >&2; exit 1 ;;",
    '  refused) echo "HTTP 403: Resource not accessible by integration" >&2; exit 1 ;;',
    `  missing) echo "GraphQL: Could not resolve to a Repository with the name 'ada/network-app'. (repository)" >&2; exit 1 ;;`,
    `  no-host) echo "fatal: unable to access 'https://github.com/ada/app.git/': Could not resolve host: github.com" >&2; exit 128 ;;`,
    "esac",
    "",
  ].join("\n");
  const withGh = async (mode: string, run: (gh: GhCli) => Promise<unknown>) => {
    const dir = await mkdtemp(join(tmpdir(), "clodable-gh-"));
    await writeFile(join(dir, "gh"), script, { mode: 0o755 });
    const before = { path: process.env.PATH, mode: process.env.FAKE_GH };
    process.env.PATH = `${dir}:${process.env.PATH}`;
    process.env.FAKE_GH = mode;
    try {
      return await run(new GhCli(dir));
    } finally {
      process.env.PATH = before.path;
      if (before.mode === undefined) delete process.env.FAKE_GH;
      else process.env.FAKE_GH = before.mode;
      await rm(dir, { recursive: true, force: true });
    }
  };

  it("says when GitHub isn't connected, or can't be reached, whatever the call", async () => {
    for (const call of [
      (gh: GhCli) => gh.viewer(),
      (gh: GhCli) => gh.checks(7),
      (gh: GhCli) => gh.setSecret("NETLIFY_AUTH_TOKEN", "nfp_x"),
    ]) {
      await expect(withGh("signed-out", call)).rejects.toMatchObject({ code: "gh-auth" });
      await expect(withGh("offline", call)).rejects.toMatchObject({
        code: "offline",
        message: "GitHub can't be reached right now.",
      });
    }
  });

  it("keeps each call's own words for anything else", async () => {
    await expect(withGh("refused", (gh) => gh.setSecret("X", "y"))).rejects.toMatchObject({
      code: "unknown",
      message: "GitHub didn't accept the X secret your site needs to publish.",
    });
    await expect(withGh("refused", (gh) => gh.viewer())).rejects.toMatchObject({
      code: "unknown",
      message: "GitHub didn't accept a request.",
    });
  });

  it("tells a repository GitHub doesn't have from a network that's down", async () => {
    // Setup clones with git over HTTPS (signed in through gh): git's own words, per mode.
    const git = [
      "#!/bin/sh",
      'case "$FAKE_GH" in',
      `  missing) printf "remote: Repository not found.\nfatal: repository 'https://github.com/ada/network-app.git/' not found\n" >&2; exit 128 ;;`,
      `  no-host) echo "fatal: unable to access 'https://github.com/ada/network-app.git/': Could not resolve host: github.com" >&2; exit 128 ;;`,
      `  offline) echo "fatal: unable to access 'https://github.com/ada/network-app.git/': Failed to connect to github.com port 443" >&2; exit 128 ;;`,
      "esac",
      "",
    ].join("\n");
    const clone = async (gh: GhCli) => {
      await writeFile(join(gh.cwd, "git"), git, { mode: 0o755 });
      return gh.clone("ada/network-app", join(tmpdir(), "clodable-none"));
    };
    await expect(withGh("missing", clone)).rejects.toMatchObject({ code: "unknown" });
    await expect(withGh("no-host", clone)).rejects.toMatchObject({ code: "offline" });
    await expect(withGh("offline", clone)).rejects.toMatchObject({ code: "offline" });
  });
});

describe("a migration's new tables", () => {
  it("are the ones it creates in the app's own schema, so the API is waited for", async () => {
    const { newTables } = await import("../src/database.js");
    expect(
      newTables(
        'create table public.notes (id int);\nCREATE TABLE IF NOT EXISTS "orders" (id int);\ncreate table private.audit (id int);\nalter table notes add column x int;',
      ),
    ).toEqual(["notes", "orders"]);
  });
});
