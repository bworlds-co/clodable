import { type Dirent, existsSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import type { ProjectConfig } from "../config.js";
import type { ProjectInfo } from "../project.js";
import type { AppFacts } from "./facts.js";

/**
 * Moving off Lovable: what an app needs, read from its code, so the builder knows up front how big
 * the move is and who does each part. The database export adds sizes and users later.
 */

export interface MoveItem {
  id: string;
  /** What it is, in the builder's words: "13 backend functions". */
  label: string;
  /** Who does it: Clodable on its own, the builder (a few guided clicks), or someone technical. */
  by: "clodable" | "you" | "help";
  /** What happens, in one line. */
  detail: string;
}

export interface MoveAssessment {
  /**
   * "simple": Clodable does nearly everything and the builder clicks a few buttons.
   * "some-steps": a few accounts or settings for the builder, each one guided.
   * "needs-help": a part is best done with someone technical.
   */
  level: "simple" | "some-steps" | "needs-help";
  items: MoveItem[];
  /** Whether Claude has checked the app: then the items come from what it found. */
  checked: boolean;
  /** Anything else Claude found worth knowing, a plain sentence each. */
  notes: string[];
}

/** Secrets every Supabase function gets on its own: nothing for the builder to carry over. */
const BUILT_IN_SECRETS =
  /^(SUPABASE_URL|SUPABASE_ANON_KEY|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_DB_URL|SUPABASE_PUBLISHABLE_KEYS?|SUPABASE_SECRET_KEYS?|SUPABASE_JWKS|LOVABLE_API_KEY)$/;

/** Sign-in providers a builder can set up alone, with a guide. Others need a paid developer account. */
const GUIDED_PROVIDERS = new Set(["google", "github", "azure", "discord", "slack", "twitter"]);

const MAX_FILES = 2000;
const MAX_BYTES = 512 * 1024;

/** Every text file under these folders, bounded, skipping dependencies and builds. */
export async function textFiles(
  root: string,
  dirs: string[],
): Promise<Array<{ path: string; text: string }>> {
  const out: Array<{ path: string; text: string }> = [];
  const walk = async (rel: string): Promise<void> => {
    if (out.length >= MAX_FILES) return;
    const full = join(root, rel);
    let entries: Dirent[];
    try {
      entries = await readdir(full, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (out.length >= MAX_FILES) return;
      if (entry.name === "node_modules" || entry.name === "dist" || entry.name.startsWith("."))
        continue;
      const child = `${rel}/${entry.name}`;
      if (entry.isDirectory()) await walk(child);
      else if (/\.(ts|tsx|js|jsx|mjs|sql|toml|json)$/.test(entry.name)) {
        const info = await stat(join(root, child)).catch(() => undefined);
        if (!info || info.size > MAX_BYTES) continue;
        out.push({ path: child, text: await readFile(join(root, child), "utf8").catch(() => "") });
      }
    }
  };
  for (const dir of dirs) if (existsSync(join(root, dir))) await walk(dir);
  return out;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "A", "A and B", "A, B and C", the first letter capitalised. */
function names(list: string[]): string {
  const text =
    list.length <= 1 ? (list[0] ?? "") : `${list.slice(0, -1).join(", ")} and ${list.at(-1)}`;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * `facts`: what Claude found in the code, once it has looked. Then they decide what the app uses
 * (AI, sign-in, emails, payments…), named as the builder knows them; until then, Clodable's scan.
 */
export async function assessMove(
  project: ProjectInfo,
  config: ProjectConfig,
  facts?: AppFacts,
): Promise<MoveAssessment> {
  const root = project.root;
  const functionsDir = join(root, "supabase", "functions");
  const functions = existsSync(functionsDir)
    ? (await readdir(functionsDir, { withFileTypes: true }))
        .filter((e) => e.isDirectory() && !e.name.startsWith("_") && !e.name.startsWith("."))
        .map((e) => e.name)
    : [];
  const backendFiles = await textFiles(root, ["supabase/functions"]);
  const migrationFiles = await textFiles(root, ["supabase/migrations"]);
  const appFiles = await textFiles(root, ["src"]);
  const any = (files: typeof appFiles, pattern: RegExp) => files.some((f) => pattern.test(f.text));

  const items: MoveItem[] = [];
  if (project.supabase.used || config.backend === "lovable-cloud") {
    items.push({
      id: "database",
      label: "Your data and users",
      by: "clodable",
      detail:
        "Copied from Lovable's export into your own Supabase. Your users keep their accounts.",
    });
  }
  if (functions.length > 0) {
    items.push({
      id: "functions",
      label: plural(functions.length, "backend function"),
      by: "clodable",
      detail: "Moved to your Supabase, all together.",
    });
  }

  const secretNames = new Set<string>();
  for (const file of backendFiles) {
    for (const match of file.text.matchAll(
      /Deno\.env\.get\(\s*["'`]([A-Z][A-Z0-9_]*)["'`]\s*\)/g,
    )) {
      if (!BUILT_IN_SECRETS.test(match[1]!)) secretNames.add(match[1]!);
    }
  }
  if (secretNames.size > 0) {
    items.push({
      id: "secrets",
      label: plural(secretNames.size, "secret key"),
      by: "you",
      detail: `You paste their values into a secure form: ${[...secretNames].sort().join(", ")}.`,
    });
  }
  const ai = facts ? facts.ai.length > 0 : project.lovable.usesLovableAi;
  if (ai) {
    const features = facts?.ai.map((f) => f.feature) ?? [];
    items.push({
      id: "lovable-ai",
      label: features.length === 1 ? "An AI feature" : "AI features",
      by: "you",
      detail: `${features.length > 0 ? `${names(features)}: ${features.length === 1 ? "it runs" : "they run"}` : "They run"} on Lovable's AI. You paste a key of your own (OpenRouter, Google Gemini or OpenAI), and Claude points ${features.length === 1 ? "it" : "them"} at it.`,
    });
  }
  const appEmails = facts
    ? facts.appEmails.length > 0
    : any([...backendFiles, ...appFiles], /api\.lovable\.dev|x-lovable-signature/);
  if (appEmails) {
    const sent = facts?.appEmails.map((f) => f.feature) ?? [];
    items.push({
      id: "emails",
      label: "Emails",
      by: "you",
      detail: `${sent.length > 0 ? `${names(sent)}: sent` : "They're sent"} through Lovable. You connect a free Resend account and add its records to your domain; Clodable gives your app its own key, and Claude switches the sending.`,
    });
  }
  if (facts && facts.connectors.length > 0) {
    const services = [...new Set(facts.connectors.map((c) => c.service))];
    items.push({
      id: "connectors",
      label: `Connected services: ${names(services)}`,
      by: "you",
      detail:
        "They go through Lovable's connectors. You connect your own account for each, and Claude switches the code.",
    });
  }

  const providers = new Set<string>(
    facts
      ? [
          ...(facts.signIn.google ? ["google"] : []),
          ...(facts.signIn.apple ? ["apple"] : []),
          ...facts.signIn.other.map((p) => p.toLowerCase()),
        ]
      : [],
  );
  for (const file of facts ? [] : appFiles) {
    for (const match of file.text.matchAll(
      /signInWithOAuth\(\s*["'`](\w+)["'`]|provider:\s*["'`](\w+)["'`]/g,
    )) {
      const name = (match[1] ?? match[2])!.toLowerCase();
      if (name !== "email" && /^[a-z]+$/.test(name)) providers.add(name);
    }
  }
  if (providers.size > 0) {
    const names = [...providers].sort();
    const hard = names.filter((p) => !GUIDED_PROVIDERS.has(p));
    const title = (p: string) => p.charAt(0).toUpperCase() + p.slice(1);
    items.push({
      id: "sign-in",
      label: `Sign in with ${names.map(title).join(", ")}`,
      by: hard.length > 0 ? "help" : "you",
      detail:
        hard.length > 0
          ? `${hard.map(title).join(", ")} sign-in needs a developer account with that company. Best done with help.`
          : names.includes("google")
            ? "You create a Google sign-in client, following the steps in the panel, and paste its ID and secret."
            : "You create your own sign-in credentials with that company: Claude explains how.",
    });
  }

  if (facts ? facts.scheduledJobs.length > 0 : any(migrationFiles, /cron\.schedule\s*\(/)) {
    items.push({
      id: "scheduled-jobs",
      label: "Scheduled jobs",
      by: "clodable",
      detail: "Moved, and pointed at your new backend.",
    });
  }
  if (
    facts
      ? facts.uploads.length > 0
      : any(migrationFiles, /storage\.buckets/) || any(appFiles, /\.storage\s*\.\s*from\(/)
  ) {
    items.push({
      id: "files",
      label: "Uploaded files",
      by: "clodable",
      detail: "Copied to your Supabase. Their size shows once you've exported your data.",
    });
  }
  const payments = facts
    ? [...new Set(facts.payments.map((p) => p.provider))]
    : any([...backendFiles, ...appFiles], /\bstripe\b/i)
      ? ["Stripe"]
      : [];
  if (payments.length > 0) {
    items.push({
      id: "payments",
      label: `Payments (${names(payments)})`,
      by: "you",
      detail:
        "When you go live, you change your Stripe webhook's address to your new backend: the panel shows it.",
    });
  }
  if (config.hosting === "lovable") {
    items.push({
      id: "hosting",
      label: "Your website",
      by: "you",
      detail:
        "Moves to Netlify (free to start), and your own domain with it. You create the account, Clodable sets it up.",
    });
  }
  if (project.lovable.generated) {
    items.push({
      id: "lovable-sync",
      label: "Lovable's link to your GitHub",
      by: "you",
      detail:
        "At the very end, you turn it off in Lovable, before removing Lovable Cloud: one click.",
    });
  }

  const involved = new Set([
    "secrets",
    "lovable-ai",
    "emails",
    "connectors",
    "sign-in",
    "payments",
  ]);
  const level = items.some((i) => i.by === "help")
    ? "needs-help"
    : items.some((i) => i.by === "you" && involved.has(i.id))
      ? "some-steps"
      : "simple";
  return { level, items, checked: Boolean(facts), notes: facts?.notes ?? [] };
}
