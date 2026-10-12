import { z } from "zod";
import { ClodableError } from "../errors.js";
import { CODE_DIRS, LOVABLE_AI } from "../project.js";
import type { Workspace } from "../workspace.js";
import { textFiles } from "./assess.js";
import { localFunctions } from "./functions.js";
import { appSettings } from "./site.js";
import { loadMove, updateMove } from "./state.js";

/**
 * What the app uses, as Claude found it in its code: its AI features, how people sign in, the
 * emails it sends itself, its connected services, payments, scheduled jobs and uploads, each named
 * the way the builder knows it. Claude checks them first, before the move starts: `move facts`
 * hands it Clodable's own scan as hints, Claude reads the code to confirm each, and `move facts
 * --set` records what it found. The facts decide which steps the move has; the scan still says
 * when a switch is done (the code reads the builder's own key), which it can tell exactly.
 */

const feature = z.object({
  /** In the builder's words: "Summarize, on each note". */
  feature: z.string().trim().min(1).max(200),
  /** Where in the code, for Claude's later turns: "src/lib/app.functions.ts". */
  where: z.string().trim().max(300).optional(),
});

export const AppFactsSchema = z
  .object({
    /** Features calling Lovable's AI. */
    ai: z.array(feature).max(30).default([]),
    /** How people sign in. */
    signIn: z
      .object({
        email: z.boolean().default(false),
        google: z.boolean().default(false),
        apple: z.boolean().default(false),
        /** Any other provider, by name: "GitHub". */
        other: z.array(z.string().trim().min(1).max(60)).max(10).default([]),
      })
      .strict()
      .default({ email: false, google: false, apple: false, other: [] }),
    /** Emails the app sends itself through Lovable (a welcome, a notification), not sign-in ones. */
    appEmails: z.array(feature).max(30).default([]),
    /** Services reached through Lovable's connectors: "Slack". */
    connectors: z
      .array(feature.extend({ service: z.string().trim().min(1).max(60) }))
      .max(30)
      .default([]),
    /** Payments: "Stripe". */
    payments: z
      .array(feature.extend({ provider: z.string().trim().min(1).max(60) }))
      .max(10)
      .default([]),
    /** Scheduled jobs: what they do. */
    scheduledJobs: z.array(feature).max(30).default([]),
    /** What people upload. */
    uploads: z.array(feature).max(30).default([]),
    /** Anything else the builder should know before moving, in a plain sentence each. */
    notes: z.array(z.string().trim().min(1).max(300)).max(20).default([]),
  })
  .strict();

export type AppFacts = z.infer<typeof AppFactsSchema>;
export type RecordedFacts = AppFacts & { at: string };

/** Where Clodable's scan sees each thing: Claude's starting points, never the last word. */
export interface FactsHints {
  /** Files calling Lovable's AI (its gateway, or TanStack AI's Lovable adapter). */
  ai: string[];
  /** Sign-in providers named in the code; `lovableBroker`: Lovable's own sign-in helper. */
  signIn: { password: boolean; providers: string[]; lovableBroker: boolean };
  /** Files sending emails through Lovable's email API. */
  appEmails: string[];
  /** Services named in calls to Lovable's connector gateway, and where. */
  connectors: Array<{ service: string; files: string[] }>;
  /** Files naming Stripe or Paddle. */
  payments: string[];
  /** Migrations scheduling jobs, and code checking Lovable's cron key. */
  scheduledJobs: string[];
  /** Files uploading to storage, or migrations making buckets. */
  uploads: string[];
  /** Backend functions (supabase/functions). */
  functions: string[];
  /** Settings the server code reads; Lovable's own aside. */
  settings: { wanted: string[]; lovable: string[] };
}

export async function factsHints(ws: Workspace): Promise<FactsHints> {
  const code = await textFiles(ws.root, CODE_DIRS);
  const migrations = await textFiles(ws.root, ["supabase/migrations"]);
  const where = (files: typeof code, pattern: RegExp) =>
    files.filter((f) => pattern.test(f.text)).map((f) => f.path.replace(/^\//, ""));
  const providers = new Set<string>();
  for (const f of code) {
    for (const m of f.text.matchAll(
      /signInWithOAuth\(\s*(?:\{[^}]*?provider:\s*)?["'`](\w+)["'`]|provider:\s*["'`](\w+)["'`]/g,
    )) {
      const name = (m[1] ?? m[2])!.toLowerCase();
      if (name !== "email" && /^[a-z]+$/.test(name)) providers.add(name);
    }
  }
  const connectors = new Map<string, Set<string>>();
  for (const f of code) {
    for (const m of f.text.matchAll(/connector-gateway\.lovable\.dev\/([a-z0-9_-]+)/gi)) {
      const service = m[1]!.toLowerCase();
      connectors.set(
        service,
        (connectors.get(service) ?? new Set()).add(f.path.replace(/^\//, "")),
      );
    }
  }
  return {
    ai: where(code, LOVABLE_AI),
    signIn: {
      password: code.some((f) => /\.auth\.(signInWithPassword|signUp)\b/.test(f.text)),
      providers: [...providers].sort(),
      lovableBroker: code.some((f) => /@lovable\.dev\/cloud-auth-js/.test(f.text)),
    },
    appEmails: where(code, /api\.lovable\.dev|x-lovable-signature/),
    connectors: [...connectors].map(([service, files]) => ({ service, files: [...files].sort() })),
    payments: where(code, /\bstripe\b|\bpaddle\b/i),
    scheduledJobs: [
      ...where(migrations, /cron\.schedule\s*\(/),
      ...where(code, /LOVABLE_CRON_SECRET/),
    ],
    uploads: [...where(code, /\.storage\s*\.\s*from\(/), ...where(migrations, /storage\.buckets/)],
    functions: (await localFunctions(ws.root)).map((fn) => fn.name).sort(),
    settings: await appSettings(ws.root),
  };
}

/** The scan's hints, and the facts Claude recorded, if it has. */
export async function moveFacts(
  ws: Workspace,
): Promise<{ hints: FactsHints; facts?: RecordedFacts }> {
  const state = await loadMove(ws.root);
  return { hints: await factsHints(ws), ...(state.facts ? { facts: state.facts } : {}) };
}

/** Record what Claude found (JSON on stdin). A second check replaces the first. */
export async function recordFacts(ws: Workspace, json: string): Promise<RecordedFacts> {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new ClodableError({
      code: "invalid-config",
      message: "The facts aren't JSON.",
      hint: "Pipe one JSON object to `move facts --set`, shaped as the move skill shows.",
    });
  }
  const parsed = AppFactsSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ClodableError({
      code: "invalid-config",
      message: "The facts don't have the expected shape.",
      details: parsed.error.issues
        .slice(0, 5)
        .map((i) => `${i.path.join(".") || "(top)"}: ${i.message}`)
        .join("; "),
      hint: "Fields: ai, signIn {email, google, apple, other}, appEmails, connectors, payments, scheduledJobs, uploads, notes.",
    });
  }
  const facts: RecordedFacts = { ...parsed.data, at: new Date().toISOString() };
  await updateMove(ws.root, (s) => {
    s.facts = facts;
  });
  return facts;
}

/** The facts in a few words, for the step's one line: "AI · Google sign-in · payments". */
export function factsSummary(facts: AppFacts): string {
  const parts = [
    ...(facts.ai.length > 0 ? ["AI"] : []),
    ...(facts.signIn.google ? ["Google sign-in"] : []),
    ...(facts.signIn.apple ? ["Apple sign-in"] : []),
    ...facts.signIn.other.map((p) => `${p} sign-in`),
    ...(facts.appEmails.length > 0 ? ["its own emails"] : []),
    ...[...new Set(facts.connectors.map((c) => c.service))],
    ...[...new Set(facts.payments.map((p) => p.provider))].map((p) => `payments (${p})`),
    ...(facts.scheduledJobs.length > 0 ? ["scheduled jobs"] : []),
    ...(facts.uploads.length > 0 ? ["uploads"] : []),
  ];
  return parts.length > 0 ? parts.join(" · ") : "Nothing beyond its data and its site";
}
