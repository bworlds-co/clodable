import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, normalize, relative, sep } from "node:path";
import { CloclodError } from "../errors.js";
import { type Flow, step } from "../events.js";
import type { SupabaseApi } from "./supabase-api.js";

/**
 * The app's backend functions (supabase/functions), deployed to the new project through Supabase's
 * API, all of them every time: deploying a few once left others running an old shared file, and
 * emails were refused. Each function's upload carries every local file it imports (`_shared`).
 */

export interface LocalFunction {
  name: string;
  entrypoint: string;
  /** Paths from the project root, as Supabase stores them. */
  files: string[];
  importMap?: string;
  verifyJwt: boolean;
}

/** Secrets every Supabase function gets on its own. */
const BUILT_IN = /^SUPABASE_/;
/** Lovable's own keys: Lovable never shows their values, and they only work on Lovable. */
const LOVABLE_OWN = /^LOVABLE_/;

const IMPORT =
  /(?:import|export)\s[^'"`;]*?from\s*["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)|import\s+["']([^"']+)["']/g;

/** `[functions.<name>] verify_jwt = false` in supabase/config.toml. */
async function jwtSettings(root: string): Promise<Map<string, boolean>> {
  const settings = new Map<string, boolean>();
  const path = join(root, "supabase", "config.toml");
  if (!existsSync(path)) return settings;
  let section: string | null = null;
  for (const line of (await readFile(path, "utf8")).split("\n")) {
    const header = line.match(/^\s*\[functions\.("?)([\w-]+)\1\]\s*$/);
    if (header) {
      section = header[2]!;
      continue;
    }
    if (/^\s*\[/.test(line)) {
      section = null;
      continue;
    }
    const value = line.match(/^\s*verify_jwt\s*=\s*(true|false)/);
    if (section && value) settings.set(section, value[1] === "true");
  }
  return settings;
}

export async function localFunctions(root: string): Promise<LocalFunction[]> {
  const base = join(root, "supabase", "functions");
  if (!existsSync(base)) return [];
  const settings = await jwtSettings(root);
  const out: LocalFunction[] = [];
  for (const entry of await readdir(base, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith("_") || entry.name.startsWith(".")) continue;
    const dir = join(base, entry.name);
    const index = ["index.ts", "index.tsx", "index.js", "index.mjs"].find((f) =>
      existsSync(join(dir, f)),
    );
    if (!index) continue;
    const entrypoint = join(dir, index);
    const files = new Set<string>();
    const walk = async (file: string) => {
      const key = relative(root, file).split(sep).join("/");
      if (files.has(key) || !existsSync(file)) return;
      files.add(key);
      if (!/\.(m?[jt]sx?)$/.test(file)) return;
      const text = await readFile(file, "utf8").catch(() => "");
      for (const match of text.matchAll(IMPORT)) {
        const spec = match[1] ?? match[2] ?? match[3];
        if (!spec || !(spec.startsWith("./") || spec.startsWith("../"))) continue;
        const target = normalize(join(dirname(file), spec));
        // Stay inside the project.
        if (relative(root, target).startsWith("..")) continue;
        await walk(target);
      }
    };
    await walk(entrypoint);
    const importMap = ["deno.json", "deno.jsonc", "import_map.json"]
      .map((f) => join(dir, f))
      .find((f) => existsSync(f));
    if (importMap) files.add(relative(root, importMap).split(sep).join("/"));
    out.push({
      name: entry.name,
      entrypoint: relative(root, entrypoint).split(sep).join("/"),
      files: [...files].sort(),
      ...(importMap ? { importMap: relative(root, importMap).split(sep).join("/") } : {}),
      verifyJwt: settings.get(entry.name) ?? true,
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** Secret names the functions read, minus the ones Supabase provides. */
export async function functionSecrets(root: string, functions: LocalFunction[]): Promise<string[]> {
  const names = new Set<string>();
  const seen = new Set<string>();
  for (const fn of functions) {
    for (const file of fn.files) {
      if (seen.has(file)) continue;
      seen.add(file);
      const text = await readFile(join(root, file), "utf8").catch(() => "");
      for (const match of text.matchAll(/Deno\.env\.get\(\s*["'`]([A-Z][A-Z0-9_]*)["'`]\s*\)/g)) {
        if (!BUILT_IN.test(match[1]!) && !LOVABLE_OWN.test(match[1]!)) names.add(match[1]!);
      }
    }
  }
  return [...names].sort();
}

/** Functions that receive Stripe's webhooks (they check its signature): their address changes. */
export async function stripeWebhooks(root: string, functions: LocalFunction[]): Promise<string[]> {
  const names: string[] = [];
  for (const fn of functions) {
    for (const file of fn.files) {
      if (file.includes("/_shared/")) continue;
      const text = await readFile(join(root, file), "utf8").catch(() => "");
      if (/stripe-signature|constructEvent(Async)?\(/i.test(text)) {
        names.push(fn.name);
        break;
      }
    }
  }
  return names.sort();
}

export interface DeployOutcome {
  deployed: string[];
  failed: string[];
  /** Secrets the functions read that the new project doesn't have yet. */
  missingSecrets: string[];
}

/** One function, with every local file it imports, as Supabase's API takes it. */
export async function uploadFunction(
  api: SupabaseApi,
  ref: string,
  root: string,
  fn: LocalFunction,
): Promise<void> {
  const files = await Promise.all(
    fn.files.map(async (path) => ({
      path,
      content: new Uint8Array(await readFile(join(root, path))),
    })),
  );
  await api.deployFunction(
    ref,
    fn.name,
    {
      name: fn.name,
      entrypoint_path: fn.entrypoint,
      ...(fn.importMap ? { import_map_path: fn.importMap } : {}),
      verify_jwt: fn.verifyJwt,
    },
    files,
  );
}

export async function* deployFunctions(
  api: SupabaseApi,
  ref: string,
  root: string,
): Flow<DeployOutcome> {
  const functions = await localFunctions(root);
  if (functions.length === 0) {
    throw new CloclodError({
      code: "move-not-ready",
      message: "This app has no backend functions to deploy.",
    });
  }
  const deployed: string[] = [];
  const failed: string[] = [];
  const problems: string[] = [];
  for (const [index, fn] of functions.entries()) {
    yield step(
      "move:functions",
      "running",
      "Deploying your backend functions",
      `${index + 1} of ${functions.length}: ${fn.name}`,
    );
    try {
      await uploadFunction(api, ref, root, fn);
      deployed.push(fn.name);
    } catch (error) {
      failed.push(fn.name);
      problems.push(
        `${fn.name}: ${error instanceof CloclodError ? (error.details ?? error.message) : String(error)}`,
      );
    }
  }
  // Every function is there and running, not only the ones that said so.
  const live = new Map((await api.functions(ref)).map((f) => [f.slug, f]));
  for (const name of deployed.splice(0)) {
    if (live.get(name)?.status === "ACTIVE") deployed.push(name);
    else failed.push(name);
  }
  const wanted = await functionSecrets(root, functions);
  const have = new Set(await api.secretNames(ref).catch(() => [] as string[]));
  const missingSecrets = wanted.filter((name) => !have.has(name));
  yield step(
    "move:functions",
    failed.length > 0 ? "failed" : "done",
    failed.length > 0 ? "Some backend functions didn't deploy" : "Deployed your backend functions",
    failed.length > 0 ? problems.join(" · ").slice(0, 500) : `${deployed.length} running`,
  );
  return { deployed, failed, missingSecrets };
}
